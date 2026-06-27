import React, { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../utils/api";
import { AuthContext } from "./AuthContext";

const IDLE_TIMEOUT_MS = Number(import.meta.env.VITE_SESSION_IDLE_TIMEOUT_MS) || 30 * 60 * 1000;
const SESSION_CHECK_INTERVAL_MS = Number(import.meta.env.VITE_SESSION_CHECK_INTERVAL_MS) || 60 * 1000;
const DEFAULT_REFRESH_THRESHOLD_MS = Number(import.meta.env.VITE_SESSION_REFRESH_THRESHOLD_MS) || 5 * 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'];

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [sessionMeta, setSessionMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const lastActivityRef = useRef(Date.now());
  const refreshingRef = useRef(false);

  const setSessionFromPayload = useCallback((payload) => {
    setSessionMeta(payload?.session || null);
  }, []);

  // 1. ตรวจสอบ Session ตอนโหลดแอปครั้งแรก
  useEffect(() => {
    let ignore = false;
    async function checkSession() {
      try {
        // ยิงไปถาม Backend ตรงๆ ไม่ต้องสนเรื่อง Token เพราะ Cookie จะถูกส่งไปอัตโนมัติ
        const res = await api.getMe();
        if (!ignore) {
          setUser(res.data);
          setSessionFromPayload(res.data);
          lastActivityRef.current = Date.now();
        }
      } catch {
        // ถ้าคุกกี้หมดอายุ หรือไม่มีคุกกี้ API จะตีกลับ 401 เราก็แค่เซ็ต user เป็น null
        if (!ignore) {
          setUser(null);
          setSessionMeta(null);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    checkSession();
    return () => { ignore = true; };
  }, [setSessionFromPayload]);

  // 2. ดักจับ Error 401 หาก Session หมดอายุระหว่างการใช้งาน
  useEffect(() => {
    const interceptor = api.default.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401) {
          setUser(null);
          setSessionMeta(null);
          // เอา localStorage.removeItem ทิ้งไปได้เลย
        }
        return Promise.reject(err);
      }
    );
    return () => api.default.interceptors.response.eject(interceptor);
  }, []);

  // 3. ฟังก์ชัน Login
  const login = useCallback(async (username, password, cfToken) => {
    setLoading(true);
    try {
      const res = await api.login({ username, password, cfToken });
      // Backend ทำการ Set Cookie ให้แล้ว เราแค่เก็บข้อมูล Admin ไว้ใน State ของ React
      setUser(res.data.admin);
      setSessionFromPayload(res.data);
      lastActivityRef.current = Date.now();
      return res.data.admin;
    } catch (err) {
      setUser(null);
      setSessionMeta(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setSessionFromPayload]);

  // 4. ฟังก์ชัน Logout
  const logout = useCallback(async () => {
    setLoading(true);
    try { 
      // สั่งยิง API Logout เพื่อให้ Backend เคลียร์ Session ใน DB และสั่ง res.clearCookie('token')
      await api.logout(); 
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      setUser(null);
      setSessionMeta(null);
      setLoading(false);
    }
  }, []);

  const updateUser = useCallback((newUserData) => {
    setUser(prev => ({ ...prev, ...newUserData }));
  }, []);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    markActivity();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') markActivity();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [markActivity, user]);

  useEffect(() => {
    if (!user) return undefined;

    const interval = window.setInterval(async () => {
      const now = Date.now();
      if (now - lastActivityRef.current > IDLE_TIMEOUT_MS) {
        await logout();
        return;
      }

      const expiresAtMs = sessionMeta?.expiresAt ? new Date(sessionMeta.expiresAt).getTime() : 0;
      const refreshThresholdMs = Number(sessionMeta?.refreshThresholdMs) || DEFAULT_REFRESH_THRESHOLD_MS;
      if (!expiresAtMs || expiresAtMs - now > refreshThresholdMs || refreshingRef.current) return;

      refreshingRef.current = true;
      try {
        const res = await api.refreshSession();
        setSessionFromPayload(res.data);
      } catch {
        await logout();
      } finally {
        refreshingRef.current = false;
      }
    }, SESSION_CHECK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [logout, sessionMeta, setSessionFromPayload, user]);

  // ✅ ลบ token ออกจาก Context value เพราะไม่ต้องใช้แล้ว
  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
