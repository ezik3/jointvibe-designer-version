import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBugO9mtf3XvsQFS-DDNr1k7MKXh_kxHX8",
  authDomain: "joint-vibe-auth.firebaseapp.com",
  projectId: "joint-vibe-auth",
  storageBucket: "joint-vibe-auth.firebasestorage.app",
  messagingSenderId: "514996836219",
  appId: "1:514996836219:web:0fd6864050a56116a70fde",
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
