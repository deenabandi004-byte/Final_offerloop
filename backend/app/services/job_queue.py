"""
PHASE 3.1: Simple job queue using Firestore for background processing.
Tracks analysis jobs with status and progress.
"""
from typing import Dict, Any, Optional, Callable
from datetime import datetime, timedelta
from enum import Enum
import uuid
import json


class JobStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class JobQueue:
    """Simple job queue using Firestore for persistence."""
    
    def __init__(self):
        self._db = None
    
    def _get_db(self):
        """Lazy load Firestore client."""
        if self._db is None:
            try:
                from app.extensions import get_db
                self._db = get_db()
            except Exception as e:
                print(f"[JobQueue] Failed to get Firestore client: {e}")
                return None
        return self._db
    
    def create_job(
        self,
        job_type: str,
        payload: Dict[str, Any],
        priority: int = 2,
        user_id: Optional[str] = None
    ) -> str:
        """
        Create a new job in the queue.
        
        Args:
            job_type: Type of job (e.g., 'job_analysis')
            payload: Job payload data
            priority: Job priority (1=high, 2=medium, 3=low)
            user_id: User ID if available
            
        Returns:
            Job ID
        """
        db = self._get_db()
        if not db:
            raise RuntimeError("Firestore not available")
        
        job_id = str(uuid.uuid4())
        
        job_data = {
            'job_type': job_type,
            'payload': payload,
            'status': JobStatus.PENDING.value,
            'priority': priority,
            'user_id': user_id,
            'progress': 0,
            'progress_message': 'Queued',
            'created_at': datetime.now(),
            'updated_at': datetime.now(),
            'result': None,
            'error': None
        }
        
        db.collection('job_queue').document(job_id).set(job_data)
        print(f"[JobQueue] Created job {job_id} (type: {job_type}, priority: {priority})")
        return job_id
    
    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job status and data."""
        db = self._get_db()
        if not db:
            return None
        
        doc = db.collection('job_queue').document(job_id).get()
        if not doc.exists:
            return None
        
        data = doc.to_dict()
        # Convert Firestore Timestamp to datetime if needed
        if 'created_at' in data and hasattr(data['created_at'], 'to_datetime'):
            data['created_at'] = data['created_at'].to_datetime()
        if 'updated_at' in data and hasattr(data['updated_at'], 'to_datetime'):
            data['updated_at'] = data['updated_at'].to_datetime()
        
        return data
    
    def update_job_progress(
        self,
        job_id: str,
        progress: int,
        progress_message: str,
        status: Optional[JobStatus] = None
    ) -> bool:
        """Update job progress."""
        db = self._get_db()
        if not db:
            return False
        
        update_data = {
            'progress': max(0, min(100, progress)),
            'progress_message': progress_message,
            'updated_at': datetime.now()
        }
        
        if status:
            update_data['status'] = status.value
        
        try:
            db.collection('job_queue').document(job_id).update(update_data)
            return True
        except Exception as e:
            print(f"[JobQueue] Failed to update job {job_id}: {e}")
            return False
    
    def complete_job(self, job_id: str, result: Dict[str, Any]) -> bool:
        """Mark job as completed with result."""
        db = self._get_db()
        if not db:
            return False
        
        update_data = {
            'status': JobStatus.COMPLETED.value,
            'progress': 100,
            'progress_message': 'Completed',
            'result': result,
            'updated_at': datetime.now()
        }
        
        try:
            db.collection('job_queue').document(job_id).update(update_data)
            return True
        except Exception as e:
            print(f"[JobQueue] Failed to complete job {job_id}: {e}")
            return False
    
    def fail_job(self, job_id: str, error: str) -> bool:
        """Mark job as failed with error message."""
        db = self._get_db()
        if not db:
            return False
        
        update_data = {
            'status': JobStatus.FAILED.value,
            'progress_message': f'Failed: {error}',
            'error': error,
            'updated_at': datetime.now()
        }
        
        try:
            db.collection('job_queue').document(job_id).update(update_data)
            return True
        except Exception as e:
            print(f"[JobQueue] Failed to fail job {job_id}: {e}")
            return False
    
    def cleanup_old_jobs(self, days: int = 7) -> int:
        """Clean up jobs older than specified days."""
        db = self._get_db()
        if not db:
            return 0
        
        cutoff = datetime.now() - timedelta(days=days)
        
        try:
            old_jobs = db.collection('job_queue').where('created_at', '<', cutoff).stream()
            count = 0
            for doc in old_jobs:
                doc.reference.delete()
                count += 1
            print(f"[JobQueue] Cleaned up {count} old jobs")
            return count
        except Exception as e:
            print(f"[JobQueue] Failed to cleanup old jobs: {e}")
            return 0


# Global instance
job_queue = JobQueue()

