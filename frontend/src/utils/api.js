// src/utils/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL , // ระวังสะกด URL ให้ถูกใน .env
  timeout: 10000,
});

// ==== Auth ====
export const login = (data) =>
  api.post('/auth/login', data);

export const getMe = (token) =>
  api.get('/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  });

export const logout = (token) =>
  api.post('/sessions/logout', {}, {
    headers: { Authorization: `Bearer ${token}` }
  });

// ==== Admin ====
export const listAdmins = (token) =>
  api.get('/admins', { headers: { Authorization: `Bearer ${token}` } });

export const createAdmin = (data, token) =>
  api.post('/admins', data, { headers: { Authorization: `Bearer ${token}` } });

export const updateAdmin = (id, data, token) =>
  api.put(`/admins/${id}`, data, { headers: { Authorization: `Bearer ${token}` } });

export const deleteAdmin = (id, token) =>
  api.delete(`/admins/${id}`, { headers: { Authorization: `Bearer ${token}` } });

// เดิมส่ง { userId, password } ต้องเปลี่ยนเป็น { userId, newPassword }
export const resetPassword = (data, token) =>
  api.post('/admins/reset-password', data, { headers: { Authorization: `Bearer ${token}` } });


export const changePassword = (data, token) =>
  api.post('/admins/change-password', data, { headers: { Authorization: `Bearer ${token}` } });

// ==== Session ====
export const listSessions = (token) =>
  api.get('/sessions', { headers: { Authorization: `Bearer ${token}` } });

export const deleteSessionByToken = (tokenId, token) =>
  api.delete(`/sessions/token/${tokenId}`, { headers: { Authorization: `Bearer ${token}` } });

export const deleteSessionByUserId = (userId, token) =>
  api.delete(`/sessions/user/${userId}`, { headers: { Authorization: `Bearer ${token}` } });

export const revokeSession = (id, token) =>
  api.post(`/sessions/revoke/${id}`, {}, { headers: { Authorization: `Bearer ${token}` } });

export const revokeAllSessionByUser = (userId, token) =>
  api.post(`/sessions/revoke-all/${userId}`, {}, { headers: { Authorization: `Bearer ${token}` } });

// ==== Participant (ผู้เข้าร่วม) ====
export const createParticipant = (data) =>
  api.post('/participants/public', data);

export const createParticipantByStaff = (data, token) =>
  api.post('/participants/register-onsite', data, { headers: { Authorization: `Bearer ${token}` } });

export const listParticipants = (token) =>
  api.get('/participants', { headers: { Authorization: `Bearer ${token}` } });

export const updateParticipant = (id, data, token) =>
  api.put(`/participants/${id}`, data, { headers: { Authorization: `Bearer ${token}` } });

export const deleteParticipant = (id, token) =>
  api.delete(`/participants/${id}`, { headers: { Authorization: `Bearer ${token}` } });

export const checkinByQr = (data, token) =>
  api.post('/participants/checkin-by-qr', data, { headers: { Authorization: `Bearer ${token}` } });

export const resendTicket = (data) =>
  api.post('/participants/resend-ticket', data);

export const searchParticipants = (params, token) =>
  api.get('/participants/search', { params, headers: { Authorization: `Bearer ${token}` } });

export const registerOnsiteByKiosk = (data, token) =>
  api.post('/participants/register-onsite', data, { headers: { Authorization: `Bearer ${token}` } });

// ==== Registration Point (จุดลงทะเบียน) ====
export const listRegistrationPoints = (token) =>
  api.get('/registration-points', { headers: { Authorization: `Bearer ${token}` } });

export const createRegistrationPoint = (data, token) =>
  api.post('/registration-points', data, { headers: { Authorization: `Bearer ${token}` } });

export const updateRegistrationPoint = (id, data, token) =>
  api.put(`/registration-points/${id}`, data, { headers: { Authorization: `Bearer ${token}` } });

export const deleteRegistrationPoint = (id, token) =>
  api.delete(`/registration-points/${id}`, { headers: { Authorization: `Bearer ${token}` } });

// ==== ParticipantField (ฟิลด์ข้อมูลผู้เข้าร่วม ปรับแต่งโดย Admin) ====
export const listParticipantFields = () =>
  api.get('/participant-fields');

export const createParticipantField = (data, token) =>
  api.post('/participant-fields', data, { headers: { Authorization: `Bearer ${token}` } });

export const updateParticipantField = (id, data, token) =>
  api.put(`/participant-fields/${id}`, data, { headers: { Authorization: `Bearer ${token}` } });

export const deleteParticipantField = (id, token) =>
  api.delete(`/participant-fields/${id}`, { headers: { Authorization: `Bearer ${token}` } });

// ==== Dashboard / รายงาน (สำหรับ admin เท่านั้น) ====
export const getDashboardStats = (token) =>
  api.get('/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } });

export const getCheckinSummary = (params, token) =>
  api.get('/dashboard/checkin-summary', { params, headers: { Authorization: `Bearer ${token}` } });

export const uploadAvatar = (file, token) => {
  const formData = new FormData();
  formData.append("avatar", file);
  return api.post("/admins/upload-avatar", formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data"
    }
  });
};

// -- Export instance for custom use (optional) --
export default api;
