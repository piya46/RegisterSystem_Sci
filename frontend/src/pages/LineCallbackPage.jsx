import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Alert, Box, Button, CircularProgress, Container, Paper, Stack, Typography } from '@mui/material';
import useParticipantAuth from '../hooks/useParticipantAuth';
import { loginParticipantWithLine } from '../utils/api';

export default function LineCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useParticipantAuth();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [error, setError] = useState('');

  useEffect(() => {
    const run = async () => {
      const error = params.get('error');
      const errorDescription = params.get('error_description');
      const code = params.get('code');
      const state = params.get('state');
      if (window.location.search) {
        window.history.replaceState(null, document.title, window.location.pathname);
      }

      if (error) {
        setError(errorDescription || 'LINE login ถูกยกเลิก');
        return;
      }
      if (!code || !state) {
        setError('ข้อมูล LINE callback ไม่ครบ กรุณาเริ่มเข้าสู่ระบบใหม่');
        return;
      }
      try {
        const res = await loginParticipantWithLine({
          code,
          state,
          redirectUri: `${window.location.origin}/user/line/callback`,
        });
        const data = res.data || {};
        login(data.token, data.participant, data.session);
        navigate('/user/home', { replace: true });
      } catch (err) {
        setError(err.response?.data?.message || 'ไม่สามารถเข้าสู่ระบบด้วย LINE ได้');
      }
    };
    run();
  }, [login, navigate, params]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f7fb', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, border: '1px solid #e5e9f2' }}>
          {error ? (
            <Stack spacing={2}>
              <Alert severity="warning">{error}</Alert>
              <Typography variant="body2" color="text.secondary">หาก LINE ยังไม่ได้ผูกกับบัญชีเดิม ให้เข้าสู่ระบบด้วยอีเมลก่อน</Typography>
              <Button variant="contained" onClick={() => navigate('/user/login')}>เข้าสู่ระบบด้วยอีเมล</Button>
            </Stack>
          ) : (
            <Stack spacing={2} alignItems="center">
              <CircularProgress />
              <Typography fontWeight={700}>กำลังตรวจสอบ LINE Login</Typography>
            </Stack>
          )}
        </Paper>
      </Container>
    </Box>
  );
}
