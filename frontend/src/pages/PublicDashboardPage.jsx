// frontend/src/pages/PublicDashboardPage.jsx
import React, { useCallback, useEffect, useState } from 'react';
import { Box, Grid, Card, CardContent, Typography, Stack, CircularProgress, Divider, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Tooltip, Avatar, Container } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import GroupsIcon from '@mui/icons-material/Groups';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ApartmentIcon from '@mui/icons-material/Apartment';
import SchoolIcon from '@mui/icons-material/School';
import { getPublicDashboardStats } from '../utils/api';

// 🌟 ธีมเสือเหลืองคืนถิ่น (Bright Yellow & Dark Brown)
const THEME = {
  bg: "radial-gradient(circle at 50% 50%, #FFFDE7 0%, #FFD54F 100%)",
  gold: "#FFB300",
  yellow: "#FFC107",
  text: "#3E2723",
  accent: "#E65100",
  cardBg: "rgba(255, 255, 255, 0.9)"
};

export default function PublicDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const eventYear = new URLSearchParams(window.location.search).get('eventYear') || '';

  const fetchStats = useCallback(async () => {
    try {
      const res = await getPublicDashboardStats(eventYear ? { eventYear } : undefined);
      setStats(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [eventYear]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (loading && !stats) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" bgcolor="#FFFDE7">
        <CircularProgress sx={{ color: THEME.accent }} size={80} thickness={4} />
        <Typography mt={3} color={THEME.text} variant="h5" fontWeight="bold">กำลังโหลดข้อมูล...</Typography>
      </Box>
    );
  }

  return (
    // 🌟 ใช้ Flexbox จัดกึ่งกลางทั้งแนวตั้งและแนวนอน
    <Box sx={{ minHeight: '100vh', background: THEME.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 2, md: 5 }, fontFamily: 'Prompt, sans-serif', overflowX: 'hidden' }}>

      {/* 🌟 จำกัดความกว้างไม่ให้เนื้อหายืดเกินไปเมื่อเปิดจอใหญ่ */}
      <Container maxWidth="xl">

        {/* Header Section */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={5}>
          <Stack direction="row" spacing={3} alignItems="center">
            <Avatar src="/logo.svg" sx={{ width: 100, height: 100, bgcolor: '#fff', border: `4px solid ${THEME.accent}`, p: 1, boxShadow: '0 4px 15px rgba(230, 81, 0, 0.3)' }} />
            <Box>
              <Typography variant="h3" fontWeight={900} color={THEME.accent} sx={{ textShadow: '0 2px 4px rgba(255,255,255,0.8)', letterSpacing: 1 }}>
                DASHBOARD
              </Typography>
              <Typography variant="h6" color={THEME.text} sx={{ letterSpacing: 2, fontWeight: 700 }}>
                งานคืนเหย้า เสือเหลืองคืนถิ่น
              </Typography>
            </Box>
          </Stack>

          <Paper elevation={12} sx={{ p: 2, px: 4, borderRadius: 4, bgcolor: THEME.cardBg, border: `2px solid ${THEME.gold}`, textAlign: 'center', backdropFilter: 'blur(10px)', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }}>
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} mb={0.5}>
              <AccessTimeIcon sx={{ color: THEME.accent }} />
              <Typography variant="body1" color={THEME.text} fontWeight={800}>เวลาปัจจุบัน</Typography>
            </Stack>
            <Typography variant="h3" fontWeight={900} color={THEME.accent} fontFamily="monospace" sx={{ textShadow: '0 2px 4px rgba(255,255,255,0.5)' }}>
              {formatTime(currentTime)}
            </Typography>
          </Paper>
        </Stack>

        {/* Summary Cards */}
        <Grid container spacing={4} mb={6}>
          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 6, background: 'linear-gradient(135deg, #FF6F00 0%, #E65100 100%)', boxShadow: '0 10px 30px rgba(230, 81, 0, 0.4)' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 4 }}>
                <Box>
                  <Typography variant="h6" color="rgba(255,255,255,0.9)" fontWeight={700}>ยอดรวมทั้งหมด (คน)</Typography>
                  <Typography variant="h1" fontWeight={900} color="#FFF">{stats?.totalAttendees || 0}</Typography>
                </Box>
                <GroupsIcon sx={{ fontSize: 100, color: 'rgba(255,255,255,0.3)' }} />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Card sx={{ borderRadius: 6, background: 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)', boxShadow: '0 10px 30px rgba(46, 125, 50, 0.4)' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 4 }}>
                <Box>
                  <Typography variant="h6" color="rgba(255,255,255,0.9)" fontWeight={700}>ผู้ร่วมงานหลัก (คน)</Typography>
                  <Typography variant="h1" fontWeight={900} color="#FFF">{stats?.totalCheckedIn || 0}</Typography>
                </Box>
                <PeopleIcon sx={{ fontSize: 100, color: 'rgba(255,255,255,0.3)' }} />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Card sx={{ borderRadius: 6, background: 'linear-gradient(135deg, #1976D2 0%, #1565C0 100%)', boxShadow: '0 10px 30px rgba(21, 101, 192, 0.4)' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 4 }}>
                <Box>
                  <Typography variant="h6" color="rgba(255,255,255,0.9)" fontWeight={700}>ผู้ติดตาม (คน)</Typography>
                  <Typography variant="h1" fontWeight={900} color="#FFF">{stats?.totalFollowers || 0}</Typography>
                </Box>
                <PersonAddIcon sx={{ fontSize: 100, color: 'rgba(255,255,255,0.3)' }} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tables Section */}
        <Grid container spacing={5}>

          {/* ตารางแยกตามภาควิชา */}
          <Grid item xs={12} md={6}>
            <Paper elevation={10} sx={{ p: 4, borderRadius: 6, border: `2px solid #FFF`, height: '100%', bgcolor: THEME.cardBg, backdropFilter: 'blur(10px)' }}>
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={2} mb={3}>
                <ApartmentIcon sx={{ fontSize: 40, color: THEME.accent }} />
                <Typography variant="h4" fontWeight={800} color={THEME.text}>สถิติแยกตามภาควิชา</Typography>
              </Stack>
              <Divider sx={{ mb: 2, borderColor: THEME.gold }} />

              <TableContainer sx={{ maxHeight: 450, overflow: 'auto', '&::-webkit-scrollbar': { width: '8px' }, '&::-webkit-scrollbar-thumb': { backgroundColor: THEME.gold, borderRadius: '4px' } }}>
                <Table stickyHeader size="medium">
                  <TableHead>
                    <TableRow>
                      {/* 🌟 ปรับให้อยู่กึ่งกลาง */}
                      <TableCell align="center" sx={{ fontWeight: 800, bgcolor: '#FFF8E1', color: THEME.text, fontSize: '1.2rem', borderBottom: `2px solid ${THEME.gold}` }}>ชื่อภาควิชา</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 800, bgcolor: '#FFF8E1', color: THEME.text, fontSize: '1.2rem', borderBottom: `2px solid ${THEME.gold}` }}>จำนวน (คน)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stats?.deptStats.map((row, i) => (
                      <TableRow key={i} sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { bgcolor: '#FFFDE7' } }}>
                        <TableCell align="center" sx={{ color: THEME.text, fontSize: '1.2rem', borderBottom: '1px dashed #E0E0E0', fontWeight: 600 }}>{row.name}</TableCell>
                        <TableCell align="center" sx={{ borderBottom: '1px dashed #E0E0E0' }}>
                          <Typography fontWeight={900} color={THEME.accent} fontSize="1.5rem">{row.count}</Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                    {stats?.deptStats.length === 0 && (
                      <TableRow><TableCell colSpan={2} align="center" sx={{ py: 5, color: 'text.secondary', fontSize: '1.2rem' }}>ยังไม่มีข้อมูลผู้เข้าร่วม</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* ตารางแยกตามปีการศึกษา */}
          <Grid item xs={12} md={6}>
            <Paper elevation={10} sx={{ p: 4, borderRadius: 6, border: `2px solid #FFF`, height: '100%', bgcolor: THEME.cardBg, backdropFilter: 'blur(10px)' }}>
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={2} mb={3}>
                <SchoolIcon sx={{ fontSize: 40, color: THEME.accent }} />
                <Typography variant="h4" fontWeight={800} color={THEME.text}>สถิติแยกตามปีการศึกษา</Typography>
              </Stack>
              <Divider sx={{ mb: 2, borderColor: THEME.gold }} />

              <TableContainer sx={{ maxHeight: 450, overflow: 'auto', '&::-webkit-scrollbar': { width: '8px' }, '&::-webkit-scrollbar-thumb': { backgroundColor: THEME.gold, borderRadius: '4px' } }}>
                <Table stickyHeader size="medium">
                  <TableHead>
                    <TableRow>
                      {/* 🌟 ปรับให้อยู่กึ่งกลาง */}
                      <TableCell align="center" sx={{ fontWeight: 800, bgcolor: '#FFF8E1', color: THEME.text, fontSize: '1.2rem', borderBottom: `2px solid ${THEME.gold}` }}>ปีการศึกษา (รุ่น)</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 800, bgcolor: '#FFF8E1', color: THEME.text, fontSize: '1.2rem', borderBottom: `2px solid ${THEME.gold}` }}>จำนวน (คน)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stats?.yearStats.map((row, i) => (
                      <TableRow key={i} sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { bgcolor: '#FFFDE7' } }}>
                        <TableCell align="center" sx={{ color: THEME.text, fontSize: '1.2rem', borderBottom: '1px dashed #E0E0E0', fontWeight: 600 }}>{row.name}</TableCell>
                        <TableCell align="center" sx={{ borderBottom: '1px dashed #E0E0E0' }}>
                          <Typography fontWeight={900} color={THEME.accent} fontSize="1.5rem">{row.count}</Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                    {stats?.yearStats.length === 0 && (
                      <TableRow><TableCell colSpan={2} align="center" sx={{ py: 5, color: 'text.secondary', fontSize: '1.2rem' }}>ยังไม่มีข้อมูลผู้เข้าร่วม</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

        </Grid>
      </Container>
    </Box>
  );
}
