import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDxscnmP04F4G7ugivuDdL-RE0VRkMYxdw",
    authDomain: "mega645-app.firebaseapp.com",
    projectId: "mega645-app",
    storageBucket: "mega645-app.firebasestorage.app",
    messagingSenderId: "828041077076",
    appId: "1:828041077076:web:1e5c364524c52d201ca8c1",
    measurementId: "G-7BMX4500WH"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// --- TỰ ĐỘNG ĐĂNG NHẬP (Ẩn danh) ---
signInAnonymously(auth)
    .then(() => {
        console.log("🔥 Firebase: Đã đăng nhập ẩn danh thành công!");
    })
    .catch((error) => {
        console.error("🔥 Firebase: Lỗi đăng nhập:", error);
    });

// Theo dõi trạng thái auth
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("🔥 User ID:", user.uid);
    } else {
        console.log("🔥 User signed out");
    }
});
