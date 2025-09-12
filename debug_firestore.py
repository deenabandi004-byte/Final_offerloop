from google.oauth2 import service_account
from google.cloud import firestore

try:
    gcred = service_account.Credentials.from_service_account_file('./firebase-creds.json')
    print(f'✅ Credentials loaded for project: {gcred.project_id}')
    
    print('\n--- Testing different connection approaches ---')
    
    try:
        db1 = firestore.Client(project=gcred.project_id, credentials=gcred, database='(default)')
        test_ref1 = db1.collection('test').document('test1')
        test_ref1.set({'test': 'approach1'})
        print('✅ Approach 1 (default database) - SUCCESS')
    except Exception as e:
        print(f'❌ Approach 1 (default database) - FAILED: {e}')
    
    try:
        db2 = firestore.Client(project=gcred.project_id, credentials=gcred)
        test_ref2 = db2.collection('test').document('test2')
        test_ref2.set({'test': 'approach2'})
        print('✅ Approach 2 (no explicit database) - SUCCESS')
    except Exception as e:
        print(f'❌ Approach 2 (no explicit database) - FAILED: {e}')
    
    for db_name in ['default', 'firestore', gcred.project_id]:
        try:
            db3 = firestore.Client(project=gcred.project_id, credentials=gcred, database=db_name)
            test_ref3 = db3.collection('test').document('test3')
            test_ref3.set({'test': f'approach3_{db_name}'})
            print(f'✅ Approach 3 ({db_name}) - SUCCESS')
            break
        except Exception as e:
            print(f'❌ Approach 3 ({db_name}) - FAILED: {e}')

except Exception as e:
    print(f'❌ Debug script failed: {e}')
    import traceback
    traceback.print_exc()
