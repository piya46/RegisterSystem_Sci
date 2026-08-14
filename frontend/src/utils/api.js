import axios from 'axios';
import { getTurnstileToken as getCloudflareTurnstileToken } from './turnstile';

const legacyApiRoot = import.meta.env.VITE_API_URL;
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (legacyApiRoot ? `${legacyApiRoot.replace(/\/+$/, '')}/api` : '/api');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true
});

function readCookie(name) {
  return document.cookie
    .split('; ')
    .map((value) => value.split('='))
    .find(([key]) => key === name)?.slice(1).join('=') || '';
}

const SCOPED_TOKEN_ENDPOINTS = [
  '/auth/me',
  '/participants/register-onsite',
  '/participants/checkin-by-qr',
];

// Interceptor สำหรับ Kiosk Mode และ Self-Register Mode
// แนบ scoped token เฉพาะ endpoint ที่ต้องใช้จริง เพื่อไม่ให้ token ติดไปกับทุก API
api.interceptors.request.use(config => {
  const kioskToken = sessionStorage.getItem('kioskToken');
  const url = config.url || '';
  const shouldAttachScopedToken = SCOPED_TOKEN_ENDPOINTS.some((endpoint) => url.startsWith(endpoint));
  if (kioskToken && shouldAttachScopedToken) {
    config.headers.Authorization = `Bearer ${kioskToken}`;
  }
  const method = String(config.method || 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = readCookie('csrfToken');
    if (csrfToken) config.headers['X-CSRF-Token'] = decodeURIComponent(csrfToken);
  }
  return config;
});

/* (โค้ด Auth, Admin, Session, Participant, Point, Fields, Dashboard) */
export const login = (data) => api.post('/auth/login', data);
export const googleLogin = (token) => api.post('/auth/google-login', { token });
export const getMe = () => api.get('/auth/me');
export const logout = () => api.post('/sessions/logout');
export const verifyUser = (data) => api.post('/auth/verify', data);
export const requestPasswordReset = (username) => api.post('/auth/forgot-password', { username });
export const resetPasswordWithOtp = (username, otp, newPassword) => api.post('/auth/reset-password-otp', { username, otp, newPassword });
export const getParticipantAuthProviders = async () => {
  const res = await api.get('/participant-auth/providers');
  return res.data;
};
export const requestParticipantEmailOtp = async (email, context = {}) => {
  const res = await api.post('/participant-auth/email/request-otp', { email, ...context });
  return res.data;
};
export const verifyParticipantEmailOtp = async (challengeId, otp, participantId = null) => {
  const res = await api.post('/participant-auth/email/verify-otp', { challengeId, otp, ...(participantId ? { participantId } : {}) });
  return res.data;
};
export const getParticipantMe = async (token) => {
  const res = await api.get('/participant-auth/me', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.data;
};
export const logoutParticipantSession = async (token) => {
  const res = await api.post('/participant-auth/logout', null, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.data;
};
export const refreshParticipantSession = async (token) => {
  const res = await api.post('/participant-auth/refresh', null, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.data;
};
export const switchParticipantEvent = async (participantId, token) => {
  const res = await api.post('/participant-auth/switch-event', { participantId }, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.data;
};
export const logoutAllParticipantSessions = async (token, stepUpToken = '') => {
  const res = await api.post('/participant-auth/logout-all', { stepUpToken }, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.data;
};
export const listParticipantSessions = async (token) => {
  const res = await api.get('/participant-auth/sessions', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.data;
};
export const revokeParticipantSession = async (sessionId, token) => {
  const res = await api.post(`/participant-auth/sessions/${sessionId}/revoke`, null, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.data;
};
export const requestParticipantStepUpOtp = async (action, token) => {
  const res = await api.post('/participant-auth/step-up/request-otp', { action }, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.data;
};
export const verifyParticipantStepUpOtp = async (challengeId, otp, action, token) => {
  const res = await api.post('/participant-auth/step-up/verify-otp', { challengeId, otp, action }, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.data;
};
export const startParticipantLineLogin = async (payload = {}) => {
  const res = await api.post('/participant-auth/line/start', payload);
  return res.data;
};
export const startParticipantLineLink = async (stepUpToken, payload = {}, token) => {
  const res = await api.post('/participant-auth/line/link/start', { ...payload, stepUpToken }, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.data;
};
export const loginParticipantWithLine = async (payload = {}) => {
  const res = await api.post('/participant-auth/line/login', payload);
  return res.data;
};
export const loginParticipantWithLiff = async (idToken, context = {}) => {
  const res = await api.post('/participant-auth/liff/verify', { idToken, ...context });
  return res.data;
};
export const unlinkParticipantLine = async (stepUpToken, token) => {
  const res = await api.post('/participant-auth/line/unlink', { stepUpToken }, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.data;
};

export const listAdmins = () => api.get('/admins');
export const createAdmin = (data) => api.post('/admins', data);
export const updateAdmin = (id, data) => api.put(`/admins/${id}`, data);
export const deleteAdmin = (id) => api.delete(`/admins/${id}`);
export const requestActionOtp = () => api.post('/admins/request-action-otp');
export const resetUserPassword = (userId, newPassword, otp = null) => api.post('/admins/reset-password', { userId, newPassword, otp });
export const updateStaff = (id, data) => api.put(`/admins/staff/${id}`, data);
export const changePassword = (data) => api.post('/admins/change-password', data);
export const uploadAvatar = (file) => {
  const formData = new FormData(); formData.append("avatar", file);
  return api.post("/admins/upload-avatar", formData, { headers: { "Content-Type": "multipart/form-data" } });
};
export const getCronLogs = () => api.get('/admins/cron-logs');

export const listSessions = () => api.get('/sessions');
export const deleteSessionById = (id) => api.delete(`/sessions/${id}`);
export const deleteSessionByUserId = (userId) => api.delete(`/sessions/user/${userId}`);
export const refreshSession = () => api.post('/sessions/refresh');
export const revokeSession = (id) => api.post(`/sessions/revoke/${id}`);
export const revokeAllSessionByUser = (userId) => api.post(`/sessions/revoke-all/${userId}`);

export const createParticipant = (data, idempotencyKey) => api.post('/participants/public', data, {
  headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
});
export const createParticipantByStaff = async (eventIdOrPayload, payload = null) => {
  const data = payload === null ? eventIdOrPayload : { eventId: eventIdOrPayload, ...payload };
  const res = await api.post('/participants/register-onsite', data);
  return res.data;
};
export const verifyKioskToken = (token) => api.post('/public/kiosk-token/verify', { token });

// ----------------------------------------------------------------------
// Registration Reuse & Resend Ticket
// ----------------------------------------------------------------------

export const requestReuseOtp = async (eventSlug, email, cfToken) => {
  const res = await api.post(`/public/events/${eventSlug}/reuse/request-otp`, { email, cfToken });
  return res.data;
};

export const verifyReuseOtp = async (eventSlug, challengeId, otp) => {
  const res = await api.post(`/public/events/${eventSlug}/reuse/confirm`, { challengeId, otp });
  return res.data;
};

export const requestResendTicket = async ({ phone, eventSlug, eventYear, cfToken }) => {
  const res = await api.post(`/participants/resend-ticket`, { phone, eventSlug, eventYear, cfToken });
  return res.data;
};

export const listParticipants = (params) => api.get('/participants', { params });
export const updateParticipant = (id, data, context = {}) => api.put(`/participants/${id}`, { ...data, ...context });
export const deleteParticipant = (id, context = {}) => api.delete(`/participants/${id}`, { params: context });
export const checkinByQr = (data) => api.post('/participants/checkin-by-qr', data);
export const resendParticipantTicket = (id, context = {}) => api.post(`/participants/${id}/resend-ticket`, context);
export const searchParticipants = (params) => api.get('/participants/search', { params });
export const registerOnsiteByKiosk = (data) => api.post('/participants/register-onsite', data);
export const downloadPdfReport = (params) => api.get('/participants/download-report-pdf', { params, responseType: 'blob' });

export const listRegistrationPoints = (params) => api.get('/registration-points', { params });
export const listEnabledRegistrationPoints = (params) => api.get('/registration-points/enabled', { params });
export const createRegistrationPoint = (data) => api.post('/registration-points', data);
export const updateRegistrationPoint = (id, data) => api.put(`/registration-points/${id}`, data);
export const deleteRegistrationPoint = (id, params) => api.delete(`/registration-points/${id}`, { params });

export const listParticipantFields = (params) => api.get('/participant-fields', { params });
export const createParticipantField = (data) => api.post('/participant-fields', data);
export const updateParticipantField = (id, data) => api.put(`/participant-fields/${id}`, data);
export const deleteParticipantField = (id, params) => api.delete(`/participant-fields/${id}`, { params });

export const getDashboardStats = (params) => api.get('/dashboard/summary', { params });
export const getCheckinSummary = (params) => api.get('/dashboard/summary', { params });
export const getDashboardSummary = (params) => api.get('/dashboard/summary', { params });
export const getDashboardComparison = (params) => api.get('/dashboard/comparison', { params });
export const createIdempotencyKey = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
};
export const createDonation = (data, idempotencyKey) => api.post('/donations', data, {
  headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
});
export const getDonationSummary = (params) => api.get('/donations/summary', { params });
export const updateDonation = (id, data) => api.put(`/donations/${id}`, data);
export const deleteDonation = (id, params) => api.delete(`/donations/${id}`, { params });
export const getStoredObjectAccess = (reference) => api.post('/uploads/access', { reference });
export const uploadEventMedia = (file, eventId, purpose = 'event_media') => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('eventId', eventId);
  formData.append('purpose', purpose);
  return api.post('/uploads', formData);
};
export const uploadDonationSlip = (file, eventId) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('eventId', eventId);
  return api.post('/uploads/slips', formData);
};

export const getSystemSettings = () => api.get('/settings');
export const updateSystemSettings = (data) => api.put('/settings', data);
export const getEventYears = () => api.get('/settings/event-years');
export const getCurrentEvent = () => api.get('/events/current');
export const getEventCatalog = () => api.get('/events/catalog');
export const getEventById = (id) => api.get(`/events/${encodeURIComponent(id)}`);
export const getLegacyMigrationPreview = () => api.get('/events/migration-preview');
export const runLegacyEventMigration = ({ apply = false, confirmation = "" } = {}) => (
  api.post('/events/migrate-legacy', { apply, confirmation })
);
export const getPublicEvent = (slug) => api.get(`/public/events/${encodeURIComponent(slug)}`);
export const getPublicEventById = (eventId) => api.get(`/public/events/by-id/${encodeURIComponent(eventId)}`);
export const getPublicCurrentEvent = () => api.get('/public/events/current');
export const requestRegistrationReuseOtp = (slug, email) => api.post(`/public/events/${encodeURIComponent(slug)}/reuse/request-otp`, { email });
export const confirmRegistrationReuseOtp = (slug, data) => api.post(`/public/events/${encodeURIComponent(slug)}/reuse/confirm`, data);
export const createOrganization = (data) => api.post('/events/organizations', data);
export const updateOrganization = (id, data) => api.put(`/events/organizations/${id}`, data);
export const createEventSeries = (data) => api.post('/events/series', data);
export const updateEventSeries = (id, data) => api.put(`/events/series/${id}`, data);
export const createEvent = (data) => api.post('/events', data);
export const updateEvent = (id, data) => api.put(`/events/${id}`, data);
export const deleteEvent = (id) => api.delete(`/events/${id}`);
export const activateEvent = (id) => api.post(`/events/${id}/activate`);
export const publishEvent = (id, note = '') => api.post(`/events/${id}/publish`, { note });
export const updateEventStatus = (id, status) => api.post(`/events/${id}/status`, { status });
export const updateEventLayout = (id, layoutKey, config) => api.put(`/events/${id}/layouts/${layoutKey}`, { config });
export const cloneEventSettings = (sourceEventId, targetEventId) => api.post('/events/clone-settings', { sourceEventId, targetEventId });
export const listPackages = (params) => api.get('/packages', { params });
export const createPackage = (data) => api.post('/packages', data);
export const updatePackage = (id, data) => api.put(`/packages/${id}`, data);
export const deletePackage = (id) => api.delete(`/packages/${id}`);

export const generateKioskToken = (pointId, context = {}) => api.post('/public/kiosk-token', { pointId, ...context });
export const getPublicReportData = (params) => api.get('/public/report', { params });
export const getPublicDashboardStats = (params) => api.get('/public/dashboard', { params });

export const listPrizes = (params) => api.get('/prizes', { params });
export const createPrize = (data) => api.post('/prizes', data);
export const deletePrize = (id, params) => api.delete(`/prizes/${id}`, { params });
export const drawPrize = (prizeId, params) => api.post(`/prizes/draw/${prizeId}`, null, { params });
export const cancelPrizeWinner = (prizeId, winnerId, params) => api.post('/prizes/cancel', { prizeId, winnerId, ...(params || {}) });

// 🌟 [เพิ่ม] API สำหรับสร้างลิงก์ QR ให้คนทั่วไปแสกน (Self-Register)
export const generateSelfRegisterLink = (data) => api.post('/public/self-register-link', data);
export const requestShortSession = (masterToken) => api.post('/public/request-short-session', { masterToken });

export const getPublicPrizes = (params) => api.get('/public/prizes', { params });
export const restorePrizeRight = (id, context = {}) => api.put(`/participants/restore-prize/${id}`, context);

// Helper สำหรับดึง Turnstile Token
export const getTurnstileToken = async (action = 'generic', timeoutMs) => {
  return getCloudflareTurnstileToken(action, timeoutMs);
};


export default api;
