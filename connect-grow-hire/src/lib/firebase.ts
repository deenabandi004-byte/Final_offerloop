// src/config/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';  // ← ADD THIS LINE

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCxcZbNwbh09DFw70tBQUSoqBIDaXNwZdE",
  authDomain: "offerloop-native.firebaseapp.com",
  projectId: "offerloop-native",
  storageBucket: "offerloop-native.firebasestorage.app",
  messagingSenderId: "184607281467",
  appId: "1:184607281467:web:eab1b0e8be341aa8c5271e"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service  
export const db = getFirestore(app);

// Initialize Firebase Storage and get a reference to the service  // ← ADD THIS LINE
export const storage = getStorage(app);                             // ← ADD THIS LINE

export default app;