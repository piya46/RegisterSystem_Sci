import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import OtpInput from '../components/OtpInput';
import useParticipantAuth from '../hooks/useParticipantAuth';
import {
  getParticipantAuthProviders,
  requestParticipantEmailOtp,
  startParticipantLineLogin,
  verifyParticipantEmailOtp,
} from '../utils/api';

export default function UserLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useParticipantAuth();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const redirectTo = params.get('redirect') || '/user/home';
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState({ email: true, line: false });

  const eventContext = {
    ...(params.get('eventId') ? { eventId: params.get('eventId') } : {}),
    ...(params.get('eventYear') ? { eventYear: params.get('eventYear') } : {}),
  };

  useEffect(() => {
    let active = true;
    getParticipantAuthProviders()
      .then((res) => {
        if (active) setProviders({ email: Boolean(res.data?.email), line: Boolean(res.data?.line) });
      })
      .catch(() => {
        if (active) setProviders({ email: true, line: false });
      });
    return () => { active = false; };
  }, []);

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const requestOtp = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await requestParticipantEmailOtp(email, eventContext);
      setChallenge({ id: res.challengeId, ref: res.ref });
      setMessage(res.message || 'ส่งรหัสยืนยันแล้ว');
    } catch (err) {
      setError(err.response?.data?.message || 'ไม่สามารถส่งรหัสยืนยันได้');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await verifyParticipantEmailOtp(challenge.id, otp);
      const data = res.data || {};
      login(data.token, data.participant, data.session);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'รหัสยืนยันไม่ถูกต้อง');
    } finally {
      setLoading(false);
    }
  };

  const loginWithLine = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await startParticipantLineLogin({
        redirectUri: `${window.location.origin}/user/line/callback`,
        ...eventContext,
      });
      window.location.href = res.data.authorizationUrl;
    } catch (err) {
      setError(err.response?.data?.message || 'ไม่สามารถเริ่มเข้าสู่ระบบด้วย LINE ได้');
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f7fb', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, border: '1px solid #e5e9f2' }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h5" fontWeight={800}>เข้าสู่ระบบผู้เข้าร่วม</Typography>
              <Typography variant="body2" color="text.secondary">เปิดกระเป๋า, QR ticket, คูปอง และข้อมูลกิจกรรมของคุณ</Typography>
            </Box>

            {error && <Alert severity="error">{error}</Alert>}
            {message && <Alert severity="success">{message}{challenge?.ref ? ` (Ref: ${challenge.ref})` : ''}</Alert>}

            {providers.email && <Stack spacing={2}>
              <TextField
                label="อีเมลที่ใช้ลงทะเบียน"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading || Boolean(challenge)}
                fullWidth
              />
              {!challenge ? (
                <Button
                  variant="contained"
                  size="large"
                  startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <MailOutlineIcon />}
                  onClick={requestOtp}
                  disabled={loading || !email}
                >
                  ขอรหัส OTP
                </Button>
              ) : (
                <Stack spacing={2}>
                  <OtpInput value={otp} onChange={setOtp} />
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <LoginIcon />}
                    onClick={verifyOtp}
                    disabled={loading || otp.length < 8}
                  >
                    ยืนยันและเข้าสู่ระบบ
                  </Button>
                  <Button disabled={loading} onClick={() => { setChallenge(null); setOtp(''); setMessage(''); }}>
                    เปลี่ยนอีเมล
                  </Button>
                </Stack>
              )}
            </Stack>}

            {providers.line && <Button variant="outlined" size="large" onClick={loginWithLine} disabled={loading}>
              Login with LINE
            </Button>}

            {!providers.email && !providers.line && (
              <Alert severity="warning">ยังไม่มีช่องทางเข้าสู่ระบบที่พร้อมใช้งาน</Alert>
            )}
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
