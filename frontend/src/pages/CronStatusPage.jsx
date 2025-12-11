import React, { useEffect, useState } from "react";
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, Stack, CircularProgress, Button
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { getCronLogs } from "../utils/api";
import useAuth from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";

export default function CronStatusPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = () => {
    setLoading(true);
    getCronLogs(token)
      .then(res => setLogs(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(); }, []);

  const getStatusChip = (status) => {
    if (status === 'success') return <Chip icon={<CheckCircleIcon/>} label="Success" color="success" size="small" variant="outlined"/>;
    if (status === 'failed') return <Chip icon={<ErrorIcon/>} label="Failed" color="error" size="small" variant="outlined"/>;
    return <Chip icon={<ScheduleIcon/>} label="Running" color="warning" size="small" variant="outlined"/>;
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: "auto", py: 4, px: 2 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={3}>
        <IconButton onClick={() => navigate("/admin")}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight="bold">สถานะการส่งรายงานอัตโนมัติ</Typography>
        <Box flex={1} />
        <Button startIcon={<RefreshIcon />} onClick={fetchLogs} variant="outlined">รีเฟรช</Button>
      </Stack>

      <TableContainer component={Paper} elevation={2} sx={{ borderRadius: 3 }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f5f5f5' }}>
            <TableRow>
              <TableCell fontWeight="bold">เวลางาน (Start)</TableCell>
              <TableCell>ชื่องาน (Job Name)</TableCell>
              <TableCell>สถานะ</TableCell>
              <TableCell>ใช้เวลา (วินาที)</TableCell>
              <TableCell>รายละเอียด</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
               <TableRow><TableCell colSpan={5} align="center"><CircularProgress /></TableCell></TableRow>
            ) : logs.length === 0 ? (
               <TableRow><TableCell colSpan={5} align="center">ยังไม่มีประวัติการทำงาน</TableCell></TableRow>
            ) : (
              logs.map((log) => {
                const duration = log.endTime 
                  ? ((new Date(log.endTime) - new Date(log.startTime)) / 1000).toFixed(2) + 's' 
                  : '-';
                return (
                  <TableRow key={log._id} hover>
                    <TableCell>{new Date(log.startTime).toLocaleString('th-TH')}</TableCell>
                    <TableCell fontWeight="bold">{log.jobName}</TableCell>
                    <TableCell>{getStatusChip(log.status)}</TableCell>
                    <TableCell>{duration}</TableCell>
                    <TableCell sx={{ maxWidth: 300, wordBreak: 'break-word', color: 'text.secondary', fontSize: '0.85rem' }}>
                      {log.detail || '-'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}