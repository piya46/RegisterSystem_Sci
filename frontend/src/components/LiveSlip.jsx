import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Typography, Paper, Fade, Stack, Avatar, LinearProgress, Chip, Divider } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

function parseTime(value, fallback) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function themeHue(themeCode = '') {
  const sum = String(themeCode).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return sum % 360;
}

export default function LiveSlip({
  amount,
  vendorName,
  transactionId,
  paymentMethod = 'coins',
  menuItemName = '',
  remainingBalance,
  serverTime,
  slipExpiresAt,
  slipNonce = '',
  verificationCode = '',
  dailyThemeCode = '',
  eventYear = '',
}) {
  const mountedAtRef = useRef(Date.now());
  const serverStartRef = useRef(parseTime(serverTime, Date.now()));
  const expiresAtMs = useMemo(
    () => parseTime(slipExpiresAt, serverStartRef.current + 180000),
    [slipExpiresAt]
  );
  const totalTtlMs = Math.max(1000, expiresAtMs - serverStartRef.current);
  const [nowMs, setNowMs] = useState(serverStartRef.current);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(serverStartRef.current + (Date.now() - mountedAtRef.current));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentTime = new Date(nowMs);
  const remainingMs = Math.max(0, expiresAtMs - nowMs);
  const isExpired = remainingMs <= 0;
  const progress = Math.max(0, Math.min(100, (remainingMs / totalTtlMs) * 100));
  const hue = themeHue(dailyThemeCode);
  const transactionShort = String(transactionId || '').slice(-8).toUpperCase();
  const nonceShort = slipNonce ? String(slipNonce).slice(-6).toUpperCase() : '-';

  return (
    <Fade in={true} timeout={800}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 2,
          background: isExpired
            ? 'linear-gradient(135deg, #fafafa 0%, #eceff1 100%)'
            : 'linear-gradient(135deg, #ffffff 0%, #f3fff7 100%)',
          border: `2px solid ${isExpired ? '#b0bec5' : '#2e7d32'}`,
          position: 'relative',
          overflow: 'hidden',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        }}
      >
        {!isExpired && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: `conic-gradient(from 0deg, hsla(${hue}, 80%, 50%, 0.2), rgba(76,175,80,0.08), hsla(${(hue + 80) % 360}, 80%, 55%, 0.24), rgba(76,175,80,0.08), hsla(${hue}, 80%, 50%, 0.2))`,
              animation: 'slipSpin 7s linear infinite',
              pointerEvents: 'none',
              '@keyframes slipSpin': {
                '0%': { transform: 'scale(1.4) rotate(0deg)' },
                '100%': { transform: 'scale(1.4) rotate(360deg)' },
              },
            }}
          />
        )}
        <Box
          sx={{
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            background: 'linear-gradient(45deg, transparent 40%, rgba(255,193,7,0.1) 45%, rgba(255,193,7,0.2) 50%, rgba(255,193,7,0.1) 55%, transparent 60%)',
            animation: 'shimmer 3s infinite linear',
            pointerEvents: 'none',
            zIndex: 0,
            '@keyframes shimmer': {
              '0%': { transform: 'translateX(-30%) translateY(-30%) rotate(45deg)' },
              '100%': { transform: 'translateX(30%) translateY(30%) rotate(45deg)' }
            }
          }}
        />

        <Stack spacing={2} alignItems="center" sx={{ position: 'relative', zIndex: 1, bgcolor: 'rgba(255,255,255,0.88)', borderRadius: 2, p: { xs: 2, sm: 2.5 } }}>
          <Avatar sx={{ bgcolor: isExpired ? '#78909c' : '#4caf50', width: 64, height: 64 }}>
            {isExpired ? <ErrorOutlineIcon fontSize="large" /> : <CheckCircleOutlineIcon fontSize="large" />}
          </Avatar>

          <Typography variant="h5" fontWeight={900} color={isExpired ? 'text.secondary' : 'success.main'}>
            {isExpired ? 'สลิปหมดอายุ' : 'ชำระเงินสำเร็จ'}
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
            <Chip icon={<VerifiedUserIcon />} label={`Code ${verificationCode || '-'}`} color={isExpired ? 'default' : 'success'} />
            <Chip label={dailyThemeCode || 'Live'} variant="outlined" />
            {eventYear && <Chip label={`Event ${eventYear}`} variant="outlined" />}
          </Stack>

          <Box sx={{ my: 2 }}>
            <Typography variant="body2" color="text.secondary">
              ยอดชำระ ({paymentMethod === 'coins' ? 'Coins' : 'Coupon'})
            </Typography>
            <Typography variant="h3" fontWeight={950} color={isExpired ? '#607d8b' : '#263238'}>
              {amount}
            </Typography>
          </Box>

          <Box sx={{ width: '100%', bgcolor: 'rgba(0,0,0,0.04)', p: 2, borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">ร้านค้า</Typography>
            <Typography variant="subtitle1" fontWeight={700}>{vendorName}</Typography>
            {menuItemName && (
              <>
                <Typography variant="body2" color="text.secondary" mt={1}>รายการ</Typography>
                <Typography variant="subtitle2" fontWeight={700}>{menuItemName}</Typography>
              </>
            )}

            <Typography variant="body2" color="text.secondary" mt={1}>เลขอ้างอิง</Typography>
            <Typography variant="subtitle2" fontFamily="monospace" fontWeight={800}>{transactionShort}</Typography>
            <Typography variant="caption" sx={{ wordBreak: 'break-all', display: 'block' }}>{transactionId}</Typography>
            <Divider sx={{ my: 1.5 }} />
            <Stack direction="row" justifyContent="space-between" spacing={2}>
              <Box textAlign="left">
                <Typography variant="caption" color="text.secondary">Nonce</Typography>
                <Typography variant="body2" fontFamily="monospace" fontWeight={800}>{nonceShort}</Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" color="text.secondary">คงเหลือ</Typography>
                <Typography variant="body2" fontWeight={800}>
                  {remainingBalance ?? '-'}
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Box sx={{ width: '100%' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.75}>
              <Typography variant="caption" color="text.secondary">
                {isExpired ? 'Expired' : 'Live countdown'}
              </Typography>
              <Typography variant="caption" fontWeight={800} color={isExpired ? 'error.main' : 'success.main'}>
                {Math.ceil(remainingMs / 1000)}s
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={progress}
              color={isExpired ? 'inherit' : 'success'}
              sx={{ height: 8, borderRadius: 1 }}
            />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Typography variant="body2" fontWeight={700}>
              {currentTime.toLocaleDateString('th-TH')}
            </Typography>
            <Typography
              variant="body1"
              fontWeight={900}
              sx={{ color: '#d32f2f', fontFamily: 'monospace' }}
            >
              {currentTime.toLocaleTimeString('th-TH')}
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Fade>
  );
}
