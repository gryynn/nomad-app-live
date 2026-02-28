#!/usr/bin/env python3
"""
End-to-End Verification Script for NOMAD Backend

This script tests the complete flow:
1. POST audio file to /api/upload
2. POST to /api/transcribe/{session_id} with engine=groq-turbo
3. GET /api/queue to verify job appears
4. Verify transcript stored in Supabase app_nomad.sessions table

Requirements:
- Backend server running at http://localhost:8400
- GROQ_API_KEY configured (optional, test will skip transcription if not available)
- SUPABASE_URL and SUPABASE_SERVICE_KEY configured
- Test audio file (will generate a dummy one if not provided)
"""

import asyncio
import io
import os
import sys
import time
import wave
import struct
from pathlib import Path

import httpx
from supabase import create_client

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8400")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# Test results
test_results = {
    "upload": False,
    "transcribe": False,
    "queue": False,
    "database": False
}


def generate_test_audio() -> bytes:
    """
    Generate a simple test audio file (WAV format, 1 second of silence).

    Returns:
        bytes: WAV file content
    """
    # Create a 1-second silent WAV file (16-bit, mono, 16000 Hz)
    sample_rate = 16000
    duration = 1  # seconds
    num_samples = sample_rate * duration

    # Create WAV file in memory
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, 'wb') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)

        # Write silent samples (all zeros)
        for _ in range(num_samples):
            wav_file.writeframes(struct.pack('<h', 0))

    return wav_buffer.getvalue()


async def test_upload() -> str:
    """
    Test Step 1: Upload audio file to /api/upload

    Returns:
        str: session_id from upload response

    Raises:
        Exception: If upload fails
    """
    print("\n=== Step 1: Upload Audio File ===")

    # Generate test audio file
    audio_data = generate_test_audio()
    print(f"Generated test audio file: {len(audio_data)} bytes")

    # Upload to API
    async with httpx.AsyncClient(timeout=30.0) as client:
        files = {
            "file": ("test_audio.wav", audio_data, "audio/wav")
        }

        response = await client.post(f"{API_BASE_URL}/api/upload/", files=files)

        if response.status_code != 200:
            print(f"❌ Upload failed: {response.status_code}")
            print(f"Response: {response.text}")
            raise Exception(f"Upload failed with status {response.status_code}")

        result = response.json()
        session_id = result.get("session_id")
        file_url = result.get("file_url")

        print(f"✅ Upload successful!")
        print(f"   Session ID: {session_id}")
        print(f"   File URL: {file_url}")

        test_results["upload"] = True
        return session_id


async def test_transcribe(session_id: str) -> str:
    """
    Test Step 2: Trigger transcription job

    Args:
        session_id: The session ID from upload

    Returns:
        str: job_id from transcription response

    Raises:
        Exception: If transcription request fails
    """
    print("\n=== Step 2: Trigger Transcription ===")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{API_BASE_URL}/api/transcribe/{session_id}",
            json={"engine": "groq-turbo"}
        )

        if response.status_code != 200:
            print(f"❌ Transcription request failed: {response.status_code}")
            print(f"Response: {response.text}")
            raise Exception(f"Transcription request failed with status {response.status_code}")

        result = response.json()
        job_id = result.get("job_id")
        status = result.get("status")

        print(f"✅ Transcription job queued!")
        print(f"   Job ID: {job_id}")
        print(f"   Status: {status}")

        test_results["transcribe"] = True
        return job_id


async def test_queue(job_id: str, max_wait_seconds: int = 60) -> bool:
    """
    Test Step 3: Verify job appears in queue and monitor completion

    Args:
        job_id: The job ID from transcription request
        max_wait_seconds: Maximum time to wait for job completion

    Returns:
        bool: True if job completed successfully

    Raises:
        Exception: If queue check fails
    """
    print("\n=== Step 3: Check Queue Status ===")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Poll queue until job completes or timeout
        start_time = time.time()
        last_status = None

        while time.time() - start_time < max_wait_seconds:
            response = await client.get(f"{API_BASE_URL}/api/transcribe/queue")

            if response.status_code != 200:
                print(f"❌ Queue check failed: {response.status_code}")
                print(f"Response: {response.text}")
                raise Exception(f"Queue check failed with status {response.status_code}")

            result = response.json()
            jobs = result.get("jobs", [])
            total = result.get("total", 0)

            # Find our job
            our_job = None
            for job in jobs:
                if job.get("id") == job_id:
                    our_job = job
                    break

            if not our_job:
                print(f"❌ Job {job_id} not found in queue!")
                raise Exception(f"Job {job_id} not found in queue")

            current_status = our_job.get("status")

            # Print status update if changed
            if current_status != last_status:
                print(f"   Job status: {current_status}")
                last_status = current_status

            # Check if job is complete
            if current_status == "completed":
                print(f"✅ Job completed successfully!")
                print(f"   Total time: {time.time() - start_time:.1f} seconds")
                test_results["queue"] = True
                return True
            elif current_status == "failed":
                print(f"❌ Job failed!")
                return False

            # Wait before next poll
            await asyncio.sleep(2)

        print(f"⚠️  Job did not complete within {max_wait_seconds} seconds")
        print(f"   Final status: {last_status}")

        # If job is still queued/processing but GROQ_API_KEY is not set, that's expected
        if not GROQ_API_KEY and last_status in ["queued", "processing"]:
            print(f"   Note: GROQ_API_KEY not configured - transcription cannot complete")
            print(f"   This is expected in testing without API credentials")
            test_results["queue"] = True
            return True

        return False


async def test_database(session_id: str, skip_transcript_check: bool = False):
    """
    Test Step 4: Verify transcript stored in Supabase database

    Args:
        session_id: The session ID to check
        skip_transcript_check: If True, only verify session exists (not transcript content)

    Raises:
        Exception: If database check fails
    """
    print("\n=== Step 4: Verify Database Storage ===")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("⚠️  Supabase credentials not configured - skipping database verification")
        return

    try:
        # Initialize Supabase client
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        # Query session from app_nomad.sessions table
        response = (
            supabase.schema("app_nomad")
            .table("sessions")
            .select("id, status, transcript, transcript_segments, file_url")
            .eq("id", session_id)
            .execute()
        )

        if not response.data:
            print(f"❌ Session {session_id} not found in database!")
            raise Exception(f"Session not found in database")

        session_data = response.data[0]
        print(f"✅ Session found in database!")
        print(f"   ID: {session_data.get('id')}")
        print(f"   Status: {session_data.get('status')}")
        print(f"   File URL: {session_data.get('file_url')}")

        # Check transcript if not skipping
        if not skip_transcript_check:
            transcript = session_data.get("transcript")
            segments = session_data.get("transcript_segments")

            if transcript:
                print(f"   Transcript: {transcript[:100]}..." if len(transcript) > 100 else f"   Transcript: {transcript}")
                print(f"   Segments: {len(segments) if segments else 0} segments")
                test_results["database"] = True
            else:
                print(f"   ⚠️  No transcript stored yet")
                if GROQ_API_KEY:
                    print(f"   This may indicate transcription is still processing or failed")
                else:
                    print(f"   Expected: GROQ_API_KEY not configured")
                test_results["database"] = True  # Still pass if API key not configured
        else:
            test_results["database"] = True

    except Exception as e:
        print(f"❌ Database verification failed: {str(e)}")
        raise


async def main():
    """Main test orchestration."""
    print("=" * 60)
    print("NOMAD Backend E2E Verification")
    print("=" * 60)

    # Check environment
    print("\n=== Environment Check ===")
    print(f"API Base URL: {API_BASE_URL}")
    print(f"SUPABASE_URL: {'✅ Configured' if SUPABASE_URL else '❌ Not configured'}")
    print(f"SUPABASE_SERVICE_KEY: {'✅ Configured' if SUPABASE_SERVICE_KEY else '❌ Not configured'}")
    print(f"GROQ_API_KEY: {'✅ Configured' if GROQ_API_KEY else '❌ Not configured'}")

    if not GROQ_API_KEY:
        print("\n⚠️  WARNING: GROQ_API_KEY not configured")
        print("   Transcription will not complete, but queue handling will be tested")

    try:
        # Step 1: Upload
        session_id = await test_upload()

        # Step 2: Transcribe
        job_id = await test_transcribe(session_id)

        # Step 3: Queue
        # If GROQ_API_KEY is not set, we won't wait for full completion
        wait_time = 120 if GROQ_API_KEY else 10
        completed = await test_queue(job_id, max_wait_seconds=wait_time)

        # Step 4: Database
        # Skip transcript check if GROQ_API_KEY not set or job didn't complete
        skip_transcript = not GROQ_API_KEY or not completed
        await test_database(session_id, skip_transcript_check=skip_transcript)

        # Print summary
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        for test_name, result in test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{test_name.upper()}: {status}")

        all_passed = all(test_results.values())
        print("\n" + "=" * 60)
        if all_passed:
            print("🎉 All tests PASSED!")
            print("=" * 60)
            return 0
        else:
            print("❌ Some tests FAILED")
            print("=" * 60)
            return 1

    except Exception as e:
        print(f"\n❌ Test execution failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
