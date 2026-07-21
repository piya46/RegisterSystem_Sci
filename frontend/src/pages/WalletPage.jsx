import React, { useState, useEffect } from 'react';
import { Box, Container, Typography, Card, CardContent, Button, Stack, CircularProgress, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert, Avatar, MenuItem } from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import ShareIcon from '@mui/icons-material/Share';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';
import useParticipantAuth from '../hooks/useParticipantAuth';
import LiveSlip from '../components/LiveSlip';
import QrScanner from '../components/QrScanner';
import { QRCodeSVG } from 'qrcode.react';
import QRCode from 'qrcode';
import { PDFDownloadLink } from '@react-pdf/renderer';
import CertificateTemplate from '../components/CertificateTemplate';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import liff from '@line/liff';
import { API_BASE_URL } from '../utils/api';
import { paymentSlipFromResponse } from '../utils/paymentSlip';
// Assuming Html5QrcodeScanner is installed or loaded.
// If not installed, we can simulate it for now.

function createPaymentIdempotencyKey() {
  if (window.crypto?.randomUUID) return `pay:${window.crypto.randomUUID()}`;
  return `pay:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}

export default function WalletPage() {
  const { token, isAuthenticated, loading: authLoading, authError } = useParticipantAuth();
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  // Payment Dialog State
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [targetVendorQrCode, setTargetVendorQrCode] = useState('');
  const [targetVendorQuote, setTargetVendorQuote] = useState(null);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [scanDialogOpen, setScanDialogOpen] = useState(false);

  const [slipData, setSlipData] = useState(null);
  const [qrDataUri, setQrDataUri] = useState('');
  const participantFields = wallet?.participant?.fields || {};
  const participantName = participantFields.name || participantFields.fullName || participantFields.fullname || participantFields.displayName || 'ผู้เข้าร่วมงาน';
  const certificateDate = wallet?.participant?.checkedInAt
    ? new Date(wallet.participant.checkedInAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const certificateFileName = `Certificate_${participantName.replace(/[\\/:*?"<>|]+/g, '_')}.pdf`;
  const isLineClient = typeof liff?.isInClient === 'function' && liff.isInClient();

  useEffect(() => {
    const verificationId = wallet?.participant?.certificateVerificationId;
    if (wallet?.participant?.status === 'checkedIn' && verificationId) {
      const verifyUrl = `${window.location.origin}/verify#${encodeURIComponent(verificationId)}`;
      QRCode.toDataURL(verifyUrl, { width: 300, margin: 1 })
        .then(url => setQrDataUri(url))
        .catch(err => console.error(err));
    } else {
      setQrDataUri('');
    }
  }, [wallet]);
  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      // In real app, redirect to LINE login or participant login
      setError(authError || 'กรุณาเข้าสู่ระบบผ่าน LINE หรือ Email');
      setLoading(false);
      return;
    }

    if (isAuthenticated) {
      fetchWallet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authLoading, authError]);

  const fetchWallet = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE_URL}/wallets/balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWallet(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลกระเป๋าเงินได้');
    } finally {
      setLoading(false);
    }
  };

  const generateGuestToken = async () => {
    try {
      const res = await axios.post(`${API_BASE_URL}/wallets/guest-token`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShareUrl(res.data.data.shareUrl);
      setShareDialogOpen(true);
    } catch (err) {
      alert('ไม่สามารถสร้างลิงก์แบ่งปันได้: ' + (err.response?.data?.message || err.message));
    }
  };

  const copyShareUrl = async () => {
    await navigator.clipboard.writeText(shareUrl);
    alert('คัดลอกลิงก์แล้ว ส่งให้ผู้ติดตามได้เลย!');
  };

  // Simulated Payment function (In real app, triggered by QR scan result)
  const processPayment = async (vendorQrCode) => {
    setTargetVendorQrCode(vendorQrCode);
    setTargetVendorQuote(null);
    setSelectedMenuItemId('');
    setPaymentAmount('');
    try {
      const res = await axios.get(`${API_BASE_URL}/wallets/vendor-quote`, {
        params: { vendorQrCode }
      });
      const quote = res.data.data;
      setTargetVendorQuote(quote);
      if (quote.amount && quote.requiresAmount === false) {
        setPaymentAmount(String(quote.amount));
      }
      setPaymentDialogOpen(true);
    } catch (err) {
      alert('QR ร้านค้าไม่ถูกต้อง: ' + (err.response?.data?.message || err.message));
    }
  };

  const confirmPayment = async () => {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      alert('กรุณาใส่จำนวนเหรียญที่ถูกต้อง');
      return;
    }

    const idempotencyKey = createPaymentIdempotencyKey();
    try {
      setPaymentLoading(true);
      const res = await axios.post(`${API_BASE_URL}/wallets/pay`, {
        vendorQrCode: targetVendorQrCode,
        amount,
        paymentMethod: 'coins',
        menuItemId: selectedMenuItemId || targetVendorQuote?.menuItemId || undefined
      }, {
        headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': idempotencyKey }
      });

      setSlipData(paymentSlipFromResponse(res.data.data));
      setPaymentDialogOpen(false);
      fetchWallet(); // refresh balance
    } catch (err) {
      if (!err.response) {
        try {
          const statusRes = await axios.get(`${API_BASE_URL}/wallets/payment-status/${encodeURIComponent(idempotencyKey)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (statusRes.data?.success && statusRes.data.data?.status === 'success') {
            setSlipData(paymentSlipFromResponse(statusRes.data.data));
            setPaymentDialogOpen(false);
            fetchWallet();
            return;
          }
        } catch {
          // Fall through to the generic error below.
        }
      }
      alert('ชำระเงินไม่สำเร็จ: ' + (err.response?.data?.error || err.response?.data?.message || err.message));
    } finally {
      setPaymentLoading(false);
    }
  };

  if (authLoading || loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
  }

  if (slipData) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <LiveSlip {...slipData} />
        <Button
          fullWidth
          variant="contained"
          size="large"
          sx={{ mt: 4, borderRadius: 8 }}
          onClick={() => setSlipData(null)}
        >
          กลับหน้าหลัก
        </Button>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="sm">
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        ) : (
          <Stack spacing={3}>
            {/* Balance Card */}
            <Card sx={{
              borderRadius: 4,
              background: 'linear-gradient(135deg, #1a237e 0%, #3949ab 100%)',
              color: '#fff',
              boxShadow: '0 8px 32px rgba(26, 35, 126, 0.2)'
            }}>
              <CardContent sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h6" sx={{ opacity: 0.9, mb: 1 }}>ยอดคงเหลือ</Typography>
                <Typography variant="h2" fontWeight={900}>
                  {wallet?.coinBalance || 0}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.7 }}>Coins</Typography>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <Stack direction="row" spacing={2}>
              <Button
                fullWidth
                variant="contained"
                color="primary"
                size="large"
                startIcon={<QrCodeScannerIcon />}
                sx={{ borderRadius: 8, py: 1.5, fontWeight: 700 }}
                onClick={() => setScanDialogOpen(true)}
              >
                สแกนจ่าย
              </Button>
              <Button
                fullWidth
                variant="outlined"
                color="primary"
                size="large"
                startIcon={<ShareIcon />}
                sx={{ borderRadius: 8, py: 1.5, fontWeight: 700, bgcolor: '#fff' }}
                onClick={generateGuestToken}
              >
                แบ่งกระเป๋า
              </Button>
            </Stack>

            {/* E-Certificate Section (Only for Checked-In Participants & if Feature is Enabled) */}
            {wallet?.participant?.status === 'checkedIn' &&
             wallet?.participant?.eventId?.config?.enabledFeatures?.certificate !== false &&
             qrDataUri && (
              <Box sx={{ mt: 3 }}>
                <Card sx={{ borderRadius: 4, bgcolor: '#fff3e0', border: '1px solid #ffe0b2' }}>
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3 }}>
                    <Avatar sx={{ bgcolor: '#ff9800', mb: 2, width: 56, height: 56 }}>
                      <WorkspacePremiumIcon fontSize="large" />
                    </Avatar>
                    <Typography variant="h6" fontWeight={800} color="#e65100" gutterBottom>
                      ยินดีด้วย! คุณเข้าร่วมงานสำเร็จ
                    </Typography>
                    <Typography variant="body2" color="text.secondary" textAlign="center" mb={2}>
                      คุณสามารถดาวน์โหลดเกียรติบัตรอิเล็กทรอนิกส์ (E-Certificate) สำหรับงานนี้ได้แล้ว
                    </Typography>
                    {isLineClient ? (
                      <Button
                        fullWidth
                        variant="contained"
                        color="warning"
                        size="large"
                        sx={{ borderRadius: 8, fontWeight: 700 }}
                        onClick={() => {
                          liff.openWindow({
                            url: `${window.location.origin}/certificate/download#${encodeURIComponent(wallet.participant.certificateVerificationId)}`,
                            external: true
                          });
                        }}
                      >
                        ดาวน์โหลด E-Certificate
                      </Button>
                    ) : (
                      <PDFDownloadLink
                        document={
                          <CertificateTemplate
                            participantName={participantName}
                            eventName={wallet.participant.eventId?.name || 'กิจกรรม'}
                            eventDate={certificateDate}
                            qrCodeDataUri={qrDataUri}
                            verificationId={wallet.participant.qrCode}
                            backgroundImageUrl={wallet.participant.eventId?.branding?.coverImageUrl}
                          />
                        }
                        fileName={certificateFileName}
                        style={{ textDecoration: 'none', width: '100%' }}
                      >
                        {({ loading: pdfLoading }) => (
                          <Button
                            fullWidth
                            variant="contained"
                            color="warning"
                            size="large"
                            sx={{ borderRadius: 8, fontWeight: 700 }}
                            disabled={pdfLoading}
                          >
                            {pdfLoading ? 'กำลังสร้างเอกสาร...' : 'ดาวน์โหลด E-Certificate'}
                          </Button>
                        )}
                      </PDFDownloadLink>
                    )}
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* Coupons Section */}
            {wallet?.coupons?.length > 0 && (
              <Box>
                <Typography variant="h6" fontWeight={800} mb={2}>คูปองของคุณ</Typography>
                <Stack spacing={2}>
                  {wallet.coupons.map((coupon, idx) => (
                    <Card key={idx} sx={{ borderRadius: 3, borderLeft: '6px solid #ff9800' }}>
                      <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography fontWeight={700}>{coupon.name}</Typography>
                          <Typography variant="body2" color="text.secondary">จำนวน: {coupon.quantity}</Typography>
                        </Box>
                        <Button variant="outlined" color="warning" size="small" sx={{ borderRadius: 4 }}>
                          ใช้คูปอง
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Box>
            )}

          </Stack>
        )}
      </Container>

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography fontWeight={800}>แชร์กระเป๋าให้ผู้ติดตาม</Typography>
          <IconButton onClick={() => setShareDialogOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" mb={3}>
            ให้ผู้ติดตามเปิดกล้องสแกน QR Code นี้เพื่อเชื่อมกระเป๋า
            (ลิงก์มีอายุ 24 ชั่วโมง)
          </Typography>

          {shareUrl && (
            <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 4, display: 'inline-block', border: '2px solid #eee', mb: 3 }}>
              <QRCodeSVG value={shareUrl} size={200} />
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              value={shareUrl}
              InputProps={{ readOnly: true }}
            />
            <Button variant="contained" color="primary" onClick={copyShareUrl} sx={{ minWidth: 48, px: 0 }}>
              <ContentCopyIcon fontSize="small" />
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* QR Scanner Dialog */}
      <Dialog open={scanDialogOpen} onClose={() => setScanDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#000', color: '#fff' }}>
          <Typography fontWeight={800}>สแกน QR ร้านค้า</Typography>
          <IconButton onClick={() => setScanDialogOpen(false)} size="small" sx={{ color: '#fff' }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, bgcolor: '#000' }}>
          {scanDialogOpen && (
            <QrScanner
              onScan={(result) => {
                setScanDialogOpen(false);
                processPayment(result);
              }}
              onError={(error) => console.log(error)}
              style={{ width: '100%', borderRadius: 0, boxShadow: 'none' }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onClose={() => !paymentLoading && setPaymentDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>ชำระเงิน</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {targetVendorQuote?.vendorName ? `ร้านค้า: ${targetVendorQuote.vendorName}` : 'กรุณาระบุจำนวนเหรียญที่ต้องการจ่าย'}
          </Typography>
          {targetVendorQuote?.menuItemName && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {targetVendorQuote.menuItemName} - {targetVendorQuote.amount} Coins
            </Alert>
          )}
          {targetVendorQuote?.requiresMenuSelection && (
            <TextField
              select
              fullWidth
              label="เลือกเมนู"
              value={selectedMenuItemId}
              onChange={(e) => {
                const itemId = e.target.value;
                const item = targetVendorQuote.menuItems.find((option) => option.itemId === itemId);
                setSelectedMenuItemId(itemId);
                setPaymentAmount(item?.price ? String(item.price) : '');
              }}
              disabled={paymentLoading}
              sx={{ mb: 2 }}
            >
              {targetVendorQuote.menuItems.map((item) => (
                <MenuItem key={item.itemId} value={item.itemId}>
                  {item.name} - {item.price} Coins
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            autoFocus
            fullWidth
            type="number"
            label="จำนวนเหรียญ"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            disabled={paymentLoading || targetVendorQuote?.requiresAmount === false}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setPaymentDialogOpen(false)} disabled={paymentLoading}>ยกเลิก</Button>
          <Button onClick={confirmPayment} variant="contained" disabled={paymentLoading || !paymentAmount}>
            {paymentLoading ? <CircularProgress size={24} color="inherit" /> : 'ยืนยันจ่ายเงิน'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
