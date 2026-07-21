import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, CircularProgress, Alert } from '@mui/material';
import { requestResendTicket } from '../../utils/api';
import { getTurnstileToken } from '../../utils/turnstile';

export default function ResendTicketDialog({ open, onClose, eventSlug, eventYear }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleRequest = async () => {
    if (!phone) {
      setError('กรุณากรอกเบอร์โทรศัพท์');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const cfToken = await getTurnstileToken('resend_ticket');
      const res = await requestResendTicket({ phone, eventSlug, eventYear, cfToken });
      if (res.success) {
        setSuccess(true);
      } else {
        setError(res.message || 'เกิดข้อผิดพลาดในการขอส่ง E-Ticket');
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'ไม่สามารถส่งคำขอได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setPhone('');
      setError('');
      setSuccess(false);
    }, 300);
  };

  return (
    <Dialog open={open} onClose={!loading ? handleClose : undefined} maxWidth="xs" fullWidth>
      <DialogTitle>ขอรับ E-Ticket อีกครั้ง</DialogTitle>
      <DialogContent>
        {success ? (
          <Alert severity="success" sx={{ mt: 1 }}>
            หากระบบพบข้อมูลลงทะเบียนด้วยเบอร์โทรนี้ ระบบจะทำการส่ง E-Ticket กลับไปยังอีเมลที่ท่านเคยระบุไว้
          </Alert>
        ) : (
          <>
            <Typography variant="body2" sx={{ mb: 2, mt: 1 }}>
              กรุณาระบุเบอร์โทรศัพท์ที่ท่านใช้ลงทะเบียน หากข้อมูลถูกต้อง ระบบจะส่งลิงก์ E-Ticket ไปยังอีเมลของท่าน
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField
              fullWidth
              label="เบอร์โทรศัพท์ (Phone)"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
              placeholder="08xxxxxxxx"
              inputProps={{ maxLength: 10 }}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          {success ? 'ปิด' : 'ยกเลิก'}
        </Button>
        {!success && (
          <Button onClick={handleRequest} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : 'ขอรับ E-Ticket'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
