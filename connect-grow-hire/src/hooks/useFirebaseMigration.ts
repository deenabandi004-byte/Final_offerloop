import { useEffect, useState } from 'react';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { firebaseApi } from '../services/firebaseApi';

export const useFirebaseMigration = () => {
  const { user } = useFirebaseAuth();
  const [migrationComplete, setMigrationComplete] = useState(false);
  const [migrationInProgress, setMigrationInProgress] = useState(false);

  useEffect(() => {
    if (user && !migrationComplete && !migrationInProgress) {
      migrateLocalStorageData();
    }
  }, [user, migrationComplete, migrationInProgress]);

  const migrateLocalStorageData = async () => {
    if (!user) return;

    setMigrationInProgress(true);
    
    try {
      const migrationKey = `firebase_migration_${user.uid}`;
      if (localStorage.getItem(migrationKey)) {
        setMigrationComplete(true);
        setMigrationInProgress(false);
        return;
      }

      console.log('Starting Firebase migration for user:', user.uid);

      const professionalInfoStr = localStorage.getItem('professionalInfo');
      if (professionalInfoStr) {
        try {
          const professionalInfo = JSON.parse(professionalInfoStr);
          await firebaseApi.saveProfessionalInfo(user.uid, professionalInfo);
          console.log('Migrated professional info to Firestore');
        } catch (error) {
          console.error('Failed to migrate professional info:', error);
        }
      }

      // Resume data migration - commented out as saveResumeData method doesn't exist
      // const resumeDataStr = localStorage.getItem('resumeData');
      // if (resumeDataStr) {
      //   try {
      //     const resumeData = JSON.parse(resumeDataStr);
      //     // await firebaseApi.saveResumeData(user.uid, resumeData);
      //     console.log('Resume data migration skipped - method not implemented');
      //   } catch (error) {
      //     console.error('Failed to migrate resume data:', error);
      //   }
      // }

      const contactKeys = Object.keys(localStorage).filter(key => key.startsWith('contacts_'));
      for (const key of contactKeys) {
        try {
          const contactsStr = localStorage.getItem(key);
          if (contactsStr) {
            const contacts = JSON.parse(contactsStr);
            if (Array.isArray(contacts) && contacts.length > 0) {
              await firebaseApi.bulkCreateContacts(user.uid, contacts);
              console.log(`Migrated ${contacts.length} contacts from ${key}`);
            }
          }
        } catch (error) {
          console.error(`Failed to migrate contacts from ${key}:`, error);
        }
      }

      localStorage.setItem(migrationKey, 'true');
      setMigrationComplete(true);
      console.log('Firebase migration completed successfully');

    } catch (error) {
      console.error('Firebase migration failed:', error);
    } finally {
      setMigrationInProgress(false);
    }
  };

  return {
    migrationComplete,
    migrationInProgress,
    isLoading: migrationInProgress, // Add this line - alias migrationInProgress as isLoading
    migrateLocalStorageData
  };
};