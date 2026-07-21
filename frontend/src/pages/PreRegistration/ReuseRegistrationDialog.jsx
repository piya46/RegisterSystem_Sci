import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, CircularProgress, Alert } from '@mui/material';
import { requestReuseOtp, verifyReuseOtp } from '../../utils/api';
import { getTurnstileToken } from '../../utils/turnstile';

export default function ReuseRegistrationDialog({ open, onClose, onReuseSuccess, eventSlug }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState(null);

  const handleClose = () => {
    onClose();
    window.setTimeout(() => {
      setStep(1);
      setEmail('');
      setOtp('');
      setError('');
      setChallenge(null);
    }, 300);
  };

  const handleRequestOtp = async () => {
    if (!email) {
      setError('กรุณากรอกอีเมล');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const cfToken = await getTurnstileToken('registration_reuse');
      const res = await requestReuseOtp(eventSlug, email, cfToken);
      if (res.challengeId) {
        setChallenge({ id: res.challengeId, ref: res.ref });
        setStep(2);
      } else {
        setError(res.message || 'เกิดข้อผิดพลาดในการขอ OTP');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!/^\d{8}$/.test(otp)) {
      setError('กรุณากรอกรหัส OTP 8 หลัก');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await verifyReuseOtp(eventSlug, challenge.id, otp);
      if (res.success && res.data) {
        onReuseSuccess(res.data);
        handleClose();
      } else {
        setError(res.message || 'รหัส OTP ไม่ถูกต้อง');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={!loading ? handleClose : undefined} maxWidth="xs" fullWidth>
      <DialogTitle>ดึงข้อมูลลงทะเบียนเดิม</DialogTitle>
      <DialogContent>
        {step === 1 ? (
          <>
            <Typography variant="body2" sx={{ mb: 2, mt: 1 }}>
              กรุณาระบุอีเมลที่ท่านเคยใช้ลงทะเบียนในกิจกรรมก่อนหน้า ระบบจะส่งรหัส OTP ไปยังอีเมลของท่านเพื่อยืนยันตัวตน
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField
              fullWidth
              label="อีเมล (Email)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="example@email.com"
            />
          </>
        ) : (
          <>
            <Typography variant="body2" sx={{ mb: 2, mt: 1 }}>
              ระบบได้ส่งรหัส OTP ไปยังอีเมล <strong>{email}</strong> แล้ว (Ref: {challenge?.ref})
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField
              fullWidth
              label="รหัส OTP 8 หลัก"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
              disabled={loading}
              inputProps={{ inputMode: 'numeric', maxLength: 8, style: { textAlign: 'center', letterSpacing: '0.2em' } }}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>ยกเลิก</Button>
        {step === 1 ? (
          <Button onClick={handleRequestOtp} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : 'รับรหัส OTP'}
          </Button>
        ) : (
          <Button onClick={handleVerifyOtp} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : 'ยืนยัน OTP'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
