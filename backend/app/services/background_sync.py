# TODO: Future enhancement — run sync_stale_threads() periodically for all active users.
# Options:
# - Firebase Cloud Function on a schedule (every 30 min)
# - Simple cron job hitting POST /api/admin/sync-stale for each active user
# - Celery beat task
# For now, sync is triggered by the frontend on Outbox page load via batch-sync.

"""
Background sync for Outbox: find stale threads (email_sent / waiting_on_reply / replied)
and sync them with Gmail. Used by batch-sync (stale mode) and admin sync-stale.
"""
import time

# Stale = stages where we care about Gmail replies
STALE_PIPELINE_STAGES = ("email_sent", "waiting_on_reply", "replied")


def get_stale_thread_ids(uid, max_threads=10):
    """
    Return contact IDs that are good candidates for sync: pipelineStage in
    [email_sent, waiting_on_reply, replied] and have gmailThreadId.
    Sorted by lastSyncAt ascending (oldest first, nulls first). At most max_threads.
    """
    try:
        from app.extensions import get_db
        db = get_db()
    except RuntimeError:
        return []

    contacts_ref = db.collection("users").document(uid).collection("contacts")
    docs = list(contacts_ref.stream())

    def _last_sync_at(doc):
        data = doc.to_dict() or {}
        return data.get("lastSyncAt") or data.get("last_sync_at") or ""

    candidates = []
    for doc in docs:
        data = doc.to_dict() or {}
        stage = data.get("pipelineStage") or data.get("pipeline_stage")
        if stage not in STALE_PIPELINE_STAGES:
            continue
        gmail_thread_id = data.get("gmailThreadId") or data.get("gmail_thread_id")
        if not gmail_thread_id:
            continue
        candidates.append(doc)

    candidates.sort(key=_last_sync_at)
    return [doc.id for doc in candidates[:max_threads]]


def sync_stale_threads(uid, max_threads=10, user_email=None):
    """
    Sync up to max_threads stale contacts with Gmail (1s delay between each).
    Returns {"synced_count": N, "failed_count": N, "skipped_count": N, "total_stale": N}.
    """
    # Lazy import to avoid circular import (outbox imports this module)
    from app.routes.outbox import _perform_sync

    ids = get_stale_thread_ids(uid, max_threads=max_threads)
    total_stale = len(ids)
    synced_count = 0
    failed_count = 0
    skipped_count = 0

    for i, contact_id in enumerate(ids):
        if i > 0:
            time.sleep(1)
        try:
            thread, synced, error_code = _perform_sync(uid, contact_id, user_email or "")
            stage = (thread or {}).get("pipelineStage") if thread else None
            if error_code == "recently_synced":
                skipped_count += 1
                print(f"[background_sync] uid={uid} contact={contact_id} synced=False (skipped: recently_synced) stage={stage}")
            elif synced and not error_code:
                synced_count += 1
                print(f"[background_sync] uid={uid} contact={contact_id} synced=True stage={stage}")
            else:
                failed_count += 1
                print(f"[background_sync] uid={uid} contact={contact_id} synced=False stage={stage} error={error_code}")
        except Exception as e:
            failed_count += 1
            print(f"[background_sync] uid={uid} contact={contact_id} synced=False error={e!r}")

    return {
        "synced_count": synced_count,
        "failed_count": failed_count,
        "skipped_count": skipped_count,
        "total_stale": total_stale,
    }
