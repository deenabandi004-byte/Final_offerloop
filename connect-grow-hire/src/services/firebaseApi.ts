// src/services/firebaseApi.ts
import { db } from '../lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';

// ================================
// TYPES
// ================================
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
  createdAt?: string;
  updatedAt?: string;

  // ================================
  // NEW: Gmail tracking fields
  // ================================
  gmailThreadId?: string;
  gmailMessageId?: string;
  gmailDraftId?: string;
  gmailDraftUrl?: string;
  hasUnreadReply?: boolean;
  notificationsMuted?: boolean;
  draftCreatedAt?: string;
  lastChecked?: string;
  mutedAt?: string;
}

export interface ProfessionalInfo {
  firstName: string;
  lastName: string;
  university: string;
  currentDegree: string;
  fieldOfStudy: string;
  graduationYear: string;
  targetIndustries: string[];
  linkedinUrl?: string;
  careerGoals?: string;
}

export interface UserData {
  email: string;
  name: string;
  credits: number;
  maxCredits: number;
  tier: 'free' | 'pro';
  createdAt: string;
  lastLogin?: string;
  professionalInfo?: ProfessionalInfo;
  needsOnboarding?: boolean;
}

// ================================
// API
// ================================
export const firebaseApi = {
  // ----------------
  // USER MANAGEMENT
  // ----------------
  async createUser(uid: string, userData: Partial<UserData>): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await setDoc(
      userRef,
      {
        ...userData,
        createdAt: userData.createdAt || new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      },
      { merge: true }
    );
  },

  async getUser(uid: string): Promise<UserData | null> {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return null;
    return userSnap.data() as UserData;
  },

  async updateUser(uid: string, updates: Partial<UserData>): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      ...updates,
      lastLogin: new Date().toISOString(),
    });
  },

  async updateCredits(uid: string, credits: number): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, { credits });
  },

  // ----------------
  // PROFESSIONAL INFO
  // ----------------
  async saveProfessionalInfo(uid: string, info: ProfessionalInfo): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      professionalInfo: info,
      needsOnboarding: false,
    });
  },

  async getProfessionalInfo(uid: string): Promise<ProfessionalInfo | null> {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return null;

    const userData = userSnap.data() as UserData;
    return userData.professionalInfo || null;
  },

  // ----------------
  // CONTACT MANAGEMENT
  // ----------------
  async createContact(uid: string, contact: Omit<Contact, 'id'>): Promise<string> {
    const contactsRef = collection(db, 'users', uid, 'contacts');
    const newContactRef = doc(contactsRef);

    const contactData = {
      ...contact,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(newContactRef, contactData);
    return newContactRef.id;
  },

  async bulkCreateContacts(uid: string, contacts: Omit<Contact, 'id'>[]): Promise<void> {
    const batch = writeBatch(db);
    const contactsRef = collection(db, 'users', uid, 'contacts');

    for (const contact of contacts) {
      const newContactRef = doc(contactsRef);
      const contactData = {
        ...contact,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      batch.set(newContactRef, contactData);
    }

    await batch.commit();
  },

  async getContacts(uid: string): Promise<Contact[]> {
    const contactsRef = collection(db, 'users', uid, 'contacts');
    const snapshot = await getDocs(contactsRef);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[];
  },

  async getContact(uid: string, contactId: string): Promise<Contact | null> {
    const contactRef = doc(db, 'users', uid, 'contacts', contactId);
    const contactSnap = await getDoc(contactRef);
    if (!contactSnap.exists()) return null;

    return { id: contactSnap.id, ...contactSnap.data() } as Contact;
  },

  async updateContact(uid: string, contactId: string, updates: Partial<Contact>): Promise<void> {
    const contactRef = doc(db, 'users', uid, 'contacts', contactId);
    await updateDoc(contactRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  },

  async deleteContact(uid: string, contactId: string): Promise<void> {
    const contactRef = doc(db, 'users', uid, 'contacts', contactId);
    await deleteDoc(contactRef);
  },

  async clearAllContacts(uid: string): Promise<void> {
    const contactsRef = collection(db, 'users', uid, 'contacts');
    const snapshot = await getDocs(contactsRef);
    const batch = writeBatch(db);

    snapshot.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  },

  async findContactByEmail(uid: string, email: string): Promise<Contact | null> {
    const contactsRef = collection(db, 'users', uid, 'contacts');
    const q = query(contactsRef, where('email', '==', email));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    const d = snapshot.docs[0];
    return { id: d.id, ...d.data() } as Contact;
  },
};

export default firebaseApi;
