import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, CircularProgress } from '@mui/material';

export default function KioskJoinPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hashParams.get('token');
    if (token) {
      window.history.replaceState(null, '', window.location.pathname);
      localStorage.removeItem('kioskToken');
      sessionStorage.setItem('kioskToken', token);
      window.location.replace('/kiosk/diagnostic');
    } else {
      navigate('/login');
    }
  }, [navigate]);

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh">
      <CircularProgress />
      <Typography mt={2}>กำลังตั้งค่า Kiosk Mode...</Typography>
    </Box>
  );
}
