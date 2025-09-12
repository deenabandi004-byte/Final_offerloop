import requests
import json

def test_advanced_endpoint():
    """Test the advanced endpoint"""
    url = "http://localhost:5001/api/advanced-run"
    
    payload = {
        "jobTitle": "Investment Banker",
        "company": "Wells Fargo", 
        "location": "New York",
        "uid": "test-user-123"
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    print("🧪 Testing Advanced Endpoint")
    print(f"📤 Sending request to: {url}")
    print(f"📦 Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        
        print(f"\n📥 Response Status: {response.status_code}")
        print(f"📋 Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            print("✅ Success! CSV file downloaded.")
            # Save the CSV file
            with open("test_output.csv", "wb") as f:
                f.write(response.content)
            print("💾 Saved as test_output.csv")
            
            # Show first few lines of CSV
            with open("test_output.csv", "r") as f:
                lines = f.readlines()[:5]
                print("\n📄 CSV Preview:")
                for line in lines:
                    print(f"   {line.strip()}")
                    
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"📄 Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to server. Make sure app.py is running!")
    except Exception as e:
        print(f"❌ Error: {e}")

def test_basic_endpoint():
    """Test the basic endpoint"""
    url = "http://localhost:5001/api/basic-run"
    
    payload = {
        "jobTitle": "Investment Banker",
        "company": "Wells Fargo", 
        "location": "New York"
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    print("🧪 Testing Basic Endpoint")
    print(f"📤 Sending request to: {url}")
    print(f"📦 Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        
        print(f"\n📥 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ Success! CSV file downloaded.")
            # Save the CSV file
            with open("test_basic_output.csv", "wb") as f:
                f.write(response.content)
            print("💾 Saved as test_basic_output.csv")
            
            # Show first few lines of CSV
            with open("test_basic_output.csv", "r") as f:
                lines = f.readlines()[:3]
                print("\n📄 Basic CSV Preview:")
                for line in lines:
                    print(f"   {line.strip()}")
                    
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"📄 Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to server. Make sure app.py is running!")
    except Exception as e:
        print(f"❌ Error: {e}")

def test_ping():
    """Test the ping endpoint"""
    try:
        response = requests.get("http://localhost:5001/ping")
        print(f"🏓 Ping response: {response.text}")
        return response.status_code == 200
    except:
        return False

if __name__ == "__main__":
    print("🚀 Testing RecruitEdge API")
    print("=" * 60)
    
    # Test ping first
    if test_ping():
        print("✅ Server is running")
        
        print("\n" + "="*60)
        print("TESTING BASIC ENDPOINT (Apollo only, 6 contacts)")
        print("="*60)
        test_basic_endpoint()
        
        print("\n" + "="*60)
        print("TESTING ADVANCED ENDPOINT (Apollo + PDL + OpenAI, 3 contacts)")
        print("="*60)
        test_advanced_endpoint()
        
        print("\n" + "="*60)
        print("🎉 Testing Complete!")
        print("📁 Check test_basic_output.csv and test_output.csv")
        print("🔍 Compare the difference between Basic (9 fields) and Advanced (17 fields)")
        
    else:
        print("❌ Server not responding. Start app.py first!")
        print("Run: python app.py")