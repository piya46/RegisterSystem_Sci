import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Container, Typography, Card, CardContent, CircularProgress, Alert, Button, Avatar } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import axios from 'axios';
import { API_BASE_URL } from '../utils/api';

export default function VerifyPage() {
  const { id: pathVerificationId } = useParams();
  const navigate = useNavigate();
  const [verificationId] = useState(() => {
    const fragment = window.location.hash ? window.location.hash.slice(1) : '';
    let decodedFragment = '';
    try {
      decodedFragment = decodeURIComponent(fragment);
    } catch {
      decodedFragment = '';
    }
    return pathVerificationId
      || decodedFragment
      || sessionStorage.getItem('certificate_verify_id')
      || '';
  });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('invalid');

  useEffect(() => {
    const fetchVerification = async () => {
      try {
        sessionStorage.setItem('certificate_verify_id', verificationId);
        if (pathVerificationId || window.location.hash) {
          window.history.replaceState(null, document.title, '/verify');
        }
        const res = await axios.post(`${API_BASE_URL}/public/certificates/verify`, { verificationId });
        setData(res.data.data);
        setVerificationStatus('valid');
      } catch (err) {
        setVerificationStatus(err.response?.data?.code === 'CERTIFICATE_REVOKED' ? 'revoked' : 'invalid');
        setError(err.response?.data?.message || 'ไม่สามารถตรวจสอบเอกสารนี้ได้ หรือ QR Code ไม่ถูกต้อง');
      } finally {
        setLoading(false);
      }
    };

    if (verificationId) {
      fetchVerification();
    } else {
      setError('ไม่พบรหัสตรวจสอบเอกสาร');
      setLoading(false);
    }
  }, [pathVerificationId, verificationId]);

  const isRevoked = verificationStatus === 'revoked';
  const isInvalid = Boolean(error);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', display: 'flex', alignItems: 'center', py: 4 }}>
      <Container maxWidth="sm">
        <Card sx={{ borderRadius: 1, boxShadow: '0 12px 40px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <Box sx={{ bgcolor: isInvalid ? '#ffebee' : '#e8f5e9', p: 4, textAlign: 'center' }}>
            {loading ? (
              <CircularProgress />
            ) : isInvalid ? (
              <Avatar sx={{ bgcolor: '#d32f2f', width: 80, height: 80, mx: 'auto', mb: 2 }}>
                <CancelIcon sx={{ fontSize: 50 }} />
              </Avatar>
            ) : (
              <Avatar sx={{ bgcolor: '#2e7d32', width: 80, height: 80, mx: 'auto', mb: 2 }}>
                <CheckCircleIcon sx={{ fontSize: 50 }} />
              </Avatar>
            )}

            <Typography variant="h4" fontWeight={900} color={isInvalid ? '#c62828' : '#1b5e20'} gutterBottom>
              {loading ? 'กำลังตรวจสอบ...' : isRevoked ? 'เอกสารถูกเพิกถอน' : isInvalid ? 'ไม่พบข้อมูลยืนยัน' : 'เอกสารของแท้'}
            </Typography>

            {!loading && !isInvalid && (
              <Typography variant="body1" color="text.secondary">
                เกียรติบัตรนี้ออกโดยระบบอย่างถูกต้องและได้รับการยืนยัน
              </Typography>
            )}
          </Box>

          <CardContent sx={{ p: 4 }}>
            {isInvalid ? (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            ) : data && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>ผู้เข้าร่วมงาน</Typography>
                <Typography variant="h6" fontWeight={700} mb={2}>{data.name}</Typography>

                <Typography variant="subtitle2" color="text.secondary" gutterBottom>กิจกรรม</Typography>
                <Typography variant="body1" mb={2}>{data.eventName} {data.eventYear}</Typography>

                <Typography variant="subtitle2" color="text.secondary" gutterBottom>รหัสอ้างอิง (Ticket Code)</Typography>
                <Typography variant="body1" mb={2} sx={{ fontFamily: 'monospace', bgcolor: '#f1f1f1', p: 1, borderRadius: 1, display: 'inline-block' }}>
                  {data.ticketCode}
                </Typography>

                <Typography variant="subtitle2" color="text.secondary" gutterBottom>เวลาที่เช็คอินเข้างาน</Typography>
                <Typography variant="body2" mb={4}>
                  {data.checkInTime ? new Date(data.checkInTime).toLocaleString('th-TH') : '-'}
                </Typography>
              </Box>
            )}

            <Button fullWidth variant="contained" color="primary" onClick={() => navigate('/')} sx={{ borderRadius: 1 }}>
              กลับสู่หน้าหลัก
            </Button>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
