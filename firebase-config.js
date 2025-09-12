import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCxcZbNwbh09DFw70tBQUSoqBIDaXNwZdE",
  authDomain: "offerloop-native.firebaseapp.com",
  projectId: "offerloop-native",
  storageBucket: "offerloop-native.firebasestorage.app",
  messagingSenderId: "184607281467",
  appId: "1:184607281467:web:eab1b0e8be341aa8c5271e"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

export const auth = getAuth(app);

export default app;
