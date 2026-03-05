#!/usr/bin/env python3
"""
Phase 1 Migration: Normalize Outbox Schema

Normalizes snake_case fields to camelCase, sets inOutbox flag,
adds new tracker fields with safe defaults, and removes junk fields.

Usage:
    python backend/scripts/migrate_outbox_schema.py            # dry run
    python backend/scripts/migrate_outbox_schema.py --execute   # live run
"""
import os
import sys
import argparse

# ---------------------------------------------------------------------------
# Ensure the backend package is importable when running from the repo root
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)           # backend/
ROOT_DIR = os.path.dirname(BACKEND_DIR)              # repo root
sys.path.insert(0, BACKEND_DIR)

import firebase_admin
from firebase_admin import credentials, firestore

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BATCH_LIMIT = 400          # Firestore max is 500; stay under
PROGRESS_EVERY = 100       # Print progress every N contacts

# snake_case -> camelCase mapping (all outbox-relevant fields)
FIELD_MAP = {
    "gmail_thread_id":      "gmailThreadId",
    "gmail_draft_id":       "gmailDraftId",
    "gmail_draft_url":      "gmailDraftUrl",
    "gmail_message_id":     "gmailMessageId",
    "pipeline_stage":       "pipelineStage",
    "draft_still_exists":   "draftStillExists",
    "email_sent_at":        "emailSentAt",
    "email_subject":        "emailSubject",
    "email_body":           "emailBody",
    "has_unread_reply":     "hasUnreadReply",
    "thread_status":        "threadStatus",
    "last_message_snippet": "lastMessageSnippet",
    "last_activity_at":     "lastActivityAt",
    "last_sync_at":         "lastSyncAt",
    "last_sync_error":      "lastSyncError",
    "suggested_reply":      "suggestedReply",
    "reply_type":           "replyType",
    "draft_created_at":     "draftCreatedAt",
    "reply_received_at":    "replyReceivedAt",
    "meeting_scheduled_at": "meetingScheduledAt",
    "connected_at":         "connectedAt",
    "updated_at":           "updatedAt",
    # Identity fields (also duplicated in some docs)
    "first_name":           "firstName",
    "last_name":            "lastName",
    "job_title":            "jobTitle",
}

# Junk fields to remove from all contacts
JUNK_FIELDS = {"suggestedReply", "replyType"}

# New tracker fields added to inOutbox contacts with safe defaults
NEW_TRACKER_FIELDS = {
    "followUpCount": 0,
    "nextFollowUpAt": None,
    "lastMessageFrom": None,
    "messageCount": 0,
    "conversationSummary": None,
    "resolution": None,
    "resolutionDetails": None,
    "archivedAt": None,
    "snoozedUntil": None,
}


def _contact_belongs_in_outbox(data: dict) -> bool:
    """A contact belongs in the outbox if it has any Gmail integration or a pipelineStage."""
    if data.get("gmailDraftId"):
        return True
    if data.get("gmailDraftUrl"):
        return True
    if data.get("gmailThreadId"):
        return True
    stage = data.get("pipelineStage")
    if stage:
        return True
    return False


def _build_updates(data: dict) -> dict:
    """
    Return a dict of Firestore updates for a single contact document.
    Uses firestore.DELETE_FIELD to remove snake_case and junk fields.
    Returns empty dict if no changes needed.
    """
    updates = {}

    # 1. Normalize snake_case -> camelCase
    for snake, camel in FIELD_MAP.items():
        snake_val = data.get(snake)
        if snake_val is None:
            continue
        # Copy to camelCase if camelCase is missing or empty
        camel_val = data.get(camel)
        if not camel_val:
            updates[camel] = snake_val
        # Always delete the snake_case field
        updates[snake] = firestore.DELETE_FIELD

    # 2. Re-evaluate inOutbox after normalization
    # Merge current data with updates (but skip DELETE_FIELD sentinels)
    merged = dict(data)
    for k, v in updates.items():
        if v is firestore.DELETE_FIELD:
            merged.pop(k, None)
        else:
            merged[k] = v

    in_outbox = _contact_belongs_in_outbox(merged)

    if in_outbox:
        if not data.get("inOutbox"):
            updates["inOutbox"] = True

        # 3. Add missing tracker fields with safe defaults
        for field, default in NEW_TRACKER_FIELDS.items():
            if field not in data:
                updates[field] = default
    else:
        # Not in outbox - make sure inOutbox isn't True
        if data.get("inOutbox"):
            updates["inOutbox"] = firestore.DELETE_FIELD

    # 4. Remove junk fields
    for field in JUNK_FIELDS:
        if field in data:
            updates[field] = firestore.DELETE_FIELD

    return updates


def _init_firestore():
    """Initialize Firebase Admin SDK and return a Firestore client."""
    if firebase_admin._apps:
        return firestore.client()

    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    cred = None
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        print(f"Using credentials from: {cred_path}")
    else:
        print("No GOOGLE_APPLICATION_CREDENTIALS found; using project defaults")

    if cred:
        firebase_admin.initialize_app(cred, {
            "projectId": "offerloop-native",
            "storageBucket": "offerloop-native.firebasestorage.app",
        })
    else:
        firebase_admin.initialize_app(options={
            "projectId": "offerloop-native",
            "storageBucket": "offerloop-native.firebasestorage.app",
        })

    return firestore.client()


def run_migration(dry_run: bool = True):
    db = _init_firestore()

    # Counters
    total_users = 0
    total_contacts = 0
    total_updated = 0
    total_in_outbox = 0
    total_snake_removed = 0
    errors = []

    print(f"\n{'DRY RUN' if dry_run else 'LIVE RUN'} - Migration starting...\n")

    # Iterate all users
    users_ref = db.collection("users")
    user_docs = list(users_ref.stream())
    print(f"Found {len(user_docs)} users\n")

    batch = db.batch()
    batch_count = 0

    for user_doc in user_docs:
        uid = user_doc.id
        total_users += 1

        contacts_ref = db.collection("users").document(uid).collection("contacts")
        contact_docs = list(contacts_ref.stream())

        for contact_doc in contact_docs:
            total_contacts += 1
            contact_id = contact_doc.id

            try:
                data = contact_doc.to_dict() or {}
                updates = _build_updates(data)

                if not updates:
                    continue

                # Count snake_case removals
                snake_removals = sum(
                    1 for k, v in updates.items()
                    if v is firestore.DELETE_FIELD and k in FIELD_MAP
                )
                total_snake_removed += snake_removals

                # Count inOutbox additions
                if updates.get("inOutbox") is True:
                    total_in_outbox += 1

                total_updated += 1

                if dry_run:
                    if total_updated <= 20:
                        # Show first 20 changes for inspection
                        change_summary = {}
                        for k, v in updates.items():
                            if v is firestore.DELETE_FIELD:
                                change_summary[k] = "DELETE"
                            elif v is None:
                                change_summary[k] = "null"
                            else:
                                change_summary[k] = v
                        name = data.get("firstName", "") + " " + data.get("lastName", "")
                        name = name.strip() or data.get("email", contact_id)
                        print(f"  [{uid[:8]}] {name}: {change_summary}")
                else:
                    ref = contacts_ref.document(contact_id)
                    batch.update(ref, updates)
                    batch_count += 1

                    if batch_count >= BATCH_LIMIT:
                        batch.commit()
                        batch = db.batch()
                        batch_count = 0

            except Exception as e:
                errors.append({"uid": uid, "contactId": contact_id, "error": str(e)})

            if total_contacts % PROGRESS_EVERY == 0:
                print(f"  ... processed {total_contacts} contacts ({total_updated} updated)")

    # Commit remaining batch
    if not dry_run and batch_count > 0:
        batch.commit()

    # Summary
    print("\n" + "=" * 60)
    print(f"{'DRY RUN' if dry_run else 'LIVE RUN'} COMPLETE")
    print("=" * 60)
    print(f"  Total users processed:         {total_users}")
    print(f"  Total contacts scanned:        {total_contacts}")
    print(f"  Total contacts updated:        {total_updated}")
    print(f"  Total marked inOutbox=true:    {total_in_outbox}")
    print(f"  Total snake_case fields removed: {total_snake_removed}")
    print(f"  Errors encountered:            {len(errors)}")

    if errors:
        print("\nErrors:")
        for err in errors:
            print(f"  user={err['uid']} contact={err['contactId']}: {err['error']}")

    if dry_run:
        print(f"\nThis was a DRY RUN. No changes were written to Firestore.")
        print(f"Run with --execute to apply changes.")

    return {
        "total_users": total_users,
        "total_contacts": total_contacts,
        "total_updated": total_updated,
        "total_in_outbox": total_in_outbox,
        "total_snake_removed": total_snake_removed,
        "errors": errors,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate Outbox schema: normalize fields and set inOutbox flag")
    parser.add_argument("--execute", action="store_true", help="Actually write changes to Firestore (default is dry run)")
    args = parser.parse_args()

    run_migration(dry_run=not args.execute)
