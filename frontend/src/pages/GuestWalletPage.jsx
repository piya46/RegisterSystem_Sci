import React, { useState, useEffect, useCallback } from 'react';
import { Box, Container, Typography, Card, CardContent, Button, Stack, CircularProgress, IconButton, Dialog, DialogTitle, DialogContent, Alert, TextField, DialogActions, MenuItem } from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import LiveSlip from '../components/LiveSlip';
import QrScanner from '../components/QrScanner';
import CloseIcon from '@mui/icons-material/Close';
import { API_BASE_URL } from '../utils/api';
import { paymentSlipFromResponse } from '../utils/paymentSlip';

function createPaymentIdempotencyKey() {
  if (window.crypto?.randomUUID) return `pay:${window.crypto.randomUUID()}`;
  return `pay:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}

export default function GuestWalletPage() {
  const { token: tokenParam } = useParams(); // Guest Token from legacy/deep link URL
  const navigate = useNavigate();
  const [guestToken, setGuestToken] = useState(() => tokenParam || sessionStorage.getItem('guest_wallet_token') || '');
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scanDialogOpen, setScanDialogOpen] = useState(false);

  const [slipData, setSlipData] = useState(null);

  // Payment Dialog State
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [targetVendorQrCode, setTargetVendorQrCode] = useState('');
  const [targetVendorQuote, setTargetVendorQuote] = useState(null);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

  const fetchWallet = useCallback(async (activeToken = guestToken) => {
    if (!activeToken) {
      setError('ไม่พบลิงก์กระเป๋าผู้ติดตาม กรุณาเปิดจากลิงก์ที่ได้รับอีกครั้ง');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE_URL}/wallets/balance`, {
        headers: { 'x-guest-token': activeToken }
      });
      setWallet(res.data.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลกระเป๋าเงินได้ (ลิงก์อาจหมดอายุ)');
    } finally {
      setLoading(false);
    }
  }, [guestToken]);

  useEffect(() => {
    if (!tokenParam) return;
    sessionStorage.setItem('guest_wallet_token', tokenParam);
    setGuestToken(tokenParam);
    navigate('/guest-wallet', { replace: true });
  }, [navigate, tokenParam]);

  useEffect(() => {
    if (tokenParam) return;
    fetchWallet(guestToken);
  }, [fetchWallet, guestToken, tokenParam]);

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
        headers: { 'x-guest-token': guestToken, 'Idempotency-Key': idempotencyKey }
      });

      setSlipData(paymentSlipFromResponse(res.data.data));
      setPaymentDialogOpen(false);
      fetchWallet(guestToken); // refresh balance
    } catch (err) {
      if (!err.response) {
        try {
          const statusRes = await axios.get(`${API_BASE_URL}/wallets/payment-status/${encodeURIComponent(idempotencyKey)}`, {
            headers: { 'x-guest-token': guestToken }
          });
          if (statusRes.data?.success && statusRes.data.data?.status === 'success') {
            setSlipData(paymentSlipFromResponse(statusRes.data.data));
            setPaymentDialogOpen(false);
            fetchWallet(guestToken);
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

  if (loading) {
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
          กลับไปหน้าชำระเงิน (Guest)
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
            {/* Balance Card (Guest Mode) */}
            <Card sx={{
              borderRadius: 4,
              background: 'linear-gradient(135deg, #009688 0%, #00695c 100%)', // Distinct color for guest
              color: '#fff',
              boxShadow: '0 8px 32px rgba(0, 150, 136, 0.2)'
            }}>
              <CardContent sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ display: 'block', bgcolor: 'rgba(255,255,255,0.2)', py: 0.5, px: 2, borderRadius: 4, width: 'fit-content', mx: 'auto', mb: 2 }}>
                  Guest Wallet Mode
                </Typography>
                <Typography variant="h6" sx={{ opacity: 0.9, mb: 1 }}>ยอดเหรียญคงเหลือที่ใช้ได้</Typography>
                <Typography variant="h2" fontWeight={900}>
                  {wallet?.coinBalance || 0}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.7 }}>Coins</Typography>
              </CardContent>
            </Card>

            <Alert severity="info" sx={{ borderRadius: 2 }}>
              กระเป๋านี้เป็นกระเป๋าชั่วคราวที่คุณได้รับสิทธิ์ให้ใช้งานร่วมกัน คุณสามารถนำเหรียญเหล่านี้ไปสแกนจ่ายค่าอาหารได้
            </Alert>

            {/* Action Buttons */}
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
          </Stack>
        )}
      </Container>

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
