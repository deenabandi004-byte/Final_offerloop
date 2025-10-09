import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  where,
  limit,
  getDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface Contact {
  id?: string;
  firstName: string;
  lastName: string;
  linkedinUrl: string;
  email: string;
  company: string;
  jobTitle: string;
  college: string;
  location: string;
  firstContactDate: string;
  status: string;
  lastContactDate: string;
  emailSubject?: string;
  emailBody?: string;
}

export interface ProfessionalInfo {
  firstName?: string;
  lastName?: string;
  university?: string;
  fieldOfStudy?: string;
  currentDegree?: string;
  graduationYear?: string;
  preferredLocations?: string[];
  jobTypes?: string[];
  targetJobTitles?: string[];
  targetCompanies?: string[];
  targetIndustries?: string[];
}

export interface ResumeData {
  name?: string;
  year?: string;
  major?: string;
  university?: string;
}

export class FirebaseApiService {
  async getContacts(userId: string): Promise<Contact[]> {
    try {
      const contactsRef = collection(db, 'users', userId, 'contacts');
      const q = query(contactsRef, orderBy('firstContactDate', 'desc'));
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Contact));
    } catch (error) {
      console.error('Error getting contacts:', error);
      throw error;
    }
  }

  async createContact(userId: string, contact: Omit<Contact, 'id'>): Promise<Contact> {
    try {
      const contactsRef = collection(db, 'users', userId, 'contacts');
      const docRef = await addDoc(contactsRef, {
        ...contact,
        createdAt: new Date().toISOString()
      });
      
      return {
        id: docRef.id,
        ...contact
      };
    } catch (error) {
      console.error('Error creating contact:', error);
      throw error;
    }
  }

  async updateContact(userId: string, contactId: string, updates: Partial<Contact>): Promise<void> {
    try {
      const contactRef = doc(db, 'users', userId, 'contacts', contactId);
      await updateDoc(contactRef, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating contact:', error);
      throw error;
    }
  }

  async deleteContact(userId: string, contactId: string): Promise<void> {
    try {
      const contactRef = doc(db, 'users', userId, 'contacts', contactId);
      await deleteDoc(contactRef);
    } catch (error) {
      console.error('Error deleting contact:', error);
      throw error;
    }
  }

  async bulkCreateContacts(userId: string, contacts: Partial<Contact>[]): Promise<{created: number, skipped: number}> {
    try {
      const contactsRef = collection(db, 'users', userId, 'contacts');
      let created = 0;
      let skipped = 0;
      const today = new Date().toLocaleDateString();

      for (const contact of contacts) {
        let isDuplicate = false;
        
        if (contact.email) {
          const emailQuery = query(contactsRef, where('email', '==', contact.email), limit(1));
          const emailSnapshot = await getDocs(emailQuery);
          isDuplicate = !emailSnapshot.empty;
        }
        
        if (!isDuplicate && contact.linkedinUrl) {
          const linkedinQuery = query(contactsRef, where('linkedinUrl', '==', contact.linkedinUrl), limit(1));
          const linkedinSnapshot = await getDocs(linkedinQuery);
          isDuplicate = !linkedinSnapshot.empty;
        }

        if (isDuplicate) {
          skipped++;
          continue;
        }

        await addDoc(contactsRef, {
          firstName: contact.firstName || '',
          lastName: contact.lastName || '',
          linkedinUrl: contact.linkedinUrl || '',
          email: contact.email || '',
          company: contact.company || '',
          jobTitle: contact.jobTitle || '',
          college: contact.college || '',
          location: contact.location || '',
          firstContactDate: today,
          status: 'Not Contacted',
          lastContactDate: today,
          createdAt: new Date().toISOString(),
          emailSubject: contact.emailSubject || '',
          emailBody: contact.emailBody || ''
        });
        created++;
      }

      return { created, skipped };
    } catch (error) {
      console.error('Error bulk creating contacts:', error);
      throw error;
    }
  }

  async getProfessionalInfo(userId: string): Promise<ProfessionalInfo | null> {
    try {
      const profileRef = doc(db, 'users', userId, 'profile', 'professional');
      const profileDoc = await getDoc(profileRef);
      
      if (profileDoc.exists()) {
        return profileDoc.data() as ProfessionalInfo;
      }
      return null;
    } catch (error) {
      console.error('Error getting professional info:', error);
      throw error;
    }
  }

  async saveProfessionalInfo(userId: string, info: ProfessionalInfo): Promise<void> {
    try {
      const profileRef = doc(db, 'users', userId, 'profile', 'professional');
      await setDoc(profileRef, {
        ...info,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving professional info:', error);
      throw error;
    }
  }

  async getResumeData(userId: string): Promise<ResumeData | null> {
    try {
      const resumeRef = doc(db, 'users', userId, 'profile', 'resume');
      const resumeDoc = await getDoc(resumeRef);
      
      if (resumeDoc.exists()) {
        return resumeDoc.data() as ResumeData;
      }
      return null;
    } catch (error) {
      console.error('Error getting resume data:', error);
      throw error;
    }
  }

  async clearAllContacts(userId: string): Promise<void> {
    try {
      const contactsRef = collection(db, 'users', userId, 'contacts');
      const querySnapshot = await getDocs(contactsRef);
      
      const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      console.log(`Deleted ${querySnapshot.docs.length} contacts for user ${userId}`);
    } catch (error) {
      console.error('Error clearing all contacts:', error);
      throw error;
    }
  }

  async saveResumeData(userId: string, data: ResumeData): Promise<void> {
    try {
      const resumeRef = doc(db, 'users', userId, 'profile', 'resume');
      await setDoc(resumeRef, {
        ...data,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving resume data:', error);
      throw error;
    }
  }

  // ================================
  // Coffee Chat Prep Methods
  // ================================

  async createCoffeeChatPrep(userId: string, prepData: any) {
    try {
      const prepRef = collection(db, 'users', userId, 'coffee-chat-preps');
      const docRef = await addDoc(prepRef, {
        ...prepData,
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      return docRef;
    } catch (error) {
      console.error('Error creating coffee chat prep:', error);
      throw error;
    }
  }

  async getCoffeeChatPreps(userId: string, limitCount?: number) {
    try {
      const prepsRef = collection(db, 'users', userId, 'coffee-chat-preps');
      let q = query(prepsRef, orderBy('createdAt', 'desc'));
      
      if (limitCount) {
        q = query(prepsRef, orderBy('createdAt', 'desc'), limit(limitCount));
      }
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting coffee chat preps:', error);
      throw error;
    }
  }

  async updateCoffeeChatPrep(userId: string, prepId: string, updates: any) {
    try {
      const prepRef = doc(db, 'users', userId, 'coffee-chat-preps', prepId);
      await updateDoc(prepRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating coffee chat prep:', error);
      throw error;
    }
  }

  async getCoffeeChatPrepById(userId: string, prepId: string) {
    try {
      const prepRef = doc(db, 'users', userId, 'coffee-chat-preps', prepId);
      const docSnap = await getDoc(prepRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (error) {
      console.error('Error getting coffee chat prep:', error);
      throw error;
    }
  }
}

export const firebaseApi = new FirebaseApiService();