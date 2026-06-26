import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, CircularProgress } from '@mui/material';

export default function KioskJoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      localStorage.setItem('kioskToken', token);
      // Reload so AuthProvider re-checks /auth/me with the new scoped token.
      window.location.replace('/kiosk');
    } else {
      navigate('/login');
    }
  }, [token, navigate]);

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh">
      <CircularProgress />
      <Typography mt={2}>กำลังตั้งค่า Kiosk Mode...</Typography>
    </Box>
  );
}
