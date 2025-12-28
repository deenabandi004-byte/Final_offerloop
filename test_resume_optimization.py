#!/usr/bin/env python3
"""
Test script for resume optimization endpoint.
This script tests the /api/job-board/optimize-resume endpoint.
"""

import requests
import json
import sys

# Configuration
BASE_URL = "http://localhost:5001"
ENDPOINT = f"{BASE_URL}/api/job-board/optimize-resume"

# Test data
test_payload = {
    "jobDescription": """
    Software Engineer Intern - Summer 2025
    
    We are looking for a motivated Software Engineer Intern to join our team.
    The ideal candidate will have:
    - Experience with Python and JavaScript
    - Knowledge of web development frameworks
    - Strong problem-solving skills
    - Ability to work in a team environment
    
    Responsibilities:
    - Develop and maintain web applications
    - Write clean, maintainable code
    - Participate in code reviews
    - Collaborate with cross-functional teams
    """,
    "jobTitle": "Software Engineer Intern",
    "company": "Tech Company Inc"
}

def test_optimize_resume(auth_token=None):
    """Test the resume optimization endpoint."""
    headers = {
        "Content-Type": "application/json"
    }
    
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    
    print(f"Testing resume optimization endpoint: {ENDPOINT}")
    print(f"Payload: {json.dumps(test_payload, indent=2)}")
    print("-" * 80)
    
    try:
        response = requests.post(
            ENDPOINT,
            json=test_payload,
            headers=headers,
            timeout=60
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        print("-" * 80)
        
        if response.status_code == 200:
            result = response.json()
            print("✅ SUCCESS!")
            print(f"Response: {json.dumps(result, indent=2)}")
            return True
        elif response.status_code == 401:
            print("❌ Authentication required")
            print("Response:", response.text)
            print("\n💡 Tip: You need to provide a valid Firebase ID token.")
            print("   Get one from the frontend or Firebase console.")
            return False
        elif response.status_code == 400:
            print("❌ Bad Request")
            print("Response:", response.text)
            return False
        elif response.status_code == 500:
            print("❌ Server Error")
            print("Response:", response.text)
            return False
        else:
            print(f"❌ Unexpected status code: {response.status_code}")
            print("Response:", response.text)
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Connection Error: Could not connect to server")
        print("   Make sure the Flask server is running on http://localhost:5001")
        return False
    except requests.exceptions.Timeout:
        print("❌ Request Timeout: The request took too long")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    # Check if auth token provided as command line argument
    auth_token = sys.argv[1] if len(sys.argv) > 1 else None
    
    if not auth_token:
        print("⚠️  No auth token provided. Testing without authentication...")
        print("   (This will likely fail with 401, but will test the endpoint structure)")
        print()
    
    success = test_optimize_resume(auth_token)
    sys.exit(0 if success else 1)

