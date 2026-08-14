import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import LogoutIcon from '@mui/icons-material/Logout';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import LinkIcon from '@mui/icons-material/Link';
import SecurityIcon from '@mui/icons-material/Security';
import OtpInput from '../components/OtpInput';
import useParticipantAuth from '../hooks/useParticipantAuth';
import {
  listParticipantSessions,
  logoutAllParticipantSessions,
  requestParticipantStepUpOtp,
  revokeParticipantSession,
  startParticipantLineLink,
  switchParticipantEvent,
  unlinkParticipantLine,
  verifyParticipantStepUpOtp,
} from '../utils/api';

export default function UserHomePage() {
  const navigate = useNavigate();
  const { participant, token, session, loading, logout, login, isAuthenticated } = useParticipantAuth();
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stepUp, setStepUp] = useState({ open: false, action: '', challengeId: '', ref: '', otp: '', loading: false });

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate('/user/login', { replace: true });
  }, [isAuthenticated, loading, navigate]);

  const loadSessions = async () => {
    if (!token) return;
    try {
      const res = await listParticipantSessions(token);
      setSessions(res.data?.sessions || []);
      setCurrentSessionId(res.data?.currentSessionId || session?.id || null);
    } catch (err) {
      setError(err.response?.data?.message || 'ไม่สามารถโหลดรายการ session ได้');
    }
  };

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openStepUp = async (action) => {
    try {
      setError('');
      setSuccess('');
      setStepUp({ open: true, action, challengeId: '', ref: '', otp: '', loading: true });
      const res = await requestParticipantStepUpOtp(action, token);
      setStepUp({ open: true, action, challengeId: res.challengeId, ref: res.ref, otp: '', loading: false });
    } catch (err) {
      setStepUp({ open: false, action: '', challengeId: '', ref: '', otp: '', loading: false });
      setError(err.response?.data?.message || 'ไม่สามารถส่งรหัสยืนยันได้');
    }
  };

  const confirmStepUp = async () => {
    try {
      setStepUp((value) => ({ ...value, loading: true }));
      const res = await verifyParticipantStepUpOtp(stepUp.challengeId, stepUp.otp, stepUp.action, token);
      const stepUpToken = res.data?.stepUpToken;
      if (stepUp.action === 'logout_all') {
        await logoutAllParticipantSessions(token, stepUpToken);
        await logout();
        navigate('/user/login', { replace: true });
        return;
      }
      if (stepUp.action === 'line_link') {
        const linkStart = await startParticipantLineLink(stepUpToken, {
          redirectUri: `${window.location.origin}/user/line/callback`,
        }, token);
        window.location.href = linkStart.data.authorizationUrl;
        return;
      }
      if (stepUp.action === 'line_unlink') {
        const unlinkRes = await unlinkParticipantLine(stepUpToken, token);
        if (unlinkRes.token) login(unlinkRes.token, { ...participant, isLineLinked: false, lineProfile: null }, unlinkRes.session || null);
        setSuccess('ยกเลิกการผูก LINE สำเร็จ');
        setStepUp({ open: false, action: '', challengeId: '', ref: '', otp: '', loading: false });
        return;
      }
      setStepUp({ open: false, action: '', challengeId: '', ref: '', otp: '', loading: false });
      loadSessions();
    } catch (err) {
      setStepUp((value) => ({ ...value, loading: false }));
      setError(err.response?.data?.message || 'รหัสยืนยันไม่ถูกต้อง');
    }
  };

  const revokeDevice = async (sessionId) => {
    try {
      setError('');
      await revokeParticipantSession(sessionId, token);
      setSuccess('ยกเลิก session สำเร็จ');
      loadSessions();
    } catch (err) {
      setError(err.response?.data?.message || 'ไม่สามารถยกเลิก session ได้');
    }
  };

  const switchEvent = async (participantId) => {
    try {
      setError('');
      const res = await switchParticipantEvent(participantId, token);
      const data = res.data || {};
      login(data.token, data.participant, data.session);
      setSuccess('สลับกิจกรรมสำเร็จ');
    } catch (err) {
      setError(err.response?.data?.message || 'ไม่สามารถสลับกิจกรรมได้');
    }
  };

  if (loading) {
    return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }

  const fields = participant?.fields || {};
  const name = fields.name || fields.fullName || fields.fullname || fields.email || 'ผู้เข้าร่วมงาน';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f7fb', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="md">
        <Stack spacing={2.5}>
          {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
          {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}

          <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2, border: '1px solid #e5e9f2' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
              <Box>
                <Typography variant="h5" fontWeight={800}>{name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {participant?.eventYear ? `Event ${participant.eventYear}` : 'Participant account'}
                </Typography>
              </Box>
              <Button variant="contained" startIcon={<AccountBalanceWalletIcon />} onClick={() => navigate('/wallet')}>
                เปิด Wallet
              </Button>
            </Stack>
          </Paper>

          {participant?.events?.length > 1 && (
            <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2, border: '1px solid #e5e9f2' }}>
              <Stack spacing={1.5}>
                <Typography variant="h6" fontWeight={800}>กิจกรรมของฉัน</Typography>
                <List disablePadding>
                  {participant.events.map((item) => {
                    const isCurrent = String(item.participantId) === String(participant.id);
                    return (
                      <ListItem
                        key={String(item.participantId)}
                        disableGutters
                        secondaryAction={!isCurrent ? (
                          <Button size="small" onClick={() => switchEvent(item.participantId)}>เปิด</Button>
                        ) : null}
                      >
                        <ListItemText
                          primary={`${item.name || 'กิจกรรม'}${isCurrent ? ' (ปัจจุบัน)' : ''}`}
                          secondary={`Event ${item.eventYear || '-'} · ${item.status || '-'}`}
                        />
                      </ListItem>
                    );
                  })}
                </List>
              </Stack>
            </Paper>
          )}

          <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2, border: '1px solid #e5e9f2' }}>
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <SecurityIcon color="primary" />
                <Typography variant="h6" fontWeight={800}>ความปลอดภัย</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                LINE: {participant?.isLineLinked ? participant.lineProfile?.displayName || 'Linked' : 'Not linked'}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                {participant?.isLineLinked && (
                  <Button variant="outlined" color="warning" startIcon={<LinkOffIcon />} onClick={() => openStepUp('line_unlink')}>
                    ยกเลิก LINE
                  </Button>
                )}
                {!participant?.isLineLinked && (
                  <Button variant="outlined" startIcon={<LinkIcon />} onClick={() => openStepUp('line_link')}>
                    ผูก LINE
                  </Button>
                )}
                <Button variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={() => openStepUp('logout_all')}>
                  Logout ทุกอุปกรณ์
                </Button>
                <Button variant="text" onClick={logout}>ออกจากระบบ</Button>
              </Stack>
              <Divider />
              <Typography fontWeight={700}>อุปกรณ์ที่ใช้งานอยู่</Typography>
              <List disablePadding>
                {sessions.map((item) => (
                  <ListItem
                    key={item.id}
                    disableGutters
                    secondaryAction={String(item.id) !== String(currentSessionId) ? (
                      <Button size="small" color="error" onClick={() => revokeDevice(item.id)}>ยกเลิก</Button>
                    ) : null}
                  >
                    <ListItemText
                      primary={`${item.deviceLabel || 'Session'}${String(item.id) === String(currentSessionId) ? ' (ปัจจุบัน)' : ''}`}
                      secondary={item.lastActivityAt ? new Date(item.lastActivityAt).toLocaleString('th-TH') : ''}
                    />
                  </ListItem>
                ))}
              </List>
            </Stack>
          </Paper>
        </Stack>
      </Container>

      <Dialog open={stepUp.open} onClose={() => !stepUp.loading && setStepUp({ open: false, action: '', challengeId: '', ref: '', otp: '', loading: false })} maxWidth="xs" fullWidth>
        <DialogTitle>ยืนยันความปลอดภัย</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {stepUp.ref && <Alert severity="info">Ref: {stepUp.ref}</Alert>}
            {stepUp.loading && !stepUp.challengeId ? <CircularProgress size={24} /> : <OtpInput value={stepUp.otp} onChange={(otp) => setStepUp((value) => ({ ...value, otp }))} />}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={stepUp.loading} onClick={() => setStepUp({ open: false, action: '', challengeId: '', ref: '', otp: '', loading: false })}>ยกเลิก</Button>
          <Button variant="contained" disabled={stepUp.loading || stepUp.otp.length < 8} onClick={confirmStepUp}>
            {stepUp.loading ? <CircularProgress size={20} color="inherit" /> : 'ยืนยัน'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
