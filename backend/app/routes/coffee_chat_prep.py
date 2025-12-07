"""
Coffee chat prep routes
"""
import threading
from datetime import datetime

from firebase_admin import firestore, storage
from flask import Blueprint, jsonify, request

from app.config import COFFEE_CHAT_CREDITS
from ..extensions import get_db, require_firebase_auth
from app.services.auth import check_and_reset_credits, deduct_credits_atomic
from app.utils.exceptions import ValidationError, OfferloopException, InsufficientCreditsError
from app.utils.validation import CoffeeChatPrepRequest, validate_request
from app.services.coffee_chat import (
    fetch_serp_research,
    format_news_for_storage,
    infer_hometown_from_education,
)
from app.services.pdl_client import enrich_linkedin_profile
from app.services.pdf_builder import generate_coffee_chat_pdf
from app.utils.coffee_chat_prep import (
    generate_coffee_chat_questions,
    generate_coffee_chat_similarity,
)
from app.utils.users import parse_resume_info

coffee_chat_bp = Blueprint(
    "coffee_chat_prep", __name__, url_prefix="/api/coffee-chat-prep"
)


def _prepare_context(contact_data: dict) -> dict:
    """
    Derive division, office, industry and education inputs from contact data.
    """
    location_parts = []
    city = contact_data.get("city") or contact_data.get("City")
    state = contact_data.get("state") or contact_data.get("State")
    if city:
        location_parts.append(city)
    if state:
        location_parts.append(state)
    composite_location = ", ".join(location_parts) or contact_data.get("location", "")

    division = (
        contact_data.get("Group")
        or contact_data.get("department")
        or contact_data.get("jobTitle", "")
    )
    industry = (
        contact_data.get("industry")
        or contact_data.get("Industry")
        or contact_data.get("Group")
        or "General Business"
    )

    return {
        "company": contact_data.get("company", ""),
        "division": division or "",
        "office": composite_location or "",
        "industry": industry or "",
        "education": contact_data.get("education", []) or [],
        "city": city,
        "state": state,
        "location": composite_location,
    }


def _upload_pdf_to_storage(user_id: str, prep_id: str, pdf_bytes: bytes) -> dict:
    """
    Upload the generated PDF to Firebase Storage and return URLs.
    """
    bucket = storage.bucket()
    blob_path = f"coffee_chat_preps/{user_id}/{prep_id}.pdf"
    blob = bucket.blob(blob_path)
    blob.upload_from_string(pdf_bytes, content_type="application/pdf")
    try:
        blob.make_public()
        pdf_url = blob.public_url
    except Exception as exc:  # pragma: no cover
        print(f"⚠️ Failed to make PDF public: {exc}")
        pdf_url = blob.generate_signed_url(expiration=3600)

    return {"pdf_storage_path": blob_path, "pdf_url": pdf_url}


def process_coffee_chat_prep_background(
    prep_id,
    linkedin_url,
    user_id,
    credits_available,
    resume_text,
    extra_context=None,
    user_profile=None,
):
    """Background worker to process coffee chat prep."""
    try:
        db = get_db()
        print(f"\n=== PROCESSING PREP {prep_id} ===")

        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("coffee-chat-preps")
            .document(prep_id)
        )

        # Step 1: Enrich LinkedIn profile
        print("Step 1: Enriching LinkedIn profile...")
        prep_ref.update({"status": "enriching_profile"})
        contact_data = enrich_linkedin_profile(linkedin_url)

        if not contact_data:
            print("❌ Failed to enrich profile")
            prep_ref.update(
                {
                    "status": "failed",
                    "error": "Could not enrich LinkedIn profile. Please check the URL and try again.",
                }
            )
            return

        prep_ref.update({"contactData": contact_data})

        # Step 2: Fetch research via SERP
        print("Step 2: Researching division news...")
        prep_ref.update({"status": "fetching_news"})
        context = _prepare_context(contact_data)
        extra_context = extra_context or {}
        if extra_context:
            context.update({k: v for k, v in extra_context.items() if v})

        news_items, industry_summary = fetch_serp_research(
            company=context["company"],
            division=context["division"],
            office=context["office"],
            industry=context["industry"],
            time_window=extra_context.get("time_window", "last 90 days")
            if extra_context
            else "last 90 days",
            geo=extra_context.get("geo", "us") if extra_context else "us",
            language=extra_context.get("language", "en") if extra_context else "en",
        )

        print(f"✅ Found {len(news_items)} curated items")

        # Step 3: Build user context from resume or stored profile
        print("Step 3: Building user context...")
        if resume_text:
            user_data = parse_resume_info(resume_text)
        else:
            resume_parsed = (user_profile or {}).get("resumeParsed") if user_profile else {}
            user_data = {
                "name": (
                    (resume_parsed or {}).get("name")
                    or " ".join(
                        [
                            (user_profile or {}).get("firstName", ""),
                            (user_profile or {}).get("lastName", ""),
                        ]
                    ).strip()
                    or (user_profile or {}).get("name", "")
                ),
                "university": (resume_parsed or {}).get("university")
                or (user_profile or {}).get("university", ""),
                "major": (resume_parsed or {}).get("major")
                or (user_profile or {}).get("fieldOfStudy")
                or (user_profile or {}).get("major", ""),
                "year": (resume_parsed or {}).get("year")
                or (user_profile or {}).get("graduationYear")
                or (user_profile or {}).get("year", ""),
            }

        if user_profile:
            prep_ref.update({"userContext": user_data})

        # Step 4: Hometown inference
        print("Step 4: Inferring hometown from education history...")
        prep_ref.update({"status": "extracting_hometown"})
        hometown = infer_hometown_from_education(context["education"])
        if hometown:
            contact_data["hometown"] = hometown

        # Step 5: Generate similarity + questions
        print("Step 5: Generating similarity and questions...")
        prep_ref.update({"status": "generating_content"})

        similarity = generate_coffee_chat_similarity(user_data, contact_data)
        questions = generate_coffee_chat_questions(contact_data, user_data)

        # Step 6: Generate PDF
        print("Step 6: Generating PDF...")
        prep_ref.update({"status": "generating_pdf"})

        pdf_buffer = generate_coffee_chat_pdf(
            prep_id=prep_id,
            contact_data=contact_data,
            news_items=format_news_for_storage(news_items),
            industry_summary=industry_summary,
            similarity_summary=similarity,
            questions=questions,
            hometown=hometown,
            context=context,
        )

        pdf_bytes = pdf_buffer.getvalue()
        upload_result = _upload_pdf_to_storage(user_id, prep_id, pdf_bytes)

        # Step 7: Mark as completed
        print("Step 7: Marking as completed...")
        prep_ref.update(
            {
                "status": "completed",
                "completedAt": datetime.now().isoformat(),
                "companyNews": format_news_for_storage(news_items),
                "industrySummary": industry_summary,
                "similaritySummary": similarity,
                "coffeeQuestions": questions,
                "hometown": hometown,
                "pdfUrl": upload_result["pdf_url"],
                "pdfStoragePath": upload_result["pdf_storage_path"],
                "context": context,
            }
        )

        # Step 8: Deduct credits atomically
        print("Step 8: Deducting credits...")
        success, new_credits = deduct_credits_atomic(user_id, COFFEE_CHAT_CREDITS, "coffee_chat_prep")
        if not success:
            print(f"⚠️ Credit deduction failed - user may have insufficient credits")
        else:
            print(f"✅ Credits deducted: {credits_available} -> {new_credits}")
        print(f"=== PREP {prep_id} COMPLETED SUCCESSFULLY ===\n")

    except Exception as e:
        print(f"❌ Coffee chat prep failed: {e}")
        import traceback

        traceback.print_exc()

        try:
            prep_ref.update({"status": "failed", "error": str(e)})
        except Exception:
            pass


@coffee_chat_bp.route("", methods=["POST"])
@require_firebase_auth
def create_coffee_chat_prep():
    """Create a new coffee chat prep"""
    try:
        print("\n=== COFFEE CHAT PREP START ===")
        db = get_db()

        data = request.get_json() or {}
        linkedin_url = data.get("linkedinUrl", "").strip()

        if not linkedin_url:
            return jsonify({"error": "LinkedIn URL is required"}), 400

        user_id = request.firebase_user.get("uid")
        user_email = request.firebase_user.get("email")

        # Check credits
        credits_available = 120
        if db and user_id:
            user_ref = db.collection("users").document(user_id)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                credits_available = check_and_reset_credits(user_ref, user_data)

                if credits_available < COFFEE_CHAT_CREDITS:
                    return (
                        jsonify(
                            {
                                "error": f"Insufficient credits. You need {COFFEE_CHAT_CREDITS} credits.",
                                "credits_needed": COFFEE_CHAT_CREDITS,
                                "current_credits": credits_available,
                            }
                        ),
                        400,
                    )

        # Get resume
        resume_text = None
        user_profile_data: dict = {}
        if db and user_id:
            user_doc = db.collection("users").document(user_id).get()
            if user_doc.exists:
                user_profile_data = user_doc.to_dict() or {}
                resume_text = user_profile_data.get("resumeText")

        has_profile_fallback = any(
            [
                resume_text,
                (user_profile_data.get("resumeParsed") if user_profile_data else None),
                (user_profile_data.get("firstName") if user_profile_data else None),
                (user_profile_data.get("name") if user_profile_data else None),
            ]
        )

        if not has_profile_fallback:
            return (
                jsonify(
                    {
                        "error": "Please upload your resume in Account Settings first.",
                        "needsResume": True,
                    }
                ),
                400,
            )

        # Create prep record
        prep_data = {
            "linkedinUrl": linkedin_url,
            "status": "processing",
            "createdAt": datetime.now().isoformat(),
            "userId": user_id,
            "userEmail": user_email,
        }

        prep_ref = (
            db.collection("users").document(user_id).collection("coffee-chat-preps").document()
        )
        prep_ref.set(prep_data)
        prep_id = prep_ref.id

        extra_context = {
            "time_window": validated_data.get("timeWindow"),
            "geo": validated_data.get("geo"),
            "language": validated_data.get("language"),
            "division": validated_data.get("division"),
            "office": validated_data.get("office"),
            "industry": validated_data.get("industry"),
        }

        # Start background processing
        try:
            process_coffee_chat_prep_background(
                prep_id,
                linkedin_url,
                user_id,
                credits_available,
                resume_text,
                extra_context,
                user_profile_data,
            )
            
            # Fetch the completed prep data
            prep_doc = prep_ref.get()
            if prep_doc.exists:
                prep_data = prep_doc.to_dict()
                prep_data['id'] = prep_id
                prep_data['prepId'] = prep_id
                
                return jsonify(prep_data), 200
            else:
                return jsonify({"error": "Prep processing failed"}), 500
                
        except Exception as processing_error:
            print(f"❌ Processing error: {processing_error}")
            return jsonify({"error": str(processing_error)}), 500

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500



@coffee_chat_bp.route("/history", methods=["GET"])
@require_firebase_auth
def get_coffee_chat_history():
    """Get recent coffee chat prep history"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")
        limit = request.args.get("limit", 5, type=int)

        preps_ref = (
            db.collection("users").document(user_id).collection("coffee-chat-preps")
        )
        preps = (
            preps_ref.order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )

        history = []
        for prep in preps:
            prep_data = prep.to_dict()
            contact_data = prep_data.get("contactData", {})
            history.append({
                "id": prep.id,
                "contactName": f"{contact_data.get('firstName', '')} {contact_data.get('lastName', '')}".strip()
                or "Unknown",
                "company": contact_data.get("company", ""),
                "jobTitle": contact_data.get("jobTitle", ""),
                "status": prep_data.get("status", "unknown"),
                "createdAt": prep_data.get("createdAt", ""),
                "pdfUrl": prep_data.get("pdfUrl"),
                "error": prep_data.get("error", ""),
            })

        return jsonify({"history": history}), 200

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"history": []}), 200


@coffee_chat_bp.route("/all", methods=["GET"])
@require_firebase_auth
def get_all_coffee_chat_preps():
    """Get all coffee chat preps"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")
        preps_ref = (
            db.collection("users").document(user_id).collection("coffee-chat-preps")
        )
        preps = preps_ref.order_by("createdAt", direction=firestore.Query.DESCENDING).stream()

        all_preps = []
        for prep in preps:
            prep_data = prep.to_dict()
            contact_data = prep_data.get("contactData", {})

            all_preps.append({
                "id": prep.id,
                "contactName": f"{contact_data.get('firstName', '')} {contact_data.get('lastName', '')}".strip()
                or "Unknown",
                "company": contact_data.get("company", ""),
                "jobTitle": contact_data.get("jobTitle", ""),
                "linkedinUrl": prep_data.get("linkedinUrl", ""),
                "status": prep_data.get("status"),
                "createdAt": prep_data.get("createdAt", ""),
                "pdfUrl": prep_data.get("pdfUrl"),
                "error": prep_data.get("error", ""),
            })

        return jsonify({"preps": all_preps})

    except Exception as e:
        print(f"Error getting all coffee chat preps: {e}")
        import traceback
        traceback.print_exc()
        from app.utils.exceptions import OfferloopException
        raise OfferloopException(f"Failed to load coffee chat preps: {str(e)}", error_code="COFFEE_CHAT_PREPS_ERROR")


@coffee_chat_bp.route("/<prep_id>/download", methods=["GET"])
@require_firebase_auth
def download_coffee_chat_pdf(prep_id):
    """Return Coffee Chat PDF download URL"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")
        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("coffee-chat-preps")
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


@coffee_chat_bp.route("/<prep_id>", methods=["GET"])
@require_firebase_auth
def get_coffee_chat_prep(prep_id):
    """Get prep status"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")
        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("coffee-chat-preps")
            .document(prep_id)
        )
        prep_doc = prep_ref.get()

        if not prep_doc.exists:
            return jsonify({"error": "Prep not found"}), 404

        prep_data = prep_doc.to_dict()
        prep_data["id"] = prep_id

        return jsonify(prep_data), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@coffee_chat_bp.route("/<prep_id>", methods=["DELETE"])
@require_firebase_auth
def delete_coffee_chat_prep(prep_id):
    """Delete a coffee chat prep"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")
        
        print(f"🗑️ DELETE request for prep_id: {prep_id}")
        print(f"🗑️ User ID: {user_id}")
        
        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("coffee-chat-preps")
            .document(prep_id)
        )
        prep_doc = prep_ref.get()

        print(f"🗑️ Prep exists: {prep_doc.exists}")
        
        if not prep_doc.exists:
            # List all preps for this user for debugging
            all_preps = db.collection("users").document(user_id).collection("coffee-chat-preps").stream()
            prep_ids = [p.id for p in all_preps]
            print(f"🗑️ Available prep IDs for user: {prep_ids}")
            return jsonify({"error": f"Prep not found. Available IDs: {prep_ids}"}), 404

        prep_data = prep_doc.to_dict()
        pdf_path = prep_data.get("pdfStoragePath")
        if pdf_path:
            try:
                bucket = storage.bucket()
                blob = bucket.blob(pdf_path)
                if blob.exists():
                    blob.delete()
                    print(f"🗑️ Deleted PDF at: {pdf_path}")
            except Exception as e:
                print(f"🗑️ Failed to delete PDF: {e}")
                pass

        prep_ref.delete()
        print(f"🗑️ Successfully deleted prep: {prep_id}")

        return jsonify({"message": "Prep deleted successfully"})

    except Exception as e:
        print(f"🗑️ Error deleting prep: {e}")
        return jsonify({"error": str(e)}), 500