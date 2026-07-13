"""Meeting prep (coffee chat prep) as a durable RQ job.

Why this exists
---------------
Meeting prep used to run in a `threading.Thread` spawned inside the gunicorn WEB
worker. That thread dies with its worker — and a web worker exits on every
deploy, every recycle, every OOM. Nothing marked the Firestore doc, so the prep
sat at status="building" forever and the app spun on it.

Rylan, 2026-07-13: "meeting prep hasn't worked once since we got it on
TestFlight." The logs show exactly that — a prep working normally at 22:26:52,
then `Worker exiting (pid: 162)` at 22:27:02 as a deploy rolled, and the doc
frozen at "building" from then on. Any day we ship, every in-flight prep dies.

Auto-apply already learned this lesson and moved to the RQ worker. Prep gets the
same treatment: it runs in the worker process, so a web deploy can't kill it, and
if the job itself dies the doc is marked failed instead of hanging.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def _mark_failed(user_id: str, prep_id: str, reason: str) -> None:
    """Never leave a prep spinning. If we can't finish it, say so."""
    try:
        from app.extensions import get_db
        db = get_db()
        if not db:
            return
        (
            db.collection("users")
            .document(user_id)
            .collection("coffee-chat-preps")
            .document(prep_id)
            .set({"status": "failed", "stage": "failed", "error": reason}, merge=True)
        )
    except Exception:
        logger.exception("could not mark prep %s/%s failed", user_id, prep_id)


def run_meeting_prep_task(
    prep_id: str,
    linkedin_url: str,
    user_id: str,
    resume_text: str,
    extra_context: dict,
    user_data: dict,
) -> None:
    """RQ entrypoint. Runs the existing prep pipeline in the worker process."""
    print(f"[meeting_prep] START prep_id={prep_id} uid={user_id}", flush=True)
    try:
        # Imported lazily: the pipeline lives in the route module, and pulling
        # Flask route code in at worker boot is both slow and unnecessary.
        from app.routes.coffee_chat_prep import process_coffee_chat_prep_background

        process_coffee_chat_prep_background(
            prep_id,
            linkedin_url,
            user_id,
            resume_text,
            extra_context,
            user_data,
        )
        print(f"[meeting_prep] DONE prep_id={prep_id}", flush=True)
    except Exception as exc:
        # A crash here used to be invisible (thread died, doc stayed "building").
        # Now it's a terminal, honest state the app can render.
        logger.exception("meeting prep %s failed", prep_id)
        print(f"[meeting_prep] FAILED prep_id={prep_id}: {exc}", flush=True)
        _mark_failed(
            user_id,
            prep_id,
            "The prep stopped partway through. Nothing was charged — try again.",
        )
        raise
