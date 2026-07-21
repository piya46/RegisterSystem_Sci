import React, { useEffect, useState } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, CircularProgress, Chip } from '@mui/material';
import { getPublicReportData } from '../utils/api';
import usePublicEventContext from '../hooks/usePublicEventContext';

const Y = { main: "#FFC107", dark: "#F57F17", light: "#FFF8E1", text: "#4E342E" };

export default function PublicReportPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { event, eventParams, loading: eventLoading, error: eventError } = usePublicEventContext();

  useEffect(() => {
    if (!event) return undefined;
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getPublicReportData(eventParams);
        if (!active) return;
        setData(res.data.data || []);
        setTotal(res.data.totalCheckedIn || 0);
      } catch {
        if (!active) return;
        setError('ไม่สามารถโหลดข้อมูลรายงานได้');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => {
      active = false;
    };
  }, [event, eventParams]);

  const formatTime = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  if (eventLoading || (loading && event)) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" bgcolor="#fafafa">
        <CircularProgress sx={{ color: Y.main }} />
        <Typography mt={2}>กำลังโหลดข้อมูล...</Typography>
      </Box>
    );
  }

  if (eventError || error || !event) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Typography color="error" variant="h6">{eventError || error || 'ไม่พบข้อมูลกิจกรรม'}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', mt: 4, mb: 8, p: { xs: 2, md: 4 }, fontFamily: 'Prompt, sans-serif' }}>
      <Box textAlign="center" mb={4}>
        {event.branding?.logoUrl && (
          <Box
            component="img"
            src={event.branding.logoUrl}
            alt={`โลโก้ ${event.name}`}
            sx={{ width: 72, height: 72, objectFit: 'contain', mb: 1 }}
          />
        )}
        <Typography variant="h4" fontWeight={800} color={Y.text} gutterBottom>
          รายงานผู้เข้าร่วมงาน {event.name}
        </Typography>
        <Chip label={`เช็คอินแล้วทั้งหมด ${total} คน`} color="success" sx={{ fontSize: '1.1rem', py: 2, px: 1, fontWeight: 'bold' }} />
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 1, border: "1px solid #eee" }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: Y.light }}>
              <TableCell align="center" sx={{ fontWeight: 800, color: Y.text }}>ช่วงเวลาเช็คอิน</TableCell>
              <TableCell align="left" sx={{ fontWeight: 800, color: Y.text }}>ชื่อ-นามสกุล (ซ่อนข้อมูล)</TableCell>
              <TableCell align="center" sx={{ fontWeight: 800, color: Y.text }}>ภาควิชา</TableCell>
              <TableCell align="center" sx={{ fontWeight: 800, color: Y.text }}>จุดลงทะเบียน</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4 }}>ยังไม่มีผู้เช็คอิน</TableCell></TableRow>
            ) : (
              data.map((row, idx) => (
                <TableRow key={idx} hover>
                  <TableCell align="center">{formatTime(row.checkedInAt)}</TableCell>
                  <TableCell align="left" sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                  <TableCell align="center">{row.department || '-'}</TableCell>
                  <TableCell align="center">{row.point || '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
