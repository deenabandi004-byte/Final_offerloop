"""
Interview prep routes
"""
import asyncio
import threading
from datetime import datetime

from firebase_admin import firestore, storage
from flask import Blueprint, jsonify, request

from app.config import INTERVIEW_PREP_CREDITS
from ..extensions import get_db, require_firebase_auth
from app.services.auth import check_and_reset_credits, deduct_credits_atomic
from app.utils.exceptions import ValidationError, OfferloopException, InsufficientCreditsError
from app.utils.validation import InterviewPrepRequest, validate_request
from app.services.interview_prep.job_posting_parser import parse_job_posting_url
from app.services.interview_prep.reddit_scraper import search_reddit
from app.services.interview_prep.content_processor import process_interview_content
from app.services.interview_prep.pdf_generator import generate_interview_prep_pdf

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

        # Step 2: Scrape Reddit with targeted queries
        print("Step 2: Scraping Reddit for interview posts...")
        prep_ref.update({"status": "scraping_reddit", "progress": "Searching Reddit for interview experiences..."})
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            reddit_posts = loop.run_until_complete(search_reddit(job_details))
        finally:
            loop.close()

        if not reddit_posts:
            print("❌ No Reddit posts found")
            # Use a more helpful error message
            if company_name and company_name != "Unknown":
                error_msg = f"No interview data found for {company_name}. They may be too new or small. Try a larger/more well-known company, or the role may be too specific."
            else:
                error_msg = "No interview data found for this company. They may be too new or small. Try a larger/more well-known company."
            prep_ref.update(
                {
                    "status": "failed",
                    "error": error_msg,
                }
            )
            return

        print(f"✅ Found {len(reddit_posts)} Reddit posts")
        prep_ref.update({"progress": "Processing insights..."})

        # Step 3: Process content with OpenAI
        print("Step 3: Processing content with OpenAI...")
        prep_ref.update({"status": "processing_content"})
        insights = process_interview_content(reddit_posts, job_details)

        if insights.get("error"):
            prep_ref.update(
                {
                    "status": "failed",
                    "error": insights.get("error", "Failed to process interview data"),
                }
            )
            return

        prep_ref.update({"insights": insights})

        # Step 4: Generate PDF
        print("Step 4: Generating PDF...")
        prep_ref.update({"status": "generating_pdf", "progress": "Generating your prep guide..."})

        try:
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
        
        job_posting_url = validated_data.get("job_posting_url")
        company_name = validated_data.get("company_name")
        job_title = validated_data.get("job_title")

        user_id = request.firebase_user.get("uid")
        user_email = request.firebase_user.get("email")

        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")

        # Check credits
        credits_available = 120
        if user_id:
            user_ref = db.collection("users").document(user_id)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                credits_available = check_and_reset_credits(user_ref, user_data)

                if credits_available < INTERVIEW_PREP_CREDITS:
                    raise InsufficientCreditsError(INTERVIEW_PREP_CREDITS, credits_available)

        # Create prep record
        prep_data = {
            "status": "processing",
            "createdAt": datetime.now().isoformat(),
            "userId": user_id,
            "userEmail": user_email,
        }
        
        if job_posting_url:
            prep_data["jobPostingUrl"] = job_posting_url
        else:
            # Manual input mode
            prep_data["companyName"] = company_name
            prep_data["jobTitle"] = job_title

        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("interview-preps")
            .document()
        )
        prep_ref.set(prep_data)
        prep_id = prep_ref.id

        # Start background processing
        thread = threading.Thread(
            target=process_interview_prep_background,
            args=(
                prep_id,
                job_posting_url,
                company_name,
                job_title,
                user_id,
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
            prep_data["progress"] = prep_data.get("progress", "Searching Reddit for interview experiences...")
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
    """Return Interview Prep PDF download URL"""
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

        if pdf_url:
            return jsonify({"pdfUrl": pdf_url}), 200

        if pdf_path:
            bucket = storage.bucket()
            blob = bucket.blob(pdf_path)
            if blob.exists():
                signed_url = blob.generate_signed_url(expiration=3600)
                return jsonify({"pdfUrl": signed_url}), 200

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

