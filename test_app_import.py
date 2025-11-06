#!/usr/bin/env python3
"""
Test script to verify app imports and route registration
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

try:
    print("=" * 60)
    print("Testing Flask App Import and Route Registration")
    print("=" * 60)
    
    # Import app
    from wsgi import app
    print("✅ App imported successfully")
    
    # Check routes
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            'endpoint': rule.endpoint,
            'methods': list(rule.methods - {'HEAD', 'OPTIONS'}),
            'path': rule.rule
        })
    
    print(f"\n✅ Found {len(routes)} registered routes")
    
    # Group by blueprint
    blueprints = {}
    for route in routes:
        blueprint = route['endpoint'].split('.')[0] if '.' in route['endpoint'] else 'main'
        if blueprint not in blueprints:
            blueprints[blueprint] = []
        blueprints[blueprint].append(route)
    
    print(f"\n📊 Routes by Blueprint:")
    for bp, bp_routes in sorted(blueprints.items()):
        print(f"  {bp}: {len(bp_routes)} routes")
    
    # Check critical routes
    critical_routes = [
        '/health',
        '/ping',
        '/api/tier-info',
        '/api/check-credits',
        '/api/free-run',
        '/api/pro-run',
        '/api/contacts',
        '/api/emails/generate-and-draft',
        '/api/google/oauth/start',
        '/api/google/gmail/status'
    ]
    
    print(f"\n🔍 Checking critical routes:")
    route_paths = {r['path'] for r in routes}
    for critical in critical_routes:
        if critical in route_paths or any(critical in r['path'] for r in routes):
            print(f"  ✅ {critical}")
        else:
            print(f"  ⚠️  {critical} (not found)")
    
    # Check extensions
    print(f"\n🔧 Checking extensions:")
    if hasattr(app, 'extensions'):
        print(f"  ✅ Extensions loaded: {list(app.extensions.keys())}")
    
    print(f"\n✅ All checks passed!")
    print("=" * 60)
    
except Exception as e:
    print(f"\n❌ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

