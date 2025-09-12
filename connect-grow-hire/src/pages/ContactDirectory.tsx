// src/pages/ContactDirectory.tsx
import React from 'react';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext'; // CHANGED
import ContactDirectoryComponent from '@/components/ContactDirectory';

const ContactDirectory: React.FC = () => {
  const { user } = useFirebaseAuth(); // CHANGED
  const userEmail = user?.email || 'user@example.com';
  
  return <ContactDirectoryComponent userEmail={userEmail} />;
};

export default ContactDirectory;