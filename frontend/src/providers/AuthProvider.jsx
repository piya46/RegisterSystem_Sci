import React, { createContext, useState, useEffect } from "react";
import * as api from "../utils/api";

export const AuthContext = createContext();

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token") || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function checkSession() {
      if (token) {
        try {
          const res = await api.getMe(token);
          if (!ignore) setUser(res.data);
        } catch (err) {
          setUser(null);
          setToken(null);
          localStorage.removeItem("token");
        } finally {
          setLoading(false);
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    }
    checkSession();
    return () => { ignore = true; };
  }, [token]);

  useEffect(() => {
    const interceptor = api.default.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401) {
          setUser(null);
          setToken(null);
          localStorage.removeItem("token");
        }
        return Promise.reject(err);
      }
    );
    return () => api.default.interceptors.response.eject(interceptor);
  }, []);

  // [Modified] รับ cfToken เพิ่มเข้ามา
  const login = async (username, password, cfToken) => {
    setLoading(true);
    try {
      const res = await api.login({ username, password, cfToken });
      setToken(res.data.token);
      localStorage.setItem("token", res.data.token);
      setUser(res.data.admin);
      return res.data.admin;
    } catch (err) {
      setUser(null);
      setToken(null);
      localStorage.removeItem("token");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    if (token) {
      try { await api.logout(token); } catch {}
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem("token");
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}