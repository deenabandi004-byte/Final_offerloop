"""
Test script for iterative firm search functionality
Tests the new overfetch and iterative fetching strategy
"""
import sys
import os

# Add backend to path
root_dir = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.join(root_dir, 'backend')
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from app.services.serp_client import search_companies_with_serp

def test_firm_search():
    """Test firm search with iterative fetching"""
    print("=" * 80)
    print("🧪 Testing Iterative Firm Search")
    print("=" * 80)
    print()
    
    # Test case: Similar to the logs - Boston biotech VC firms
    test_cases = [
        {
            "name": "Boston Biotech VC Firms (10 firms)",
            "industry": "venture capital",
            "location": {
                "locality": "Boston",
                "region": None,
                "metro": None,
                "country": None
            },
            "size": "none",
            "keywords": ["biotech"],
            "limit": 10
        },
        {
            "name": "NYC Investment Banks (5 firms)",
            "industry": "investment banking",
            "location": {
                "locality": "New York",
                "region": "New York",
                "metro": None,
                "country": "United States"
            },
            "size": "none",
            "keywords": [],
            "limit": 5
        }
    ]
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n{'='*80}")
        print(f"Test {i}: {test_case['name']}")
        print(f"{'='*80}")
        print(f"Industry: {test_case['industry']}")
        print(f"Location: {test_case['location']}")
        print(f"Keywords: {test_case['keywords']}")
        print(f"Requested: {test_case['limit']} firms")
        print()
        
        try:
            # Construct original query for context
            original_query = f"{test_case['industry']}"
            if test_case['keywords']:
                original_query += f" {', '.join(test_case['keywords'])}"
            if test_case['location'].get('locality'):
                original_query += f" in {test_case['location']['locality']}"
            
            result = search_companies_with_serp(
                industry=test_case['industry'],
                location=test_case['location'],
                size=test_case['size'],
                keywords=test_case['keywords'],
                limit=test_case['limit'],
                original_query=original_query
            )
            
            print(f"\n{'─'*80}")
            print("📊 RESULTS")
            print(f"{'─'*80}")
            print(f"Success: {result.get('success')}")
            print(f"Firms returned: {result.get('total', 0)}")
            print(f"Requested: {test_case['limit']}")
            print(f"Partial: {result.get('partial', False)}")
            if result.get('error'):
                print(f"Error/Message: {result.get('error')}")
            
            firms = result.get('firms', [])
            if firms:
                print(f"\n✅ SUCCESS: Retrieved {len(firms)}/{test_case['limit']} firms")
                print(f"\nFirm names:")
                for j, firm in enumerate(firms[:5], 1):  # Show first 5
                    name = firm.get('name', 'Unknown')
                    location = firm.get('location', {})
                    loc_display = location.get('display', 'N/A')
                    print(f"  {j}. {name} - {loc_display}")
                if len(firms) > 5:
                    print(f"  ... and {len(firms) - 5} more")
            else:
                print(f"\n❌ FAILED: No firms returned")
            
            # Check if we got the requested number
            if result.get('success') and len(firms) == test_case['limit']:
                print(f"\n✅ PERFECT: Got exactly {test_case['limit']} firms as requested!")
            elif result.get('success') and len(firms) > 0:
                print(f"\n⚠️ PARTIAL: Got {len(firms)}/{test_case['limit']} firms")
            else:
                print(f"\n❌ FAILED: No firms found")
                
        except Exception as e:
            print(f"\n❌ ERROR: {e}")
            import traceback
            traceback.print_exc()
        
        print(f"\n{'='*80}\n")
    
    print("🎉 Testing Complete!")

if __name__ == '__main__':
    test_firm_search()
