import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api', 
  timeout: 30000, 
  withCredentials: true // ✅ บอกให้ Axios ส่ง HttpOnly Cookie ไปด้วยเสมอ
});

// ✅ ลบ Interceptor อันเก่าที่ทำหน้าที่ดึง token จาก localStorage แล้วเอามาต่อ Header ทิ้งไปได้เลย 
// เพราะ Browser จัดการเรื่องแนบ Cookie ให้เราแล้ว

// ==========================================
// 🔐 Auth & Self-Service
// ==========================================
export const login = (data) => api.post('/auth/login', data);
export const googleLogin = (token) => api.post('/auth/google-login', { token });
export const getMe = () => api.get('/auth/me');
export const logout = () => api.post('/sessions/logout');
export const verifyUser = (data) => api.post('/auth/verify', data);
export const requestPasswordReset = (username) => api.post('/auth/forgot-password', { username });
export const resetPasswordWithOtp = (username, otp, newPassword) => api.post('/auth/reset-password-otp', { username, otp, newPassword });

// ==========================================
// 🛡️ Admin Management
// ==========================================
export const listAdmins = () => api.get('/admins'); 
export const createAdmin = (data) => api.post('/admins', data);
export const updateAdmin = (id, data) => api.put(`/admins/${id}`, data);
export const deleteAdmin = (id) => api.delete(`/admins/${id}`);
export const requestActionOtp = () => api.post('/admins/request-action-otp');
export const resetUserPassword = (userId, newPassword, otp = null) => api.post('/admins/reset-password', { userId, newPassword, otp });
export const updateStaff = (id, data) => api.put(`/admins/staff/${id}`, data);
export const changePassword = (data) => api.post('/admins/change-password', data);
export const uploadAvatar = (file) => {
  const formData = new FormData();
  formData.append("avatar", file);
  return api.post("/admins/upload-avatar", formData, { headers: { "Content-Type": "multipart/form-data" } });
};
export const getCronLogs = () => api.get('/admins/cron-logs');

// ==========================================
// 👤 Session Management
// ==========================================
export const listSessions = () => api.get('/sessions');
export const deleteSessionByToken = (tokenId) => api.delete(`/sessions/token/${tokenId}`);
export const deleteSessionByUserId = (userId) => api.delete(`/sessions/user/${userId}`);
export const revokeSession = (id) => api.post(`/sessions/revoke/${id}`);
export const revokeAllSessionByUser = (userId) => api.post(`/sessions/revoke-all/${userId}`);

// ==========================================
// 🎓 Participant
// ==========================================
export const createParticipant = (data) => api.post('/participants/public', data);
export const createParticipantByStaff = (data) => api.post('/participants/register-onsite', data);
export const listParticipants = () => api.get('/participants');
export const updateParticipant = (id, data) => api.put(`/participants/${id}`, data);
export const deleteParticipant = (id) => api.delete(`/participants/${id}`);
export const checkinByQr = (data) => api.post('/participants/checkin-by-qr', data);
export const resendTicket = (data) => api.post('/participants/resend-ticket', data);
export const searchParticipants = (params) => api.get('/participants/search', { params });
export const registerOnsiteByKiosk = (data) => api.post('/participants/register-onsite', data);
export const downloadPdfReport = () => api.get('/participants/download-report-pdf', { responseType: 'blob' });

// ==========================================
// 📍 Registration Point
// ==========================================
export const listRegistrationPoints = () => api.get('/registration-points');
export const createRegistrationPoint = (data) => api.post('/registration-points', data);
export const updateRegistrationPoint = (id, data) => api.put(`/registration-points/${id}`, data);
export const deleteRegistrationPoint = (id) => api.delete(`/registration-points/${id}`);

// ==========================================
// 📝 Participant Fields
// ==========================================
export const listParticipantFields = () => api.get('/participant-fields');
export const createParticipantField = (data) => api.post('/participant-fields', data);
export const updateParticipantField = (id, data) => api.put(`/participant-fields/${id}`, data);
export const deleteParticipantField = (id) => api.delete(`/participant-fields/${id}`);

// ==========================================
// 📊 Dashboard & Donation
// ==========================================
export const getDashboardStats = () => api.get('/dashboard/stats');
export const getCheckinSummary = (params) => api.get('/dashboard/checkin-summary', { params });
export const getDashboardSummary = () => api.get('/dashboard/summary');
export const createDonation = (data) => api.post('/donations', data);
export const getDonationSummary = () => api.get('/donations/summary');
export const updateDonation = (id, data) => api.put(`/donations/${id}`, data);
export const deleteDonation = (id) => api.delete(`/donations/${id}`);

// ==========================================
// ⚙️ System Settings & Packages
// ==========================================
export const getSystemSettings = () => api.get('/settings');
export const updateSystemSettings = (data) => api.put('/settings', data);
export const listPackages = () => api.get('/packages');
export const createPackage = (data) => api.post('/packages', data);
export const updatePackage = (id, data) => api.put(`/packages/${id}`, data);
export const deletePackage = (id) => api.delete(`/packages/${id}`);

export default api;