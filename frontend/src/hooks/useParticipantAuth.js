import { useState, useEffect, useCallback, useRef } from 'react';
import liff from '@line/liff';
import {
  getParticipantMe,
  loginParticipantWithLiff,
  logoutParticipantSession,
  refreshParticipantSession,
} from '../utils/api';

const PARTICIPANT_TOKEN_KEY = 'participant_token';
const PARTICIPANT_AUTH_CHANNEL = 'psevent-participant-auth';
const PARTICIPANT_REFRESH_LOCK_KEY = 'psevent:participant-refresh-lock';
const PARTICIPANT_REFRESH_LOCK_TTL_MS = 15 * 1000;
const DEFAULT_REFRESH_THRESHOLD_MS = Number(import.meta.env.VITE_PARTICIPANT_SESSION_REFRESH_THRESHOLD_MS) || 5 * 60 * 1000;

function configuredLiffId() {
  const value = String(import.meta.env.VITE_LIFF_ID || '').trim();
  if (!value || /your[_-]?liff[_-]?id|replace/i.test(value)) return '';
  return value;
}

function liffEventContext() {
  const params = new URLSearchParams(window.location.search);
  return {
    ...(params.get('eventId') ? { eventId: params.get('eventId') } : {}),
    ...(params.get('eventYear') ? { eventYear: params.get('eventYear') } : {}),
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function acquireRefreshLock(owner) {
  const now = Date.now();
  const current = parseJson(localStorage.getItem(PARTICIPANT_REFRESH_LOCK_KEY));
  if (current?.expiresAt > now && current.owner !== owner) return false;

  const nextLock = { owner, expiresAt: now + PARTICIPANT_REFRESH_LOCK_TTL_MS };
  localStorage.setItem(PARTICIPANT_REFRESH_LOCK_KEY, JSON.stringify(nextLock));
  const confirmed = parseJson(localStorage.getItem(PARTICIPANT_REFRESH_LOCK_KEY));
  return confirmed?.owner === owner;
}

function releaseRefreshLock(owner) {
  const current = parseJson(localStorage.getItem(PARTICIPANT_REFRESH_LOCK_KEY));
  if (current?.owner === owner) localStorage.removeItem(PARTICIPANT_REFRESH_LOCK_KEY);
}

// This hook handles participant-level authentication (e.g., via LINE or email link)
export default function useParticipantAuth() {
  const [participant, setParticipant] = useState(null);
  const [session, setSession] = useState(null);
  const [token, setToken] = useState(localStorage.getItem(PARTICIPANT_TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const refreshingRef = useRef(false);
  const tabIdRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const channelRef = useRef(null);

  const broadcastAuth = useCallback((message) => {
    channelRef.current?.postMessage({ ...message, source: tabIdRef.current });
  }, []);

  const clearLocalSession = useCallback(({ broadcast = false } = {}) => {
    localStorage.removeItem(PARTICIPANT_TOKEN_KEY);
    setToken(null);
    setParticipant(null);
    setSession(null);
    setAuthError('');
    if (broadcast) broadcastAuth({ type: 'PARTICIPANT_LOGOUT' });
  }, [broadcastAuth]);

  const login = useCallback((newToken, participantData, sessionData = null, { broadcast = true } = {}) => {
    localStorage.setItem(PARTICIPANT_TOKEN_KEY, newToken);
    setToken(newToken);
    setParticipant(participantData);
    setSession(sessionData);
    setAuthError('');
    if (broadcast) {
      broadcastAuth({
        type: 'PARTICIPANT_SESSION_UPDATED',
        payload: { token: newToken, participant: participantData, session: sessionData },
      });
    }
  }, [broadcastAuth]);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await logoutParticipantSession(token);
      } catch (err) {
        console.warn('Failed to notify participant logout', { status: err.response?.status || 0 });
      }
    }
    clearLocalSession({ broadcast: true });
  }, [clearLocalSession, token]);

  const fetchProfile = useCallback(async () => {
    try {
      if (token) {
        const res = await getParticipantMe(token);
        setParticipant(res.data?.participant || res.participant || null);
        setSession(res.data?.session || res.session || null);
        setAuthError('');
        setLoading(false);
        return;
      }

      const liffId = configuredLiffId();
      const isLiffRoute = window.location.pathname.startsWith('/liff/');
      if (!liffId || !isLiffRoute) {
        setLoading(false);
        return;
      }

      await liff.init({ liffId });
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }

      const idToken = liff.getIDToken();
      if (!idToken) throw new Error('LIFF_ID_TOKEN_UNAVAILABLE');
      const res = await loginParticipantWithLiff(idToken, liffEventContext());
      const data = res.data || {};
      login(data.token, data.participant, data.session);
      setLoading(false);
    } catch (err) {
      console.warn('Participant authentication failed', {
        status: err.response?.status || 0,
        code: err.response?.data?.code || err.code || 'AUTH_FAILED',
      });
      if (token) clearLocalSession({ broadcast: true });
      setAuthError(
        err.response?.data?.message
        || (err.message === 'LIFF_ID_TOKEN_UNAVAILABLE'
          ? 'ไม่สามารถยืนยันตัวตนผ่าน LIFF ได้ กรุณาเปิดผ่าน LINE อีกครั้ง'
          : 'ไม่สามารถเข้าสู่ระบบผู้เข้าร่วมได้')
      );
      setLoading(false);
    }
  }, [clearLocalSession, login, token]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;

    const channel = new BroadcastChannel(PARTICIPANT_AUTH_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event) => {
      if (event.data?.source === tabIdRef.current) return;

      if (event.data?.type === 'PARTICIPANT_SESSION_UPDATED') {
        const payload = event.data.payload || {};
        if (payload.token) localStorage.setItem(PARTICIPANT_TOKEN_KEY, payload.token);
        setToken(payload.token || null);
        setParticipant(payload.participant || null);
        setSession(payload.session || null);
        setLoading(false);
      }

      if (event.data?.type === 'PARTICIPANT_LOGOUT') {
        clearLocalSession({ broadcast: false });
        setLoading(false);
      }
    };

    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [clearLocalSession]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== PARTICIPANT_TOKEN_KEY || event.newValue === token) return;
      setToken(event.newValue || null);
      if (!event.newValue) {
        setParticipant(null);
        setSession(null);
        setLoading(false);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [token]);

  useEffect(() => {
    if (!token || !session?.expiresAt) return undefined;
    const expiresAtMs = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) return undefined;
    const refreshInMs = Math.max(30000, expiresAtMs - Date.now() - DEFAULT_REFRESH_THRESHOLD_MS);
    let retryId;

    const refreshNow = async () => {
      if (refreshingRef.current) return;
      if (!acquireRefreshLock(tabIdRef.current)) {
        retryId = window.setTimeout(refreshNow, 2000);
        return;
      }

      refreshingRef.current = true;
      try {
        const res = await refreshParticipantSession(token);
        const data = res.data || {};
        login(data.token, data.participant, data.session);
      } catch (err) {
        console.warn('Failed to refresh participant session', { status: err.response?.status || 0 });
        clearLocalSession({ broadcast: true });
      } finally {
        refreshingRef.current = false;
        releaseRefreshLock(tabIdRef.current);
      }
    };

    const timeoutId = window.setTimeout(() => {
      refreshNow();
    }, refreshInMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (retryId) window.clearTimeout(retryId);
    };
  }, [clearLocalSession, login, session?.expiresAt, token]);

  return {
    participant,
    session,
    token,
    loading,
    authError,
    login,
    logout,
    isAuthenticated: !!token
  };
}
