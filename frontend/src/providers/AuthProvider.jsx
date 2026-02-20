import React, { createContext, useState, useEffect } from "react";
import * as api from "../utils/api";

export const AuthContext = createContext();

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1. ตรวจสอบ Session ตอนโหลดแอปครั้งแรก
  useEffect(() => {
    let ignore = false;
    async function checkSession() {
      try {
        // ยิงไปถาม Backend ตรงๆ ไม่ต้องสนเรื่อง Token เพราะ Cookie จะถูกส่งไปอัตโนมัติ
        const res = await api.getMe();
        if (!ignore) setUser(res.data);
      } catch (err) {
        // ถ้าคุกกี้หมดอายุ หรือไม่มีคุกกี้ API จะตีกลับ 401 เราก็แค่เซ็ต user เป็น null
        if (!ignore) setUser(null);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    checkSession();
    return () => { ignore = true; };
  }, []);

  // 2. ดักจับ Error 401 หาก Session หมดอายุระหว่างการใช้งาน
  useEffect(() => {
    const interceptor = api.default.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401) {
          setUser(null);
          // เอา localStorage.removeItem ทิ้งไปได้เลย
        }
        return Promise.reject(err);
      }
    );
    return () => api.default.interceptors.response.eject(interceptor);
  }, []);

  // 3. ฟังก์ชัน Login
  const login = async (username, password, cfToken) => {
    setLoading(true);
    try {
      const res = await api.login({ username, password, cfToken });
      // Backend ทำการ Set Cookie ให้แล้ว เราแค่เก็บข้อมูล Admin ไว้ใน State ของ React
      setUser(res.data.admin);
      return res.data.admin;
    } catch (err) {
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // 4. ฟังก์ชัน Logout
  const logout = async () => {
    setLoading(true);
    try { 
      // สั่งยิง API Logout เพื่อให้ Backend เคลียร์ Session ใน DB และสั่ง res.clearCookie('token')
      await api.logout(); 
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      setUser(null);
      setLoading(false);
    }
  };

  const updateUser = (newUserData) => {
    setUser(prev => ({ ...prev, ...newUserData }));
  };

  // ✅ ลบ token ออกจาก Context value เพราะไม่ต้องใช้แล้ว
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}