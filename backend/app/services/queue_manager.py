import uuid
import threading
from datetime import datetime
from typing import Optional


class QueueManager:
    """In-memory queue manager for tracking transcription jobs."""

    def __init__(self):
        self._jobs = {}
        self._lock = threading.Lock()

    def add_job(self, session_id: str, engine: str) -> str:
        """
        Add a new transcription job to the queue.

        Args:
            session_id: The session ID to transcribe
            engine: The transcription engine to use (groq-turbo, groq-large, deepgram, wynona)

        Returns:
            job_id: Unique identifier for the created job
        """
        job_id = str(uuid.uuid4())

        with self._lock:
            self._jobs[job_id] = {
                "id": job_id,
                "session_id": session_id,
                "engine": engine,
                "status": "queued",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }

        return job_id

    def get_jobs(self) -> list:
        """
        Get all jobs in the queue.

        Returns:
            List of job dictionaries
        """
        with self._lock:
            return list(self._jobs.values())

    def get_job(self, job_id: str) -> Optional[dict]:
        """
        Get a specific job by ID.

        Args:
            job_id: The job ID to retrieve

        Returns:
            Job dictionary or None if not found
        """
        with self._lock:
            return self._jobs.get(job_id)

    def update_status(self, job_id: str, status: str) -> bool:
        """
        Update the status of a job.

        Args:
            job_id: The job ID to update
            status: New status (queued, processing, completed, failed)

        Returns:
            True if job was found and updated, False otherwise
        """
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id]["status"] = status
                self._jobs[job_id]["updated_at"] = datetime.utcnow().isoformat()
                return True
            return False
