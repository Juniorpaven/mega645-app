import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from "firebase/auth";

// Cấu hình web Firebase là thông tin công khai (không phải bí mật) — bảo mật nằm ở firestore.rules.
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

/**
 * Promise hoàn tất khi đã đăng nhập (ẩn danh). Mọi thao tác Firestore phải chờ promise này,
 * nếu không listener sẽ bị từ chối quyền (rules yêu cầu request.auth != null) và dừng hẳn.
 */
export const authReady: Promise<User> = new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, user => {
        if (user) {
            unsubscribe();
            resolve(user);
        }
    });
    signInAnonymously(auth).catch(error => {
        console.error("🔥 Firebase: Lỗi đăng nhập:", error);
        reject(error);
    });
});
