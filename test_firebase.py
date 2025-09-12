from google.oauth2 import service_account
from google.cloud import firestore

try:
    gcred = service_account.Credentials.from_service_account_file('./firebase-creds.json')
    print(f'✅ Credentials loaded for project: {gcred.project_id}')
    
    database_names = ['(default)', 'default', None]
    
    for db_name in database_names:
        try:
            print(f'\n--- Testing database name: {db_name} ---')
            if db_name is None:
                db = firestore.Client(project=gcred.project_id, credentials=gcred)
                print('✅ Firestore client created (no database specified)')
            else:
                db = firestore.Client(project=gcred.project_id, credentials=gcred, database=db_name)
                print(f'✅ Firestore client created for database: {db_name}')
            
            test_ref = db.collection('test').document('connection_test')
            test_ref.set({'timestamp': firestore.SERVER_TIMESTAMP, 'status': 'connected'})
            print('✅ Firestore write test successful')

            doc = test_ref.get()
            if doc.exists:
                print('✅ Firestore read test successful')
                print(f'✅ Test document data: {doc.to_dict()}')
                print(f'🎉 SUCCESS: Database connection works with: {db_name}')
                break
            else:
                print('❌ Firestore read test failed - document not found')
        except Exception as e:
            print(f'❌ Database {db_name} failed: {e}')

except Exception as e:
    print(f'❌ Firebase connection test failed: {e}')
    import traceback
    traceback.print_exc()
