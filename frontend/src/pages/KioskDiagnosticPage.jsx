import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Container, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import StorageIcon from '@mui/icons-material/Storage';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useNavigate } from 'react-router-dom';
import { verifyKioskToken } from '../utils/api';

const CHECKS = [
  { key: 'network', label: 'Network / Backend', icon: <WifiIcon /> },
  { key: 'token', label: 'Kiosk Token / Point', icon: <VpnKeyIcon /> },
  { key: 'camera', label: 'Camera Permission', icon: <PhotoCameraIcon /> },
  { key: 'storage', label: 'Browser Storage', icon: <StorageIcon /> },
  { key: 'time', label: 'Device Time', icon: <ScheduleIcon /> },
  { key: 'fullscreen', label: 'Fullscreen Ready', icon: <FullscreenIcon /> },
];

function initialChecks() {
  return Object.fromEntries(CHECKS.map((check) => [check.key, { status: 'pending', message: '' }]));
}

function setCheckValue(setChecks, key, status, message = '') {
  setChecks((prev) => ({ ...prev, [key]: { status, message } }));
}

function CheckRow({ check, state }) {
  const color = state.status === 'success' ? 'success' : state.status === 'error' ? 'error' : state.status === 'warning' ? 'warning' : 'default';
  const iconColor = color === 'default' ? 'text.disabled' : `${color}.main`;
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Box sx={{ color: iconColor, display: 'flex' }}>{check.icon}</Box>
        <Box sx={{ flex: 1 }}>
          <Typography fontWeight={800}>{check.label}</Typography>
          {state.message && <Typography variant="body2" color="text.secondary">{state.message}</Typography>}
        </Box>
        <Chip
          size="small"
          color={color === 'default' ? undefined : color}
          icon={state.status === 'success' ? <CheckCircleIcon /> : state.status === 'error' ? <ErrorOutlineIcon /> : undefined}
          label={state.status}
        />
      </Stack>
    </Paper>
  );
}

export default function KioskDiagnosticPage() {
  const navigate = useNavigate();
  const [checks, setChecks] = useState(initialChecks);
  const [running, setRunning] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [fatalError, setFatalError] = useState('');

  const token = useMemo(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashToken = hashParams.get('token');
    if (hashToken) {
      window.history.replaceState(null, '', window.location.pathname);
      sessionStorage.setItem('kioskToken', hashToken);
      localStorage.removeItem('kioskToken');
      return hashToken;
    }
    return sessionStorage.getItem('kioskToken') || '';
  }, []);

  const policy = tokenInfo?.kioskPolicy || {};
  const criticalReady = checks.network.status === 'success'
    && checks.token.status === 'success'
    && checks.storage.status === 'success'
    && (!policy.requireCamera || checks.camera.status === 'success')
    && (!policy.requireFullscreen || checks.fullscreen.status === 'success');

  const runDiagnostics = async () => {
    setRunning(true);
    setFatalError('');
    setChecks(initialChecks());
    setTokenInfo(null);

    let failedCheck = 'network';
    try {
      if (!navigator.onLine) throw new Error('อุปกรณ์ไม่ได้เชื่อมต่ออินเทอร์เน็ต');
      setCheckValue(setChecks, 'network', 'success', 'เชื่อมต่อเครือข่ายแล้ว');

      failedCheck = 'token';
      if (!token) throw new Error('ไม่พบ Kiosk token กรุณาเปิดลิงก์จากหน้าสร้าง token ใหม่');
      const tokenRes = await verifyKioskToken(token);
      setTokenInfo(tokenRes.data.data);
      setCheckValue(setChecks, 'token', 'success', `${tokenRes.data.data.pointName} (${tokenRes.data.data.pointType})`);

      try {
        const stream = await navigator.mediaDevices?.getUserMedia?.({ video: true });
        stream?.getTracks?.().forEach((track) => track.stop());
        setCheckValue(setChecks, 'camera', 'success', 'กล้องพร้อมใช้งาน');
      } catch {
        setCheckValue(setChecks, 'camera', 'warning', 'ยังไม่ได้อนุญาตกล้อง หรืออุปกรณ์ไม่มีกล้อง');
      }

      failedCheck = 'storage';
      try {
        sessionStorage.setItem('kioskDiagnosticTest', '1');
        sessionStorage.removeItem('kioskDiagnosticTest');
        setCheckValue(setChecks, 'storage', 'success', 'sessionStorage พร้อมใช้งาน');
      } catch {
        throw new Error('Browser storage ใช้งานไม่ได้');
      }

      const serverTime = tokenRes.data.data.serverTime ? new Date(tokenRes.data.data.serverTime) : null;
      if (serverTime && Math.abs(Date.now() - serverTime.getTime()) > 5 * 60 * 1000) {
        setCheckValue(setChecks, 'time', 'warning', 'เวลาเครื่องต่างจาก server มากกว่า 5 นาที');
      } else {
        setCheckValue(setChecks, 'time', 'success', 'เวลาเครื่องใกล้เคียง server');
      }

      if (document.fullscreenEnabled) {
        setCheckValue(setChecks, 'fullscreen', 'success', 'อุปกรณ์รองรับ browser fullscreen');
      } else {
        setCheckValue(setChecks, 'fullscreen', 'warning', 'Browser ไม่รองรับ fullscreen; ต้องใช้ OS kiosk lock');
      }
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'ตรวจสอบ Kiosk ไม่สำเร็จ';
      setFatalError(message);
      setCheckValue(setChecks, failedCheck, 'error', message);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startKiosk = async () => {
    try {
      if (document.fullscreenEnabled && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setCheckValue(setChecks, 'fullscreen', 'warning', 'เข้า fullscreen ไม่สำเร็จ กรุณาใช้ OS-level kiosk lock');
    }
    window.location.replace('/kiosk');
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
        <Paper elevation={0} sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 3, border: '1px solid rgba(0,0,0,0.08)' }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h5" fontWeight={900}>Kiosk Diagnostic</Typography>
              <Typography color="text.secondary">ตรวจความพร้อมของเครื่องก่อนเปิดให้ผู้เข้าร่วมใช้งาน</Typography>
            </Box>

            {running && <LinearProgress />}
            {fatalError && <Alert severity="error">{fatalError}</Alert>}
            {tokenInfo?.warnings?.length > 0 && (
              <Alert severity="warning">{tokenInfo.warnings.join(', ')}</Alert>
            )}

            <Stack spacing={1.5}>
              {CHECKS.map((check) => <CheckRow key={check.key} check={check} state={checks[check.key]} />)}
            </Stack>

            {tokenInfo && (
              <Alert severity="info">
                จุดลงทะเบียน: {tokenInfo.pointName} | Token หมดอายุ: {tokenInfo.expiresAt ? new Date(tokenInfo.expiresAt).toLocaleString('th-TH') : '-'}
              </Alert>
            )}
            {tokenInfo && (policy.requireCamera || policy.requireFullscreen) && (
              <Alert severity="warning">
                นโยบายจุดนี้ต้องผ่าน: {[
                  policy.requireCamera ? 'Camera' : '',
                  policy.requireFullscreen ? 'Fullscreen' : '',
                ].filter(Boolean).join(', ')}
              </Alert>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button fullWidth variant="outlined" onClick={runDiagnostics} disabled={running}>
                {running ? <CircularProgress size={20} /> : 'ตรวจอีกครั้ง'}
              </Button>
              <Button fullWidth variant="contained" startIcon={<FullscreenIcon />} onClick={startKiosk} disabled={!criticalReady || running}>
                เปิดใช้งาน Kiosk
              </Button>
            </Stack>

            <Button color="inherit" onClick={() => navigate('/login')}>กลับไปหน้า Login</Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
