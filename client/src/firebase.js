import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "automateai-76027.firebaseapp.com",
  projectId: "automateai-76027",
  storageBucket: "automateai-76027.firebasestorage.app",
  messagingSenderId: "251011606720",
  appId: "1:251011606720:web:0629bca7d41ad4ff93e525",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
