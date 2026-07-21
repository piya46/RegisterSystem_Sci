import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Container, Typography, Card, CardContent, Button, CircularProgress, Alert } from '@mui/material';
import axios from 'axios';
import QRCode from 'qrcode';
import { PDFDownloadLink } from '@react-pdf/renderer';
import CertificateTemplate from '../components/CertificateTemplate';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { API_BASE_URL } from '../utils/api';

export default function CertificateDownloadPage() {
  const { verificationId: pathVerificationId } = useParams();
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
      || sessionStorage.getItem('certificate_download_verification_id')
      || '';
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrDataUri, setQrDataUri] = useState('');

  useEffect(() => {
    const fetchCertData = async () => {
      try {
        sessionStorage.setItem('certificate_download_verification_id', verificationId);
        if (pathVerificationId || window.location.hash) {
          window.history.replaceState(null, document.title, '/certificate/download');
        }

        const res = await axios.post(`${API_BASE_URL}/public/certificates/payload`, { verificationId });
        if (res.data.success) {
          setData(res.data.data);

          const verifyUrl = `${window.location.origin}/verify#${encodeURIComponent(res.data.data.verificationId || verificationId)}`;
          const url = await QRCode.toDataURL(verifyUrl, { width: 300, margin: 1 });
          setQrDataUri(url);
        } else {
          setError('ไม่พบข้อมูลเอกสาร หรือเอกสารไม่ถูกต้อง');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลเอกสาร');
      } finally {
        setLoading(false);
      }
    };
    if (verificationId) fetchCertData();
    else {
      setError('ไม่พบรหัสตรวจสอบเกียรติบัตร กรุณาเปิดลิงก์จากกระเป๋าของคุณอีกครั้ง');
      setLoading(false);
    }
  }, [pathVerificationId, verificationId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: '#f4f6f8' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ mt: 10 }}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
      </Container>
    );
  }

  if (!data || !qrDataUri) return null;

  return (
    <Container maxWidth="sm" sx={{ py: 5 }}>
      <Card sx={{ borderRadius: 1, bgcolor: '#fff3e0', border: '1px solid #ffe0b2', boxShadow: 3 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 4 }}>
          <WorkspacePremiumIcon sx={{ fontSize: 64, color: '#ff9800', mb: 2 }} />
          <Typography variant="h5" fontWeight={800} color="#e65100" gutterBottom>
            E-Certificate Ready
          </Typography>
          <Typography variant="body1" color="text.secondary" textAlign="center" mb={4}>
            คุณสามารถกดปุ่มด้านล่างเพื่อดาวน์โหลดไฟล์ PDF เกียรติบัตรของคุณสำหรับงาน {data.eventName}
          </Typography>

          <PDFDownloadLink
            document={
              <CertificateTemplate
                participantName={data.name}
                eventName={data.eventName}
                eventDate={new Date(data.checkInTime || Date.now()).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                qrCodeDataUri={qrDataUri}
                verificationId={data.ticketCode}
                backgroundImageUrl={data.backgroundImageUrl}
              />
            }
            fileName={`Certificate_${String(data.name || 'participant').replace(/[\\/:*?"<>|]+/g, '_')}.pdf`}
            style={{ textDecoration: 'none', width: '100%' }}
          >
            {({ loading: pdfLoading }) => (
              <Button
                fullWidth
                variant="contained"
                color="warning"
                size="large"
                sx={{ borderRadius: 1, fontWeight: 700, py: 1.5 }}
                disabled={pdfLoading}
              >
                {pdfLoading ? 'กำลังสร้างเอกสาร...' : 'ดาวน์โหลดไฟล์ PDF เดี๋ยวนี้'}
              </Button>
            )}
          </PDFDownloadLink>
        </CardContent>
      </Card>
    </Container>
  );
}
