"""
Interview prep routes
"""
import asyncio
import threading
from datetime import datetime

from firebase_admin import firestore, storage
from flask import Blueprint, jsonify, request

from app.config import INTERVIEW_PREP_CREDITS, TIER_CONFIGS
from ..extensions import get_db, require_firebase_auth
from app.services.auth import check_and_reset_credits, deduct_credits_atomic, check_and_reset_usage, can_access_feature
from app.utils.exceptions import ValidationError, OfferloopException, InsufficientCreditsError, AuthorizationError
from app.utils.validation import InterviewPrepRequest, validate_request
from app.services.interview_prep.job_posting_parser import parse_job_posting_url
from app.services.interview_prep.reddit_scraper import search_reddit
from app.services.interview_prep.content_aggregator import aggregate_content
from app.services.interview_prep.content_processor import process_interview_content, process_interview_content_v2
from app.services.interview_prep.pdf_generator import generate_interview_prep_pdf, generate_interview_prep_pdf_v2
from app.services.interview_prep.resume_parser import get_user_profile
from app.services.interview_prep.personalization import PersonalizationEngine

interview_prep_bp = Blueprint(
    "interview_prep", __name__, url_prefix="/api/interview-prep"
)


def _upload_pdf_to_storage(user_id: str, prep_id: str, pdf_bytes: bytes) -> dict:
    """
    Upload the generated PDF to Firebase Storage and return URLs.
    """
    bucket = storage.bucket()
    blob_path = f"interview_preps/{user_id}/{prep_id}.pdf"
    blob = bucket.blob(blob_path)
    blob.upload_from_string(pdf_bytes, content_type="application/pdf")
    try:
        blob.make_public()
        pdf_url = blob.public_url
    except Exception as exc:  # pragma: no cover
        print(f"⚠️ Failed to make PDF public: {exc}")
        pdf_url = blob.generate_signed_url(expiration=3600)

    return {"pdf_storage_path": blob_path, "pdf_url": pdf_url}


def _convert_normalized_to_reddit_format(normalized_content: list) -> list:
    """
    Convert normalized multi-source content to Reddit-like format for compatibility
    with existing process_interview_content function.
    
    Args:
        normalized_content: List of normalized content items from ContentAggregator
        
    Returns:
        List of items in Reddit-like format
    """
    converted = []
    for item in normalized_content:
        source = item.get("source", "unknown")
        metadata = item.get("metadata", {})
        
        # Extract upvotes from metadata if available (for Reddit posts)
        upvotes = metadata.get("upvotes", 0) if source == "reddit" else 0
        if upvotes == 0 and source == "reddit":
            # Fallback: estimate from score (score is normalized 0-1, multiply by 1000 for approximate upvotes)
            upvotes = int(item.get("score", 0) * 1000)
        
        # Convert to Reddit-like format
        reddit_like = {
            "post_id": item.get("id", "").replace(f"{source}_", ""),
            "post_title": item.get("title", ""),
            "post_body": item.get("content", ""),
            "url": item.get("source_url", ""),
            "date": item.get("date", ""),
            "upvotes": upvotes,
            "subreddit": metadata.get("subreddit", "unknown") if source == "reddit" else source,
            "top_comments": [],  # Comments not preserved in normalized format, but content includes them
            # Add source info for tracking (processor may use this)
            "_source": source,
            "_original_metadata": metadata,
        }
        converted.append(reddit_like)
    
    return converted


def process_interview_prep_background(
    prep_id,
    job_posting_url,
    company_name,
    job_title,
    user_id,
    credits_available,
):
    """Background worker to process interview prep."""
    try:
        db = get_db()
        print(f"\n=== PROCESSING INTERVIEW PREP {prep_id} ===")

        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("interview-preps")
            .document(prep_id)
        )

        # Step 1: Parse job posting or use manual input
        job_details = None
        
        if job_posting_url:
            print("Step 1: Parsing job posting...")
            print(f"Job posting URL: {job_posting_url}")
            prep_ref.update({"status": "parsing_job_posting", "progress": "Analyzing job posting..."})
            
            # Run async function in sync context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                job_details = loop.run_until_complete(parse_job_posting_url(job_posting_url))
                print(f"Parsed job details: {job_details}")
            except Exception as e:
                error_msg = str(e)
                print(f"❌ Job posting parsing failed: {error_msg}")
                # Set error but don't fail - allow fallback to manual input
                prep_ref.update({
                    "status": "parsing_failed",
                    "error": error_msg,
                    "needsManualInput": True
                })
                print(f"URL parsing failed, will need manual input")
                return
            finally:
                loop.close()
        else:
            # Manual input mode
            print("Step 1: Using manual input...")
            prep_ref.update({"status": "processing", "progress": "Using provided job details..."})
            
            # Create job_details from manual input
            company_domain = company_name.lower().replace(" ", "").replace(".", "") + ".com"
            job_details = {
                "company_name": company_name,
                "company_domain": company_domain,
                "job_title": job_title,
                "level": None,
                "team_division": None,
                "location": None,
                "remote_policy": None,
                "required_skills": [],
                "preferred_skills": [],
                "years_experience": None,
                "job_type": "Full-time",
                "key_responsibilities": [],
                "interview_hints": None,
                "salary_range": None,
                "role_category": "Other"
            }
        
        # Validate job_details exists
        if not job_details:
            prep_ref.update({"status": "failed", "error": "Failed to get job details"})
            return

        company_name = job_details.get("company_name")
        company_domain = job_details.get("company_domain", "")
        job_title = job_details.get("job_title", "")
        
        # Validate that we have essential information
        if not company_name or company_name == "None" or company_name.strip() == "":
            error_msg = "Could not extract company name from the job posting. The URL may not be a standard job posting format, or the page structure may not be recognized. Try a job posting from LinkedIn, Greenhouse, Lever, or the company's career page."
            print(f"❌ {error_msg}")
            prep_ref.update({"status": "failed", "error": error_msg})
            return
        
        if not job_title or job_title.strip() == "":
            error_msg = "Could not extract job title from the job posting. Please try a different job posting URL."
            print(f"❌ {error_msg}")
            prep_ref.update({"status": "failed", "error": error_msg})
            return
        
        print(f"✅ Using job: {job_title} at {company_name}")
        prep_ref.update({
            "jobDetails": job_details,
            "status": "extracting_requirements",
            "progress": "Extracting role requirements..."
        })

        # Step 2: Gather content from all sources (Reddit, YouTube, Glassdoor)
        normalized_content_v2 = None
        stats = {}
        
        print("Step 2: Gathering content from all sources (Reddit, YouTube, Glassdoor)...")
        prep_ref.update({"status": "scraping_reddit", "progress": "Searching multiple sources for interview experiences..."})
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            aggregated_content, stats = loop.run_until_complete(
                aggregate_content(job_details, max_items=50, timeout_seconds=180)
            )
            
            # Log source status for debugging
            sources_status = stats.get("sources_status", {})
            by_source = stats.get("by_source", {})
            print(f"✅ Content aggregation complete:")
            print(f"   - Reddit: {by_source.get('reddit', 0)} items (status: {sources_status.get('reddit', 'unknown')})")
            print(f"   - YouTube: {by_source.get('youtube', 0)} items (status: {sources_status.get('youtube', 'unknown')})")
            print(f"   - Glassdoor: {by_source.get('glassdoor', 0)} items (status: {sources_status.get('glassdoor', 'unknown')})")
            print(f"   - Total: {stats.get('total_items', 0)} items from {stats.get('total_sources', 0)} sources")
            
            # Store normalized content for v2 processor
            normalized_content_v2 = aggregated_content
            
            # Also convert to Reddit-like format for fallback compatibility
            content_for_processing = _convert_normalized_to_reddit_format(aggregated_content)
            
            # Fallback to Reddit-only if aggregation returned no content
            if not content_for_processing:
                print("⚠️ Multi-source aggregation returned no content, falling back to Reddit-only...")
                reddit_posts = loop.run_until_complete(search_reddit(job_details))
                if not reddit_posts:
                    error_msg = f"No interview data found for {company_name}. They may be too new or small. Try a larger/more well-known company, or the role may be too specific."
                    prep_ref.update({"status": "failed", "error": error_msg})
                    return
                # Use Reddit posts directly (they're already in the right format)
                content_for_processing = reddit_posts
                normalized_content_v2 = None  # Clear normalized content since we're using Reddit-only
        except Exception as agg_error:
            print(f"⚠️ Multi-source aggregation failed: {agg_error}")
            import traceback
            traceback.print_exc()
            print("   Falling back to Reddit-only...")
            # Fallback to Reddit-only
            try:
                reddit_posts = loop.run_until_complete(search_reddit(job_details))
                if not reddit_posts:
                    error_msg = f"No interview data found for {company_name}. They may be too new or small. Try a larger/more well-known company, or the role may be too specific."
                    prep_ref.update({"status": "failed", "error": error_msg})
                    return
                # Use Reddit posts directly (they're already in the right format)
                content_for_processing = reddit_posts
                normalized_content_v2 = None  # Clear normalized content since we're using Reddit-only
            except Exception as reddit_error:
                print(f"❌ Reddit fallback also failed: {reddit_error}")
                import traceback
                traceback.print_exc()
                prep_ref.update({"status": "failed", "error": f"Failed to gather interview data: {str(reddit_error)}"})
                return
        finally:
            loop.close()

        print(f"✅ Found {len(content_for_processing)} content items for processing")
        prep_ref.update({"progress": "Processing insights..."})

        # Step 3: Process content with OpenAI
        print("Step 3: Processing content with OpenAI...")
        prep_ref.update({"status": "processing_content"})
        
        # Use v2 processor if we have normalized content from multi-source aggregation
        use_v2 = normalized_content_v2 is not None
        
        if use_v2:
            # Use the normalized content directly for v2 processor
            source_stats = stats.get("by_source", {}) if stats else {}
            insights = process_interview_content_v2(normalized_content_v2, job_details, source_stats)
        else:
            # Use v1 processor with Reddit-like format
            insights = process_interview_content(content_for_processing, job_details)

        if insights.get("error"):
            prep_ref.update(
                {
                    "status": "failed",
                    "error": insights.get("error", "Failed to process interview data"),
                }
            )
            return

        prep_ref.update({"insights": insights})

        # Step 4: Get user profile and generate personalization (if v2)
        fit_analysis = {"is_personalized": False, "fit_score": None, "strengths": [], "gaps": []}
        story_bank = {"stories": [], "personalized": False}
        prep_plan = {"weeks": []}
        user_profile = {}
        
        if use_v2:
            print("Step 4: Loading user profile and generating personalization...")
            prep_ref.update({"progress": "Personalizing your prep guide..."})
            
            try:
                user_profile = get_user_profile(user_id)
                profile_source = user_profile.get("_source", "none")
                print(f"Profile source: {profile_source}")
                
                # Generate personalization using existing engine
                personalization_engine = PersonalizationEngine()
                loop_personal = asyncio.new_event_loop()
                asyncio.set_event_loop(loop_personal)
                try:
                    user_context = loop_personal.run_until_complete(
                        personalization_engine.get_user_context(user_id, db)
                    )
                    
                    # Generate fit analysis
                    fit_analysis = personalization_engine.generate_fit_analysis(user_context, job_details)
                    
                    # Generate story bank
                    questions_dict = {
                        "behavioral": insights.get("behavioral_questions", [])
                    }
                    story_bank = personalization_engine.generate_story_bank(user_context, job_details, questions_dict)
                    
                    # Generate prep plan
                    prep_plan = personalization_engine.generate_personalized_prep_plan(user_context, job_details, fit_analysis)
                    
                    if fit_analysis.get("is_personalized") or fit_analysis.get("personalized"):
                        print(f"✓ Personalized content generated (fit score: {fit_analysis.get('fit_score')}%)")
                    else:
                        print("⚠ Using generic content (no profile data)")
                finally:
                    loop_personal.close()
            except Exception as personal_error:
                print(f"⚠ Personalization failed: {personal_error}")
                import traceback
                traceback.print_exc()
                # Continue without personalization

        # Step 5: Generate PDF
        print("Step 5: Generating PDF...")
        prep_ref.update({"status": "generating_pdf", "progress": "Generating your prep guide..."})

        try:
            if use_v2:
                pdf_buffer = generate_interview_prep_pdf_v2(
                    prep_id=prep_id,
                    insights=insights,
                    fit_analysis=fit_analysis,
                    story_bank=story_bank,
                    prep_plan=prep_plan,
                    job_details=job_details,
                    user_profile=user_profile if use_v2 else None,
                )
            else:
                pdf_buffer = generate_interview_prep_pdf(
                    prep_id=prep_id,
                    job_details=job_details,
                    insights=insights,
                )

            pdf_bytes = pdf_buffer.getvalue()
            
            # Validate PDF was generated correctly (should be at least 1KB for a real PDF)
            if len(pdf_bytes) < 1024:
                raise Exception(f"PDF generation failed: generated PDF is too small ({len(pdf_bytes)} bytes). This usually indicates an error during PDF creation.")
            
            upload_result = _upload_pdf_to_storage(user_id, prep_id, pdf_bytes)
        except Exception as pdf_error:
            error_msg = f"Failed to generate PDF: {str(pdf_error)}"
            print(f"❌ {error_msg}")
            prep_ref.update({
                "status": "failed",
                "error": error_msg,
            })
            return

        # Step 5: Mark as completed
        print("Step 5: Marking as completed...")
        prep_ref.update(
            {
                "status": "completed",
                "completedAt": datetime.now().isoformat(),
                "pdfUrl": upload_result["pdf_url"],
                "pdfStoragePath": upload_result["pdf_storage_path"],
            }
        )

        # Step 6: Deduct credits atomically
        print("Step 6: Deducting credits...")
        success, new_credits = deduct_credits_atomic(user_id, INTERVIEW_PREP_CREDITS, "interview_prep")
        if not success:
            print(f"⚠️ Credit deduction failed - user may have insufficient credits")
        else:
            print(f"✅ Credits deducted: {credits_available} -> {new_credits}")
        
        # Step 7: Increment usage counter
        print("Step 7: Incrementing usage counter...")
        try:
            user_ref = db.collection("users").document(user_id)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                current_usage = user_data.get("interviewPrepsUsed", 0)
                user_ref.update({
                    "interviewPrepsUsed": current_usage + 1,
                    "updatedAt": datetime.now().isoformat()
                })
                print(f"✅ Usage counter incremented: {current_usage} -> {current_usage + 1}")
        except Exception as usage_error:
            print(f"⚠️ Failed to increment usage counter: {usage_error}")
        
        print(f"=== INTERVIEW PREP {prep_id} COMPLETED SUCCESSFULLY ===\n")

    except Exception as e:
        print(f"❌ Interview prep failed: {e}")
        import traceback

        traceback.print_exc()

        try:
            prep_ref.update({"status": "failed", "error": str(e)})
        except Exception:
            pass


@interview_prep_bp.route("/generate", methods=["POST"])
@require_firebase_auth
def generate_interview_prep():
    """Create a new interview prep with validation"""
    try:
        print("\n=== INTERVIEW PREP START ===")
        db = get_db()

        data = request.get_json() or {}
        
        # Validate input
        try:
            validated_data = validate_request(InterviewPrepRequest, data)
        except ValidationError as ve:
            return ve.to_response()
        
        # CRITICAL: Force string conversion to prevent HttpUrl objects reaching Firestore
        job_posting_url_raw = validated_data.get("job_posting_url")
        job_posting_url = str(job_posting_url_raw) if job_posting_url_raw is not None else None
        company_name = str(validated_data.get("company_name")) if validated_data.get("company_name") else None
        job_title = str(validated_data.get("job_title")) if validated_data.get("job_title") else None
        
        # Debug logging
        print(f"[Interview Prep] URL type after conversion: {type(job_posting_url)}")
        print(f"[Interview Prep] URL value: {job_posting_url}")

        user_id = request.firebase_user.get("uid")
        user_email = request.firebase_user.get("email")

        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")

        # Check credits and feature access
        credits_available = 120
        if user_id:
            user_ref = db.collection("users").document(user_id)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                credits_available = check_and_reset_credits(user_ref, user_data)
                
                # Check and reset usage counters (for Pro/Elite monthly reset)
                check_and_reset_usage(user_ref, user_data)
                user_doc = user_ref.get()  # Refresh after potential reset
                user_data = user_doc.to_dict()

                # Check credits
                if credits_available < INTERVIEW_PREP_CREDITS:
                    raise InsufficientCreditsError(INTERVIEW_PREP_CREDITS, credits_available)
                
                # Check feature access (interview prep limit)
                tier = user_data.get("subscriptionTier") or user_data.get("tier", "free")
                tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS["free"])
                allowed, reason = can_access_feature(tier, "interview_prep", user_data, tier_config)
                
                if not allowed:
                    interview_limit = tier_config.get("interview_preps", 0)
                    if interview_limit == "unlimited":
                        # Shouldn't happen, but handle gracefully
                        pass
                    else:
                        current_usage = user_data.get("interviewPrepsUsed", 0)
                        error_msg = f"Interview Prep limit reached. You've used {current_usage} of {interview_limit} allowed."
                        raise AuthorizationError(
                            error_msg,
                            details={
                                "current_usage": current_usage,
                                "limit": interview_limit,
                                "tier": tier,
                                "reason": reason
                            }
                        )

        # Create prep record - ALL values must be Firestore-compatible primitives
        prep_data = {
            "status": "processing",
            "createdAt": datetime.now().isoformat(),
            "userId": str(user_id) if user_id else None,
            "userEmail": str(user_email) if user_email else None,
        }
        
        if job_posting_url:
            # CRITICAL: Triple-check string conversion for Firestore
            url_as_string = str(job_posting_url)
            # Verify it's actually a string now
            assert isinstance(url_as_string, str), f"URL conversion failed: got {type(url_as_string)}"
            print(f"[Interview Prep] Saving URL to Firestore - type: {type(url_as_string)}, value: {url_as_string[:100]}...")
            prep_data["jobPostingUrl"] = url_as_string
        else:
            # Manual input mode
            prep_data["companyName"] = str(company_name) if company_name else None
            prep_data["jobTitle"] = str(job_title) if job_title else None

        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("interview-preps")
            .document()
        )
        prep_ref.set(prep_data)
        prep_id = prep_ref.id

        # Start background processing
        # CRITICAL: Ensure all arguments are primitive types for thread safety
        job_url_str = str(job_posting_url) if job_posting_url else None
        company_name_str = str(company_name) if company_name else None
        job_title_str = str(job_title) if job_title else None
        user_id_str = str(user_id) if user_id else None
        
        # Verify types before passing to thread
        print(f"[Interview Prep] Passing to thread - URL type: {type(job_url_str)}, value: {job_url_str}")
        
        thread = threading.Thread(
            target=process_interview_prep_background,
            args=(
                prep_id,
                job_url_str,
                company_name_str,
                job_title_str,
                user_id_str,
                credits_available,
            ),
        )
        thread.daemon = True
        thread.start()

        return jsonify({
            "id": prep_id,
            "status": "processing",
            "message": "Analyzing job posting and gathering interview insights..."
        }), 200

    except (ValidationError, InsufficientCreditsError, OfferloopException):
        raise
    except Exception as e:
        print(f"Error: {e}")
        raise OfferloopException(f"Failed to create interview prep: {str(e)}", error_code="INTERVIEW_PREP_ERROR")


@interview_prep_bp.route("/status/<prep_id>", methods=["GET"])
@require_firebase_auth
def get_interview_prep_status(prep_id):
    """Get interview prep status"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")
        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("interview-preps")
            .document(prep_id)
        )
        prep_doc = prep_ref.get()

        if not prep_doc.exists:
            return jsonify({"error": "Prep not found"}), 404

        prep_data = prep_doc.to_dict()
        prep_data["id"] = prep_id
        
        # Include progress message based on status
        status = prep_data.get("status", "unknown")
        if status == "processing":
            prep_data["progress"] = prep_data.get("progress", "Processing...")
        elif status == "parsing_job_posting":
            prep_data["progress"] = prep_data.get("progress", "Analyzing job posting...")
        elif status == "scraping_reddit":
            prep_data["progress"] = prep_data.get("progress", "Searching for interview experiences...")
        elif status == "processing_content":
            prep_data["progress"] = prep_data.get("progress", "Processing insights...")
        elif status == "generating_pdf":
            prep_data["progress"] = prep_data.get("progress", "Generating your prep guide...")
        elif status == "failed":
            # Ensure error message is included
            if "error" not in prep_data or not prep_data.get("error"):
                prep_data["error"] = "Generation failed. Please try again."
            prep_data["progress"] = prep_data.get("progress", "Generation failed")
        
        # Add backward compatibility fields for frontend
        job_details = prep_data.get("jobDetails", {})
        if job_details:
            prep_data["companyName"] = job_details.get("company_name", "")
            prep_data["companyDomain"] = job_details.get("company_domain", "")

        return jsonify(prep_data), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@interview_prep_bp.route("/download/<prep_id>", methods=["GET"])
@require_firebase_auth
def download_interview_prep_pdf(prep_id):
    """Return Interview Prep PDF download URL with company name and job title for filename"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")
        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("interview-preps")
            .document(prep_id)
        )
        prep_doc = prep_ref.get()

        if not prep_doc.exists:
            return jsonify({"error": "Prep not found"}), 404

        prep_data = prep_doc.to_dict()
        pdf_url = prep_data.get("pdfUrl")
        pdf_path = prep_data.get("pdfStoragePath")
        
        # Extract company name and job title for filename
        company_name = ""
        job_title = ""
        job_details = prep_data.get("jobDetails", {})
        if job_details:
            company_name = job_details.get("company_name", "") or prep_data.get("companyName", "")
            job_title = job_details.get("job_title", "") or prep_data.get("jobTitle", "")
        else:
            # Fallback to direct fields if jobDetails doesn't exist
            company_name = prep_data.get("companyName", "")
            job_title = prep_data.get("jobTitle", "")

        if pdf_url:
            return jsonify({
                "pdfUrl": pdf_url,
                "companyName": company_name,
                "jobTitle": job_title
            }), 200

        if pdf_path:
            bucket = storage.bucket()
            blob = bucket.blob(pdf_path)
            if blob.exists():
                signed_url = blob.generate_signed_url(expiration=3600)
                return jsonify({
                    "pdfUrl": signed_url,
                    "companyName": company_name,
                    "jobTitle": job_title
                }), 200

        return jsonify({"error": "PDF not found"}), 404

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500


@interview_prep_bp.route("/history", methods=["GET"])
@require_firebase_auth
def get_interview_prep_history():
    """Get interview prep history"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")
        limit = request.args.get("limit", 10, type=int)

        preps_ref = (
            db.collection("users")
            .document(user_id)
            .collection("interview-preps")
        )
        preps = (
            preps_ref.order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )

        history = []
        for prep in preps:
            prep_data = prep.to_dict()
            job_details = prep_data.get("jobDetails", {})
            history.append({
                "id": prep.id,
                "companyName": job_details.get("company_name") or prep_data.get("companyName", ""),
                "jobTitle": job_details.get("job_title") or "",
                "status": prep_data.get("status", "unknown"),
                "createdAt": prep_data.get("createdAt", ""),
                "pdfUrl": prep_data.get("pdfUrl"),
                "error": prep_data.get("error", ""),
            })

        return jsonify({"history": history}), 200

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"history": []}), 200

