import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAnalytics, isSupported as analyticsIsSupported } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAH3zGBUUaKcfnFz2fcCuiZqWg9P1uW1ro",
  authDomain: "elctronic-shop.firebaseapp.com",  
  databaseURL: "https://elctronic-shop-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "elctronic-shop",
  storageBucket: "elctronic-shop.firebasestorage.app",
  messagingSenderId: "166440973273",
  appId: "1:166440973273:web:47e79bcd7ef7c3cc21dfc8",
  measurementId: "G-R98L82RXG6"
};

// Initialize Core Firebase Services Safely
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getDatabase(app);

// Initialize Analytics without letting network blocks break your code
analyticsIsSupported().then((supported) => {
  if (supported) {
    getAnalytics(app);
  }
}).catch((err) => {
  console.warn("Analytics initialization skipped safely:", err);
});