// src/pages/AdminParticipantsPage.jsx
import React, { useEffect, useState } from 'react';
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, TextField, Button, IconButton, Tooltip, CircularProgress, 
  Typography, MenuItem, Select, InputLabel, FormControl, Stack, Chip, 
  Snackbar, Alert, Grid, Card, CardContent, InputAdornment, Fade,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider
} from '@mui/material';
import { styled, useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom'; // <--- เพิ่ม import

// Icons
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save'; 
import CancelIcon from '@mui/icons-material/Cancel'; 
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import EmailIcon from '@mui/icons-material/Email';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PeopleIcon from '@mui/icons-material/People';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack'; // <--- เพิ่มไอคอน
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { downloadPdfReport } from '../utils/api';

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { listParticipants, deleteParticipant, updateParticipant, resendTicket } from '../utils/api';

/* ===================== Theme & Styles ===================== */
const Y = {
  main: "#FFC107",      // Primary Gold
  dark: "#F57F17",      // Dark Gold
  light: "#FFF8E1",     // Light Cream
  text: "#4E342E",      // Dark Brown
  success: "#2e7d32",   // Green
  white: "#FFFFFF",
  gray: "#f5f5f5"
};

const StyledCard = styled(Card)(({ theme }) => ({
  borderRadius: 16,
  boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
  border: "1px solid rgba(0,0,0,0.05)",
  transition: "transform 0.2s",
  "&:hover": {
    transform: "translateY(-4px)",
    boxShadow: "0 8px 24px rgba(255, 193, 7, 0.2)",
    borderColor: Y.main
  }
}));

const StatusChip = styled(Chip)(({ status }) => {
  let bgcolor, color;
  switch (status) {
    case 'checkedIn':
      bgcolor = "#e8f5e9"; color = "#2e7d32"; break;
    case 'registered':
      bgcolor = "#FFF8E1"; color = "#F57F17"; break;
    case 'cancelled':
      bgcolor = "#ffebee"; color = "#c62828"; break;
    default:
      bgcolor = "#f5f5f5"; color = "#757575";
  }
  return { 
    backgroundColor: bgcolor, 
    color: color, 
    fontWeight: 700,
    border: `1px solid ${color}22`
  };
});

/* ===================== Main Component ===================== */

function AdminParticipantsPage() {
  const navigate = useNavigate(); // <--- เรียกใช้ hook
  const [participants, setParticipants] = useState([]);
  const [search, setSearch] = useState('');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  
  const [loading, setLoading] = useState(false);
  const [resendLoadingId, setResendLoadingId] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Dialog State
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editFields, setEditFields] = useState({ name: '', phone: '', dept: '', date_year: '' });

  const token = localStorage.getItem('token');

  const fetchParticipants = async () => {
    setLoading(true);
    try {
      const res = await listParticipants(token);
      setParticipants(res.data || res);
    } catch (err) {
      setSnackbar({ open: true, message: 'โหลดข้อมูลผิดพลาด', severity: 'error' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchParticipants();
  }, [token]);

  // Derived Data for Filters
  const uniqueDepts = Array.from(new Set(participants.map(p => p.fields.dept).filter(Boolean))).sort();
  const uniqueYears = Array.from(new Set(participants.map(p => p.fields.date_year).filter(Boolean))).sort();

  // Filter Logic
  const filteredParticipants = participants.filter(p => {
    const matchSearch = (p.fields.name || '').toLowerCase().includes(search.toLowerCase())
      || (p.fields.phone || '').includes(search);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchDept = deptFilter === 'all' || p.fields.dept === deptFilter;
    const matchYear = yearFilter === 'all' || p.fields.date_year === yearFilter;
    return matchSearch && matchStatus && matchDept && matchYear;
  });

  // Statistics
  const stats = {
    total: participants.length,
    checkedIn: participants.filter(p => p.status === 'checkedIn').length,
    registered: participants.filter(p => p.status === 'registered').length,
  };

  // Helpers
  const formatCheckinDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('th-TH', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // --- Handlers ---

  // Delete
  const handleDelete = async (id) => {
    if (!window.confirm('ยืนยันการลบผู้เข้าร่วม?')) return;
    try {
      await deleteParticipant(id, token);
      setSnackbar({ open: true, message: 'ลบข้อมูลสำเร็จ', severity: 'success' });
      fetchParticipants();
    } catch {
      setSnackbar({ open: true, message: 'ลบไม่สำเร็จ', severity: 'error' });
    }
  };

  // Open Edit Dialog
  const handleEditClick = (participant) => {
    setEditId(participant._id);
    setEditFields({
      name: participant.fields.name || '',
      phone: participant.fields.phone || '',
      dept: participant.fields.dept || '',
      date_year: participant.fields.date_year || ''
    });
    setOpenEditDialog(true);
  };

  // Close Edit Dialog
  const handleCloseDialog = () => {
    setOpenEditDialog(false);
    setEditId(null);
  };

  // Save Edit (API Call)
  const handleSaveEdit = async () => {
    try {
      await updateParticipant(editId, { fields: editFields }, token);
      setSnackbar({ open: true, message: 'บันทึกการแก้ไขแล้ว', severity: 'success' });
      handleCloseDialog();
      fetchParticipants();
    } catch {
      setSnackbar({ open: true, message: 'บันทึกไม่สำเร็จ', severity: 'error' });
    }
  };

  // Handle Input Change in Dialog
  const handleDialogInputChange = (e) => {
    const { name, value } = e.target;
    setEditFields(prev => ({ ...prev, [name]: value }));
  };

  // Export Excel
  const exportExcel = () => {
    const dataToExport = filteredParticipants.map(p => ({
      ชื่อ: p.fields.name || '',
      เบอร์โทร: p.fields.phone || '',
      สถานะ: p.status || '',
      เวลาเช็คอิน: formatCheckinDate(p.checkedInAt),
      ภาควิชา: p.fields.dept || '',
      ปีการศึกษา: p.fields.date_year || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Participants");
    XLSX.writeFile(workbook, "Participants_Report.xlsx");
  };

  // Resend Ticket
  const handleResend = async (participant) => {
    if (!participant.fields.phone) {
      setSnackbar({ open: true, message: 'ไม่พบเบอร์โทรศัพท์', severity: 'warning' });
      return;
    }
    setResendLoadingId(participant._id);
    try {
      const res = await resendTicket({ phone: participant.fields.phone });
      if (res.data?.sent) {
        setSnackbar({ open: true, message: 'ส่ง E-Ticket สำเร็จ', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: res.data?.message || 'ส่งไม่สำเร็จ', severity: 'warning' });
      }
    } catch (err) {
      setSnackbar({ open: true, message: 'เกิดข้อผิดพลาดในการส่ง', severity: 'error' });
    }
    setResendLoadingId(null);
  };

  const handleDownloadPdf = async () => {
    if(!window.confirm("ต้องการดาวน์โหลด PDF รายงานสรุปผลหรือไม่?")) return;
    try {
        const res = await downloadPdfReport(token);
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Report_${new Date().toISOString().slice(0,10)}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (err) {
        alert("ดาวน์โหลดล้มเหลว");
    }
};

  return (
    <Box sx={{ 
      maxWidth: 1200, mx: 'auto', mt: 4, mb: 8, p: { xs: 2, md: 4 },
      fontFamily: 'Prompt, sans-serif',
      bgcolor: "#fafafa", borderRadius: 4, minHeight: "80vh"
    }}>
      
      {/* Header Section */}
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
           <Typography variant="h4" fontWeight={800} sx={{ color: Y.text, mb: 0.5 }}>
             Admin Dashboard
           </Typography>
           <Typography variant="body1" color="text.secondary">
             จัดการรายชื่อผู้เข้าร่วมงานและตรวจสอบสถานะ
           </Typography>
        </Box>
        
        {/* Buttons Group */}
        <Stack direction="row" spacing={2} sx={{ mt: {xs: 2, md: 0} }}>
            <Button 
                variant="outlined" 
                startIcon={<ArrowBackIcon />} 
                onClick={() => navigate('/dashboard')}
                sx={{ 
                    borderRadius: 3, 
                    borderColor: 'rgba(0,0,0,0.2)', 
                    color: 'text.primary',
                    "&:hover": { borderColor: Y.dark, bgcolor: '#fff' }
                }}
            >
                กลับหน้าหลัก
            </Button>
            <Button 
                variant="outlined" 
                startIcon={<RefreshIcon />} 
                onClick={fetchParticipants}
                sx={{ 
                    borderRadius: 3, 
                    borderColor: Y.main, 
                    color: Y.dark, 
                    "&:hover":{ bgcolor: Y.light, borderColor: Y.dark } 
                }}
            >
                รีเฟรชข้อมูล
            </Button>
        </Stack>
      </Stack>

      {/* Stats Cards */}
      <Grid container spacing={2} mb={4}>
        <Grid item xs={12} sm={4}>
          <StyledCard>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">ผู้ลงทะเบียนทั้งหมด</Typography>
                <Typography variant="h4" fontWeight={800} color={Y.text}>{stats.total}</Typography>
              </Box>
              <Box sx={{ p: 1.5, borderRadius: '50%', bgcolor: '#E3F2FD', color: '#1565C0' }}>
                <PeopleIcon fontSize="large" />
              </Box>
            </CardContent>
          </StyledCard>
        </Grid>
        <Grid item xs={12} sm={4}>
          <StyledCard>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">เช็คอินแล้ว</Typography>
                <Typography variant="h4" fontWeight={800} color={Y.success}>{stats.checkedIn}</Typography>
              </Box>
              <Box sx={{ p: 1.5, borderRadius: '50%', bgcolor: '#E8F5E9', color: '#2E7D32' }}>
                <CheckCircleIcon fontSize="large" />
              </Box>
            </CardContent>
          </StyledCard>
        </Grid>
        <Grid item xs={12} sm={4}>
          <StyledCard>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">รอเช็คอิน</Typography>
                <Typography variant="h4" fontWeight={800} color={Y.dark}>{stats.registered}</Typography>
              </Box>
              <Box sx={{ p: 1.5, borderRadius: '50%', bgcolor: Y.light, color: Y.dark }}>
                <AccessTimeIcon fontSize="large" />
              </Box>
            </CardContent>
          </StyledCard>
        </Grid>
      </Grid>

      {/* Tools Section (Filter Bar) */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 4, border: "1px solid #eee", bgcolor: "#fff" }}>
        <Grid container spacing={2} alignItems="center">
          {/* Search Box */}
          <Grid item xs={12} lg={4}>
            <TextField
              fullWidth
              placeholder="ค้นหาชื่อ หรือ เบอร์โทร..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>,
                sx: { borderRadius: 3, bgcolor: "#fafafa" }
              }}
              size="small"
            />
          </Grid>

          {/* Filters */}
          <Grid item xs={12} lg={8}>
            <Grid container spacing={2} alignItems="center" justifyContent={{ xs: 'flex-start', lg: 'flex-end' }}>
               <Grid item xs={6} sm={3} md={3}>
                 <FormControl fullWidth size="small">
                    <InputLabel>สถานะ</InputLabel>
                    <Select value={statusFilter} label="สถานะ" onChange={e => setStatusFilter(e.target.value)} sx={{borderRadius: 3}}>
                      <MenuItem value="all">ทั้งหมด</MenuItem>
                      <MenuItem value="registered">รอเช็คอิน</MenuItem>
                      <MenuItem value="checkedIn">เช็คอินแล้ว</MenuItem>
                      <MenuItem value="cancelled">ยกเลิก</MenuItem>
                    </Select>
                  </FormControl>
               </Grid>
               
               <Grid item xs={6} sm={3} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>ภาควิชา</InputLabel>
                    <Select value={deptFilter} label="ภาควิชา" onChange={e => setDeptFilter(e.target.value)} sx={{borderRadius: 3}}>
                      <MenuItem value="all">ทั้งหมด</MenuItem>
                      {uniqueDepts.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                    </Select>
                  </FormControl>
               </Grid>

               <Grid item xs={6} sm={3} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>ปีการศึกษา</InputLabel>
                    <Select value={yearFilter} label="ปีการศึกษา" onChange={e => setYearFilter(e.target.value)} sx={{borderRadius: 3}}>
                      <MenuItem value="all">ทั้งหมด</MenuItem>
                      {uniqueYears.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                    </Select>
                  </FormControl>
               </Grid>

               <Grid item xs={6} sm={3} md={3}>
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<DownloadIcon />}
                    onClick={exportExcel}
                    sx={{ 
                      borderRadius: 3, fontWeight: 700, height: 40,
                      background: `linear-gradient(45deg, ${Y.main}, ${Y.dark})`,
                      color: '#fff', boxShadow: '0 4px 12px rgba(245, 127, 23, 0.3)'
                    }}
                  >
                    EXPORT
                  </Button>
               </Grid>
               <Button 
    variant="contained" 
    color="error" // สีแดง
    startIcon={<PictureAsPdfIcon />} 
    onClick={handleDownloadPdf}
    sx={{ borderRadius: 3 }}
>
    PDF Report
</Button>
            </Grid>
          </Grid>
        </Grid>
      </Paper>

      {/* Table Section */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
          <CircularProgress sx={{ color: Y.main }} />
        </Box>
      ) : (
        <Fade in>
          <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 4, border: "1px solid #eee", overflow: 'hidden' }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  {['ชื่อ-นามสกุล', 'เบอร์โทร', 'สถานะ', 'เวลาเช็คอิน', 'ภาควิชา', 'ปีการศึกษา', 'จัดการ'].map((head) => (
                    <TableCell key={head} align="center" sx={{ 
                      bgcolor: Y.light, color: Y.text, fontWeight: 800, whiteSpace: 'nowrap' 
                    }}>
                      {head}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredParticipants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      <SearchIcon sx={{ fontSize: 40, mb: 1, opacity: 0.5 }} /><br/>
                      ไม่พบข้อมูล
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredParticipants.map(p => (
                    <TableRow key={p._id} hover sx={{ "&:hover": { bgcolor: "#fffcf2" } }}>
                      {/* Name */}
                      <TableCell align="left">
                         <Typography fontWeight={600} color={Y.text}>{p.fields.name || '-'}</Typography>
                      </TableCell>

                      {/* Phone */}
                      <TableCell align="center">
                        <Typography fontFamily="monospace">{p.fields.phone || '-'}</Typography>
                      </TableCell>

                      {/* Status */}
                      <TableCell align="center">
                        <StatusChip 
                          label={p.status === 'checkedIn' ? 'เช็คอินแล้ว' : p.status === 'registered' ? 'รอเช็คอิน' : p.status} 
                          status={p.status} 
                          size="small" 
                        />
                      </TableCell>

                      {/* Check-in Time */}
                      <TableCell align="center" sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
                        {formatCheckinDate(p.checkedInAt)}
                      </TableCell>

                      {/* Dept */}
                      <TableCell align="center">{p.fields.dept || '-'}</TableCell>

                      {/* Year */}
                      <TableCell align="center">{p.fields.date_year || '-'}</TableCell>

                      {/* Actions */}
                      <TableCell align="center">
                        <Stack direction="row" justifyContent="center" spacing={1}>
                          <Tooltip title="แก้ไข">
                            <IconButton onClick={() => handleEditClick(p)} size="small" sx={{ color: 'primary.main', "&:hover": { bgcolor: '#e3f2fd' } }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="ลบ">
                            <IconButton onClick={() => handleDelete(p._id)} size="small" sx={{ color: 'error.main', "&:hover": { bgcolor: '#ffebee' } }}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {p.fields.email && (
                            <Tooltip title="ส่งบัตร E-Ticket อีกครั้ง">
                              <span>
                                <IconButton 
                                  onClick={() => handleResend(p)} 
                                  disabled={resendLoadingId === p._id} 
                                  size="small"
                                  sx={{ color: Y.dark, "&:hover": { bgcolor: Y.light } }}
                                >
                                  {resendLoadingId === p._id ? <CircularProgress size={16} color="inherit" /> : <EmailIcon fontSize="small" />}
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Fade>
      )}

      {/* --- Edit Dialog --- */}
      <Dialog 
        open={openEditDialog} 
        onClose={handleCloseDialog}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle sx={{ textAlign: 'center', fontWeight: 800, color: Y.text, pt: 3 }}>
          แก้ไขข้อมูลผู้เข้าร่วม
          <IconButton
            aria-label="close"
            onClick={handleCloseDialog}
            sx={{ position: 'absolute', right: 8, top: 8, color: (theme) => theme.palette.grey[500] }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ px: 4, py: 3 }}>
          <Stack spacing={2.5}>
            <TextField
              label="ชื่อ-นามสกุล"
              name="name"
              fullWidth
              value={editFields.name}
              onChange={handleDialogInputChange}
              variant="outlined"
              InputProps={{ sx: { borderRadius: 2 } }}
            />
            <TextField
              label="เบอร์โทรศัพท์"
              name="phone"
              fullWidth
              value={editFields.phone}
              onChange={handleDialogInputChange}
              variant="outlined"
              InputProps={{ sx: { borderRadius: 2 } }}
            />
            <TextField
              label="ภาควิชา"
              name="dept"
              fullWidth
              value={editFields.dept}
              onChange={handleDialogInputChange}
              variant="outlined"
              InputProps={{ sx: { borderRadius: 2 } }}
            />
            <TextField
              label="ปีการศึกษา"
              name="date_year"
              fullWidth
              value={editFields.date_year}
              onChange={handleDialogInputChange}
              variant="outlined"
              InputProps={{ sx: { borderRadius: 2 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ pb: 3, px: 4, justifyContent: 'center' }}>
          <Button 
            onClick={handleCloseDialog} 
            variant="outlined" 
            sx={{ borderRadius: 2, px: 3, borderColor: 'text.secondary', color: 'text.secondary' }}
          >
            ยกเลิก
          </Button>
          <Button 
            onClick={handleSaveEdit} 
            variant="contained" 
            sx={{ 
              borderRadius: 2, px: 4, fontWeight: 700,
              bgcolor: Y.main, color: '#fff', 
              ":hover": { bgcolor: Y.dark }
            }}
          >
            บันทึกข้อมูล
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ fontWeight: 600, width: '100%', borderRadius: 2 }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default AdminParticipantsPage;