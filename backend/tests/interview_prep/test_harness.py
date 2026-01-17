#!/usr/bin/env python3
"""
Interview Prep Test Harness

This script tests the Interview Prep feature by:
1. Running test cases with different company types, roles, and experience levels
2. Collecting response data and metrics
3. Allowing manual evaluation of responses
4. Generating summary reports

Usage:
    python test_harness.py [--test-case <name>] [--all] [--interactive]
"""

import os
import sys
import json
import time
import yaml
import requests
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path
import argparse

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5001")
TEST_CASES_FILE = Path(__file__).parent / "test_cases.yaml"
RESULTS_DIR = Path(__file__).parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)

# Evaluation criteria weights
CRITERIA_WEIGHTS = {
    "relevance": 0.25,
    "actionability": 0.20,
    "coverage": 0.20,
    "personalization": 0.20,
    "sample_questions": 0.15,
}

# Maximum wait times (in seconds)
MAX_WAIT_INITIAL = 120  # 2 minutes for initial response
MAX_WAIT_COMPLETION = 600  # 10 minutes for completion
POLL_INTERVAL = 15  # Poll every 5 seconds


class TestResult:
    """Stores test case result data"""
    
    def __init__(self, test_case: Dict):
        self.test_case = test_case
        self.name = test_case["name"]
        self.status = "pending"
        self.prep_id: Optional[str] = None
        self.initial_latency: Optional[float] = None
        self.completion_latency: Optional[float] = None
        self.total_latency: Optional[float] = None
        self.error: Optional[str] = None
        self.response_data: Optional[Dict] = None
        self.insights: Optional[Dict] = None
        self.validation_results: Optional[Dict[str, bool]] = None
        self.evaluation_scores: Dict[str, Optional[float]] = {
            "relevance": None,
            "actionability": None,
            "coverage": None,
            "personalization": None,
            "sample_questions": None,
        }
        self.overall_score: Optional[float] = None
        self.notes: str = ""
        self.timestamp = datetime.now().isoformat()
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            "test_case": self.test_case,
            "name": self.name,
            "status": self.status,
            "prep_id": self.prep_id,
            "initial_latency": self.initial_latency,
            "completion_latency": self.completion_latency,
            "total_latency": self.total_latency,
            "error": self.error,
            "response_data": self.response_data,
            "insights": self.insights,
            "validation_results": self.validation_results,
            "evaluation_scores": self.evaluation_scores,
            "overall_score": self.overall_score,
            "notes": self.notes,
            "timestamp": self.timestamp,
        }


class InterviewPrepTestHarness:
    """Test harness for Interview Prep feature"""
    
    def __init__(self, api_base_url: str = API_BASE_URL, auth_token: Optional[str] = None):
        self.api_base_url = api_base_url
        self.auth_token = auth_token or os.getenv("AUTH_TOKEN")
        self.results: List[TestResult] = []
    
    def load_test_cases(self) -> List[Dict]:
        """Load test cases from YAML file"""
        with open(TEST_CASES_FILE, 'r') as f:
            data = yaml.safe_load(f)
        return data.get("test_cases", [])
    
    def call_interview_prep_api(self, company_name: str, job_title: str, 
                                job_posting_url: Optional[str] = None) -> Dict:
        """Call the Interview Prep API endpoint"""
        url = f"{self.api_base_url}/api/interview-prep/generate"
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        
        payload = {}
        if job_posting_url:
            payload["job_posting_url"] = job_posting_url
        else:
            payload["company_name"] = company_name
            payload["job_title"] = job_title
        
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()
    
    def check_prep_status(self, prep_id: str) -> Dict:
        """Check the status of an interview prep"""
        url = f"{self.api_base_url}/api/interview-prep/status/{prep_id}"
        headers = {}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()
    
    def wait_for_completion(self, prep_id: str, result: TestResult) -> Dict:
        """Poll for prep completion"""
        start_time = time.time()
        elapsed_initial = 0
        
        while True:
            elapsed = time.time() - start_time
            
            # Check for timeout
            if elapsed > MAX_WAIT_COMPLETION:
                raise TimeoutError(f"Prep {prep_id} did not complete within {MAX_WAIT_COMPLETION} seconds")
            
            try:
                status_data = self.check_prep_status(prep_id)
                status = status_data.get("status", "unknown")
                
                if status == "completed":
                    result.completion_latency = elapsed
                    result.total_latency = elapsed
                    return status_data
                elif status == "failed":
                    error_msg = status_data.get("error", "Unknown error")
                    result.error = error_msg
                    result.status = "failed"
                    raise Exception(f"Prep failed: {error_msg}")
                
                # Print progress
                progress = status_data.get("progress", status)
                print(f"  Status: {status} - {progress} ({elapsed:.1f}s)")
                
            except requests.exceptions.RequestException as e:
                print(f"  Warning: Error checking status: {e}")
            
            time.sleep(POLL_INTERVAL)
    
    def run_test_case(self, test_case: Dict, interactive: bool = False) -> TestResult:
        """Run a single test case"""
        result = TestResult(test_case)
        print(f"\n{'='*60}")
        print(f"Running test: {result.name}")
        print(f"Company: {test_case['company_name']}")
        print(f"Role: {test_case['job_title']}")
        print(f"Type: {test_case['company_type']} / {test_case['role_type']}")
        print(f"{'='*60}")
        
        try:
            # Call API
            start_time = time.time()
            response = self.call_interview_prep_api(
                company_name=test_case["company_name"],
                job_title=test_case["job_title"],
            )
            result.initial_latency = time.time() - start_time
            result.prep_id = response.get("id")
            result.status = "processing"
            
            print(f"✅ Prep created: {result.prep_id}")
            print(f"⏱️  Initial latency: {result.initial_latency:.2f}s")
            
            if result.initial_latency > MAX_WAIT_INITIAL:
                print(f"⚠️  Warning: Initial latency exceeds {MAX_WAIT_INITIAL}s")
            
            # Wait for completion
            print(f"⏳ Waiting for completion (max {MAX_WAIT_COMPLETION}s)...")
            status_data = self.wait_for_completion(result.prep_id, result)
            
            result.response_data = status_data
            result.insights = status_data.get("insights")
            result.status = "completed"
            
            print(f"✅ Prep completed in {result.completion_latency:.2f}s")
            
            # Run automated validation
            structure_validation = self.validate_response_structure(result)
            content_validation = self.validate_content_text(result)
            pdf_validation = self.validate_pdf_exists(result)
            
            # Merge validation results
            result.validation_results = {
                **structure_validation,
                "content_validation": content_validation,
                **pdf_validation
            }
            
            # Evaluate if interactive
            if interactive:
                self.evaluate_response(result)
            
        except Exception as e:
            result.status = "error"
            result.error = str(e)
            print(f"❌ Error: {e}")
        
        return result
    
    def validate_response_structure(self, result: TestResult) -> Dict[str, bool]:
        """Automatically validate response structure"""
        validation_results = {}
        
        if not result.insights:
            return {"has_insights": False}
        
        insights = result.insights
        
        # Check key sections
        validation_results["has_interview_process"] = bool(insights.get("interview_process"))
        validation_results["has_common_questions"] = bool(insights.get("common_questions"))
        validation_results["has_success_tips"] = bool(insights.get("success_tips"))
        validation_results["has_preparation_plan"] = bool(insights.get("preparation_plan"))
        
        # Check interview process structure
        interview_process = insights.get("interview_process", {})
        validation_results["has_stages"] = bool(interview_process.get("stages"))
        
        # Check questions structure
        common_questions = insights.get("common_questions", {})
        behavioral = common_questions.get("behavioral", {})
        technical = common_questions.get("technical", {})
        validation_results["has_behavioral_questions"] = bool(behavioral.get("questions"))
        validation_results["has_technical_questions"] = bool(technical.get("questions"))
        
        # Check preparation plan
        prep_plan = insights.get("preparation_plan", {})
        validation_results["has_timeline"] = bool(prep_plan.get("timeline"))
        validation_results["has_resources"] = bool(prep_plan.get("resources"))
        
        # Role-specific validation
        expected_role_category = result.test_case.get("expected_role_category", "")
        resources = prep_plan.get("resources", {})
        coding_practice = resources.get("coding_practice", [])
        case_practice = resources.get("case_practice", [])
        
        if expected_role_category == "Consulting":
            # Consulting should NOT have coding practice resources, should have case practice
            validation_results["role_appropriate"] = len(coding_practice) == 0 and len(case_practice) > 0
        elif expected_role_category == "Software Engineering":
            # SWE should have coding practice resources
            validation_results["role_appropriate"] = len(coding_practice) > 0
        else:
            # For other roles, set to True by default (can be extended)
            validation_results["role_appropriate"] = True
        
        return validation_results
    
    def validate_content_text(self, result: TestResult) -> Dict[str, Any]:
        """Validate content text for role-appropriate keywords"""
        validation_results = {
            "issues": [],
            "passed": True
        }
        
        if not result.insights:
            validation_results["passed"] = False
            validation_results["issues"].append("No insights data available")
            return validation_results
        
        # Convert insights to searchable string
        insights_text = json.dumps(result.insights).lower()
        expected_role_category = result.test_case.get("expected_role_category", "")
        
        if expected_role_category == "Consulting":
            # Consulting should NOT contain coding-related keywords
            forbidden_keywords = ["leetcode", "hackerrank", "coding challenge", "algorithm practice"]
            found_forbidden = [kw for kw in forbidden_keywords if kw in insights_text]
            if found_forbidden:
                validation_results["passed"] = False
                validation_results["issues"].append(f"Consulting role incorrectly contains coding keywords: {', '.join(found_forbidden)}")
            
            # Consulting should contain case interview keywords
            required_keywords = ["case interview", "case study", "framework", "market sizing"]
            found_required = [kw for kw in required_keywords if kw in insights_text]
            if not found_required:
                validation_results["passed"] = False
                validation_results["issues"].append("Consulting role missing expected keywords (case interview, case study, framework, or market sizing)")
        
        elif expected_role_category == "Finance":
            # Finance should NOT contain coding/system design keywords
            forbidden_keywords = ["leetcode", "system design"]
            found_forbidden = [kw for kw in forbidden_keywords if kw in insights_text]
            if found_forbidden:
                validation_results["passed"] = False
                validation_results["issues"].append(f"Finance role incorrectly contains coding/system design keywords: {', '.join(found_forbidden)}")
            
            # Finance should contain finance-specific keywords
            required_keywords = ["dcf", "valuation", "financial modeling", "accounting"]
            found_required = [kw for kw in required_keywords if kw in insights_text]
            if not found_required:
                validation_results["passed"] = False
                validation_results["issues"].append("Finance role missing expected keywords (dcf, valuation, financial modeling, or accounting)")
        
        elif expected_role_category == "Software Engineering":
            # SWE should contain coding-related keywords
            required_keywords = ["leetcode", "coding", "algorithm", "system design"]
            found_required = [kw for kw in required_keywords if kw in insights_text]
            if not found_required:
                validation_results["passed"] = False
                validation_results["issues"].append("Software Engineering role missing expected keywords (leetcode, coding, algorithm, or system design)")
        
        return validation_results
    
    def validate_pdf_exists(self, result: TestResult) -> Dict[str, bool]:
        """Validate that PDF URL exists in response data"""
        validation_results = {}
        
        if not result.response_data:
            validation_results["has_pdf_url"] = False
            return validation_results
        
        pdf_url = result.response_data.get("pdfUrl")
        validation_results["has_pdf_url"] = bool(pdf_url)
        
        return validation_results
    
    def evaluate_response(self, result: TestResult):
        """Interactively evaluate a response"""
        print(f"\n{'='*60}")
        print(f"Evaluation: {result.name}")
        print(f"{'='*60}")
        
        if not result.insights:
            print("⚠️  No insights data available for evaluation")
            return
        
        # Run automated validation (already done, but show results)
        validation = result.validation_results or {}
        print("\n🔍 Automated Validation:")
        for key, value in validation.items():
            if key == "content_validation":
                # Handle content validation separately
                continue
            if isinstance(value, bool):
                status = "✓" if value else "✗"
                print(f"  {status} {key}: {value}")
        
        # Show content validation results
        content_validation = validation.get("content_validation", {})
        if content_validation:
            print(f"\n🔍 Content Validation:")
            passed = content_validation.get("passed", True)
            status = "✓" if passed else "✗"
            print(f"  {status} Content validation: {'PASSED' if passed else 'FAILED'}")
            issues = content_validation.get("issues", [])
            if issues:
                print(f"  Issues found:")
                for issue in issues:
                    print(f"    - {issue}")
        
        # Print key sections for reference
        print("\n📋 Key Sections Available:")
        sections = [
            ("Interview Process", result.insights.get("interview_process")),
            ("Common Questions", result.insights.get("common_questions")),
            ("Success Tips", result.insights.get("success_tips")),
            ("Preparation Plan", result.insights.get("preparation_plan")),
        ]
        for name, data in sections:
            if data:
                print(f"  ✓ {name}")
            else:
                print(f"  ✗ {name} (missing)")
        
        # Collect scores
        print("\n📊 Rate each criterion (1-5, where 5 is excellent):")
        print("   (Press Enter to skip and evaluate later)")
        
        for criterion in CRITERIA_WEIGHTS.keys():
            while True:
                try:
                    score_input = input(f"  {criterion.capitalize()} (1-5): ").strip()
                    if not score_input:
                        print(f"    Skipped - will evaluate later")
                        break
                    score = float(score_input)
                    if 1.0 <= score <= 5.0:
                        result.evaluation_scores[criterion] = score
                        break
                    else:
                        print("    Please enter a score between 1.0 and 5.0")
                except ValueError:
                    print("    Please enter a valid number")
        
        # Calculate overall score
        self.calculate_overall_score(result)
        
        # Collect notes
        notes = input("\n📝 Notes (optional): ").strip()
        if notes:
            result.notes = notes
    
    def calculate_overall_score(self, result: TestResult):
        """Calculate weighted overall score"""
        total_score = 0.0
        total_weight = 0.0
        
        for criterion, weight in CRITERIA_WEIGHTS.items():
            score = result.evaluation_scores.get(criterion)
            if score is not None:
                total_score += score * weight
                total_weight += weight
        
        if total_weight > 0:
            result.overall_score = total_score / total_weight
            print(f"\n📈 Overall Score: {result.overall_score:.2f}/5.0")
        else:
            print("\n⚠️  No scores provided - overall score cannot be calculated")
    
    def run_all_tests(self, test_cases: List[Dict], interactive: bool = False):
        """Run all test cases"""
        print(f"\n{'='*60}")
        print(f"Interview Prep Test Harness")
        print(f"API Base URL: {self.api_base_url}")
        print(f"Test Cases: {len(test_cases)}")
        print(f"{'='*60}\n")
        
        for test_case in test_cases:
            result = self.run_test_case(test_case, interactive=interactive)
            self.results.append(result)
            
            # Save results after each test
            self.save_results()
            
            # Brief pause between tests
            time.sleep(2)
        
        # Generate summary
        self.generate_summary()
    
    def save_results(self):
        """Save results to JSON file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        results_file = RESULTS_DIR / f"test_results_{timestamp}.json"
        
        # Also save as latest
        latest_file = RESULTS_DIR / "test_results_latest.json"
        
        results_data = {
            "timestamp": timestamp,
            "api_base_url": self.api_base_url,
            "results": [r.to_dict() for r in self.results],
        }
        
        with open(results_file, 'w') as f:
            json.dump(results_data, f, indent=2)
        
        with open(latest_file, 'w') as f:
            json.dump(results_data, f, indent=2)
        
        print(f"\n💾 Results saved to: {results_file}")
    
    def generate_summary(self):
        """Generate summary report"""
        if not self.results:
            print("No results to summarize")
            return
        
        print(f"\n{'='*60}")
        print("TEST SUMMARY")
        print(f"{'='*60}\n")
        
        # Status breakdown
        statuses = {}
        for result in self.results:
            statuses[result.status] = statuses.get(result.status, 0) + 1
        
        print("Status Breakdown:")
        for status, count in statuses.items():
            print(f"  {status}: {count}")
        
        # Latency statistics
        latencies = [r.total_latency for r in self.results if r.total_latency]
        if latencies:
            print(f"\nLatency Statistics:")
            print(f"  Average: {sum(latencies) / len(latencies):.2f}s")
            print(f"  Min: {min(latencies):.2f}s")
            print(f"  Max: {max(latencies):.2f}s")
        
        # Scores
        scores = [r.overall_score for r in self.results if r.overall_score is not None]
        if scores:
            print(f"\nOverall Score Statistics:")
            print(f"  Average: {sum(scores) / len(scores):.2f}/5.0")
            print(f"  Min: {min(scores):.2f}/5.0")
            print(f"  Max: {max(scores):.2f}/5.0")
        
        # Errors
        errors = [r for r in self.results if r.error]
        if errors:
            print(f"\nErrors ({len(errors)}):")
            for result in errors:
                print(f"  {result.name}: {result.error}")
        
        # Detailed results table
        print(f"\n{'='*60}")
        print("DETAILED RESULTS")
        print(f"{'='*60}\n")
        print(f"{'Test Case':<30} {'Status':<15} {'Latency':<12} {'Score':<8} {'Valid':<6}")
        print("-" * 71)
        
        for result in self.results:
            latency_str = f"{result.total_latency:.1f}s" if result.total_latency else "N/A"
            score_str = f"{result.overall_score:.2f}" if result.overall_score else "N/A"
            valid_str = "✓" if result.validation_results and result.validation_results.get("role_appropriate", True) else "✗"
            print(f"{result.name:<30} {result.status:<15} {latency_str:<12} {score_str:<8} {valid_str:<6}")
        
        print(f"\n{'='*60}")
        print(f"Full results saved to: {RESULTS_DIR}/test_results_latest.json")
        print(f"{'='*60}\n")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Interview Prep Test Harness")
    parser.add_argument("--test-case", help="Run specific test case by name")
    parser.add_argument("--all", action="store_true", help="Run all test cases")
    parser.add_argument("--smoke", action="store_true", help="Run smoke test (3 key test cases)")
    parser.add_argument("--interactive", action="store_true", help="Interactive evaluation mode")
    parser.add_argument("--api-url", default=API_BASE_URL, help="API base URL")
    parser.add_argument("--auth-token", help="Authentication token")
    
    args = parser.parse_args()
    
    # Initialize harness
    harness = InterviewPrepTestHarness(api_base_url=args.api_url, auth_token=args.auth_token)
    
    # Load test cases
    test_cases = harness.load_test_cases()
    
    if args.smoke:
        # Smoke test - run 3 key test cases
        smoke_test_names = ["Google SWE Intern", "McKinsey Consulting Analyst", "Goldman Sachs Analyst"]
        smoke_test_cases = [tc for tc in test_cases if tc["name"] in smoke_test_names]
        if len(smoke_test_cases) != len(smoke_test_names):
            missing = set(smoke_test_names) - set(tc["name"] for tc in smoke_test_cases)
            print(f"Warning: Some smoke test cases not found: {missing}")
        harness.run_all_tests(smoke_test_cases, interactive=args.interactive)
    elif args.test_case:
        # Run specific test case
        test_case = next((tc for tc in test_cases if tc["name"] == args.test_case), None)
        if not test_case:
            print(f"Error: Test case '{args.test_case}' not found")
            sys.exit(1)
        result = harness.run_test_case(test_case, interactive=args.interactive)
        harness.results.append(result)
        harness.save_results()
        if args.interactive:
            harness.generate_summary()
    elif args.all:
        # Run all test cases
        harness.run_all_tests(test_cases, interactive=args.interactive)
    else:
        # Interactive mode - let user select
        print("Available test cases:")
        for i, tc in enumerate(test_cases, 1):
            print(f"  {i}. {tc['name']}")
        print(f"  {len(test_cases) + 1}. Run all")
        
        choice = input("\nSelect test case (number): ").strip()
        try:
            choice_num = int(choice)
            if 1 <= choice_num <= len(test_cases):
                test_case = test_cases[choice_num - 1]
                result = harness.run_test_case(test_case, interactive=True)
                harness.results.append(result)
                harness.save_results()
                harness.generate_summary()
            elif choice_num == len(test_cases) + 1:
                harness.run_all_tests(test_cases, interactive=True)
            else:
                print("Invalid choice")
                sys.exit(1)
        except ValueError:
            print("Invalid choice")
            sys.exit(1)


if __name__ == "__main__":
    main()

