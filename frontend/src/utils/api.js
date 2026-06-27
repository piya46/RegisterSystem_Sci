import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api', 
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

export const createParticipant = (data) => api.post('/participants/public', data);
export const createParticipantByStaff = (data) => api.post('/participants/register-onsite', data);
export const listParticipants = (params) => api.get('/participants', { params });
export const updateParticipant = (id, data) => api.put(`/participants/${id}`, data);
export const deleteParticipant = (id) => api.delete(`/participants/${id}`);
export const checkinByQr = (data) => api.post('/participants/checkin-by-qr', data);
export const resendTicket = (data) => api.post('/participants/resend-ticket', data);
export const searchParticipants = (params) => api.get('/participants/search', { params });
export const registerOnsiteByKiosk = (data) => api.post('/participants/register-onsite', data);
export const downloadPdfReport = (params) => api.get('/participants/download-report-pdf', { params, responseType: 'blob' });

export const listRegistrationPoints = () => api.get('/registration-points');
export const listEnabledRegistrationPoints = () => api.get('/registration-points/enabled');
export const createRegistrationPoint = (data) => api.post('/registration-points', data);
export const updateRegistrationPoint = (id, data) => api.put(`/registration-points/${id}`, data);
export const deleteRegistrationPoint = (id) => api.delete(`/registration-points/${id}`);

export const listParticipantFields = () => api.get('/participant-fields');
export const createParticipantField = (data) => api.post('/participant-fields', data);
export const updateParticipantField = (id, data) => api.put(`/participant-fields/${id}`, data);
export const deleteParticipantField = (id) => api.delete(`/participant-fields/${id}`);

export const getDashboardStats = () => api.get('/dashboard/stats');
export const getCheckinSummary = (params) => api.get('/dashboard/checkin-summary', { params });
export const getDashboardSummary = (params) => api.get('/dashboard/summary', { params });
export const createDonation = (data) => api.post('/donations', data);
export const getDonationSummary = (params) => api.get('/donations/summary', { params });
export const updateDonation = (id, data) => api.put(`/donations/${id}`, data);
export const deleteDonation = (id) => api.delete(`/donations/${id}`);

export const getSystemSettings = () => api.get('/settings');
export const updateSystemSettings = (data) => api.put('/settings', data);
export const getEventYears = () => api.get('/settings/event-years');
export const getCurrentEvent = () => api.get('/events/current');
export const getEventCatalog = () => api.get('/events/catalog');
export const getLegacyMigrationPreview = () => api.get('/events/migration-preview');
export const runLegacyEventMigration = (dryRun = false) => api.post('/events/migrate-legacy', { dryRun });
export const createOrganization = (data) => api.post('/events/organizations', data);
export const updateOrganization = (id, data) => api.put(`/events/organizations/${id}`, data);
export const createEventSeries = (data) => api.post('/events/series', data);
export const updateEventSeries = (id, data) => api.put(`/events/series/${id}`, data);
export const createEvent = (data) => api.post('/events', data);
export const updateEvent = (id, data) => api.put(`/events/${id}`, data);
export const activateEvent = (id) => api.post(`/events/${id}/activate`);
export const updateEventLayout = (id, layoutKey, config) => api.put(`/events/${id}/layouts/${layoutKey}`, { config });
export const cloneEventSettings = (sourceEventId, targetEventId) => api.post('/events/clone-settings', { sourceEventId, targetEventId });
export const listPackages = (params) => api.get('/packages', { params });
export const createPackage = (data) => api.post('/packages', data);
export const updatePackage = (id, data) => api.put(`/packages/${id}`, data);
export const deletePackage = (id) => api.delete(`/packages/${id}`);

export const generateKioskToken = (pointId) => api.post('/public/kiosk-token', { pointId });
export const getPublicReportData = (params) => api.get('/public/report', { params });
export const getPublicDashboardStats = (params) => api.get('/public/dashboard', { params });

export const listPrizes = (params) => api.get('/prizes', { params });
export const createPrize = (data) => api.post('/prizes', data);
export const deletePrize = (id) => api.delete(`/prizes/${id}`);
export const drawPrize = (prizeId) => api.post(`/prizes/draw/${prizeId}`);
export const cancelPrizeWinner = (prizeId, winnerId) => api.post('/prizes/cancel', { prizeId, winnerId });

// 🌟 [เพิ่ม] API สำหรับสร้างลิงก์ QR ให้คนทั่วไปแสกน (Self-Register)
export const generateSelfRegisterLink = (data) => api.post('/public/self-register-link', data);
export const requestShortSession = (masterToken) => api.post('/public/request-short-session', { masterToken });

export const getPublicPrizes = (params) => api.get('/public/prizes', { params });
export const restorePrizeRight = (id) => api.put(`/participants/restore-prize/${id}`);


export default api;
