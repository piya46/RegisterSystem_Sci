// frontend/src/pages/AdminParticipantsPage.jsx
import React, { useEffect, useState } from 'react';
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, TextField, Button, IconButton, Tooltip, CircularProgress,
  Typography, MenuItem, Select, InputLabel, FormControl, Stack, Chip,
  Snackbar, Alert, Grid, Card, CardContent, InputAdornment, Fade,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider,
  Autocomplete, Tabs, Tab, Container
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';

// Icons
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import EmailIcon from '@mui/icons-material/Email';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PeopleIcon from '@mui/icons-material/People';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import IosShareIcon from '@mui/icons-material/IosShare';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import ReplayIcon from '@mui/icons-material/Replay';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';

import { QRCodeSVG } from 'qrcode.react';

import { downloadPdfReport, listParticipants, deleteParticipant, updateParticipant, resendTicket, listPrizes, createPrize, deletePrize, cancelPrizeWinner, restorePrizeRight } from '../utils/api';
import { downloadCsv } from '../utils/exportCsv';

const Y = { main: "#FFC107", dark: "#F57F17", light: "#FFF8E1", text: "#4E342E", success: "#2e7d32", white: "#FFFFFF", gray: "#f5f5f5" };

const StyledCard = styled(Card)(() => ({
  borderRadius: 16,
  boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
  border: "1px solid rgba(0,0,0,0.05)",
  transition: "transform 0.2s",
  "&:hover": { transform: "translateY(-4px)", boxShadow: "0 8px 24px rgba(255, 193, 7, 0.2)", borderColor: Y.main }
}));

const StatusChip = styled(Chip)(({ status }) => {
  let bgcolor, color;
  switch (status) {
    case 'checkedIn': bgcolor = "#e8f5e9"; color = "#2e7d32"; break;
    case 'registered': bgcolor = "#FFF8E1"; color = "#F57F17"; break;
    case 'cancelled': bgcolor = "#ffebee"; color = "#c62828"; break;
    default: bgcolor = "#f5f5f5"; color = "#757575";
  }
  return { backgroundColor: bgcolor, color: color, fontWeight: 700, border: `1px solid ${color}22` };
});

export default function AdminParticipantsPage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(0);

  // States: Participants
  const [participants, setParticipants] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [followerFilter, setFollowerFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [emailFilter, setEmailFilter] = useState('all');

  const [loading, setLoading] = useState(false);
  const [resendLoadingId, setResendLoadingId] = useState(null);

  const [isBulkResending, setIsBulkResending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [editId, setEditId] = useState(null);

  const [editFields, setEditFields] = useState({
    name: '', phone: '', dept: '', date_year: '', email: '', usr_add: '', usr_add_post: ''
  });
  const [editFollowers, setEditFollowers] = useState(0);
  const [editTags, setEditTags] = useState([]);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [selectedParticipantForQr, setSelectedParticipantForQr] = useState(null);

  // States: Prizes
  const [prizes, setPrizes] = useState([]);
  const [prizeLoading, setPrizeLoading] = useState(false);
  const [openAddPrize, setOpenAddPrize] = useState(false);
  const [newPrize, setNewPrize] = useState({ name: '', totalQuantity: 1 });

  useEffect(() => {
    fetchParticipants();
    fetchPrizes();
  }, []);

  // Functions: Participants
  const fetchParticipants = async () => {
    setLoading(true);
    try {
      const res = await listParticipants();
      setParticipants(res.data || res);
    } catch { setSnackbar({ open: true, message: 'โหลดข้อมูลผู้เข้าร่วมผิดพลาด', severity: 'error' }); }
    setLoading(false);
  };

  const fetchPrizes = async () => {
    setPrizeLoading(true);
    try {
      const res = await listPrizes();
      setPrizes(res.data);
    } catch { setSnackbar({ open: true, message: 'โหลดข้อมูลรางวัลไม่สำเร็จ', severity: 'error' }); }
    setPrizeLoading(false);
  };

  const uniqueDepts = Array.from(new Set(participants.map(p => p.fields.dept).filter(Boolean))).sort();
  const uniqueYears = Array.from(new Set(participants.map(p => p.fields.date_year).filter(Boolean))).sort();
  const uniqueTags = Array.from(new Set(participants.flatMap(p => p.tags || []).filter(Boolean))).sort();

  const filteredParticipants = participants.filter(p => {
    const matchSearch = (p.fields.name || '').toLowerCase().includes(search.toLowerCase()) || (p.fields.phone || '').includes(search);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchDept = deptFilter === 'all' || p.fields.dept === deptFilter;
    const matchYear = yearFilter === 'all' || p.fields.date_year === yearFilter;
    const matchTag = tagFilter === 'all' || (p.tags && p.tags.includes(tagFilter));

    let matchFollower = true;
    if (followerFilter === 'has') matchFollower = p.followers > 0;
    if (followerFilter === 'none') matchFollower = !p.followers || p.followers === 0;

    let matchEmail = true;
    if (emailFilter === 'has') matchEmail = !!p.fields?.email;
    if (emailFilter === 'none') matchEmail = !p.fields?.email;

    return matchSearch && matchStatus && matchDept && matchYear && matchFollower && matchTag && matchEmail;
  });

  const stats = {
    total: participants.length,
    checkedIn: participants.filter(p => p.status === 'checkedIn').length,
    registered: participants.filter(p => p.status === 'registered').length,
  };

  const formatCheckinDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('ยืนยันการลบผู้เข้าร่วม?')) return;
    try {
      await deleteParticipant(id);
      setSnackbar({ open: true, message: 'ลบข้อมูลสำเร็จ', severity: 'success' });
      fetchParticipants();
    } catch { setSnackbar({ open: true, message: 'ลบไม่สำเร็จ', severity: 'error' }); }
  };

  const handleEditClick = (participant) => {
    setEditId(participant._id);
    setEditFields({
      name: participant.fields.name || '', phone: participant.fields.phone || '',
      dept: participant.fields.dept || '', date_year: participant.fields.date_year || '',
      email: participant.fields.email || '', usr_add: participant.fields.usr_add || '', usr_add_post: participant.fields.usr_add_post || ''
    });
    setEditFollowers(participant.followers || 0);
    setEditTags(participant.tags || []);
    setOpenEditDialog(true);
  };

  const handleCloseDialog = () => { setOpenEditDialog(false); setEditId(null); setEditTags([]); };
  const handleDialogInputChange = (e) => { const { name, value } = e.target; setEditFields(prev => ({ ...prev, [name]: value })); };

  const handleSaveEdit = async () => {
    try {
      await updateParticipant(editId, { fields: editFields, followers: Number(editFollowers), tags: editTags });
      setSnackbar({ open: true, message: 'บันทึกการแก้ไขแล้ว', severity: 'success' });
      handleCloseDialog();
      fetchParticipants();
    } catch { setSnackbar({ open: true, message: 'บันทึกไม่สำเร็จ', severity: 'error' }); }
  };

  const exportExcel = () => {
    const dataToExport = filteredParticipants.map(p => {
      const wonPrizes = prizes.filter(pz => pz.winners.some(w => w.participantId?._id === p._id || w.participantId === p._id)).map(pz => pz.name).join(', ');

      return {
        ชื่อ: p.fields.name || '', เบอร์โทร: p.fields.phone || '', อีเมล: p.fields.email || '',
        สถานะ: p.status || '', สละสิทธิ์: p.isForfeited ? 'ใช่' : 'ไม่ใช่', เวลาเช็คอิน: formatCheckinDate(p.checkedInAt),
        ภาควิชา: p.fields.dept || '', ปีการศึกษา: p.fields.date_year || '',
        ที่อยู่: p.fields.usr_add ? `${p.fields.usr_add} ${p.fields.usr_add_post || ''}` : '-',
        ผู้ติดตาม: p.followers || 0, Tags: p.tags ? p.tags.join(', ') : '',
        ของรางวัลที่ได้: wonPrizes || '-'
      };
    });
    downloadCsv("Participants_Report.csv", dataToExport);
  };

  const handleResend = async (participant) => {
    if (!participant.fields.phone) { setSnackbar({ open: true, message: 'ไม่พบเบอร์โทรศัพท์', severity: 'warning' }); return; }
    setResendLoadingId(participant._id);
    try {
      const res = await resendTicket({ phone: participant.fields.phone });
      if (res.data?.sent) setSnackbar({ open: true, message: 'ส่ง E-Ticket สำเร็จ', severity: 'success' });
      else setSnackbar({ open: true, message: res.data?.message || 'ส่งไม่สำเร็จ', severity: 'warning' });
    } catch { setSnackbar({ open: true, message: 'เกิดข้อผิดพลาดในการส่ง', severity: 'error' }); }
    setResendLoadingId(null);
  };

  const handleBulkResend = async () => {
    const validParticipants = filteredParticipants.filter(p => p.fields.email && p.fields.phone);

    if (validParticipants.length === 0) {
      setSnackbar({ open: true, message: 'ไม่พบผู้เข้าร่วมที่มีอีเมลและเบอร์โทรศัพท์ในรายการปัจจุบัน', severity: 'warning' });
      return;
    }

    if (!window.confirm(`ยืนยันการส่ง E-Ticket ให้ผู้เข้าร่วมจำนวน ${validParticipants.length} คน?\n\n(ระบบจะใช้เวลาสักครู่เพื่อทยอยส่งทีละคน ป้องกันข้อผิดพลาดจากเซิร์ฟเวอร์)`)) return;

    setIsBulkResending(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < validParticipants.length; i++) {
      setBulkProgress({ current: i + 1, total: validParticipants.length });
      const p = validParticipants[i];

      setResendLoadingId(p._id);

      try {
        const res = await resendTicket({ phone: p.fields.phone });
        if (res.data?.sent) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }

      setResendLoadingId(null);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsBulkResending(false);
    setBulkProgress({ current: 0, total: 0 });
    setSnackbar({
      open: true,
      message: `ส่ง E-Ticket เสร็จสิ้น: สำเร็จ ${successCount} รายการ, ไม่สำเร็จ ${failCount} รายการ`,
      severity: failCount === 0 ? 'success' : 'warning'
    });
  };

  const handleDownloadPdf = async () => {
    if(!window.confirm("ต้องการดาวน์โหลด PDF รายงานสรุปผลหรือไม่?")) return;
    try {
        const res = await downloadPdfReport();
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Report_${new Date().toISOString().slice(0,10)}.pdf`);
        document.body.appendChild(link);
        link.click(); link.remove();
    } catch { alert("ดาวน์โหลดล้มเหลว"); }
  };

  const handleSharePublicReport = () => {
    const link = `${window.location.origin}/public/report`;
    navigator.clipboard.writeText(link);
    setSnackbar({ open: true, message: 'คัดลอกลิงก์รายงาน (Public) สำเร็จ', severity: 'success' });
  };

  // Functions: Prizes
  const handleAddPrize = async () => {
    if (!newPrize.name || newPrize.totalQuantity < 1) return;
    try {
      await createPrize({ ...newPrize, remainingQuantity: newPrize.totalQuantity });
      setOpenAddPrize(false); setNewPrize({ name: '', totalQuantity: 1 });
      setSnackbar({ open: true, message: 'เพิ่มของรางวัลแล้ว', severity: 'success' });
      fetchPrizes();
    } catch { setSnackbar({ open: true, message: 'เพิ่มรางวัลไม่สำเร็จ', severity: 'error' }); }
  };

  const handleDeletePrize = async (id) => {
    if (!window.confirm("ยืนยันการลบของรางวัลชิ้นนี้ออกจากระบบ?")) return;
    try {
      await deletePrize(id);
      setSnackbar({ open: true, message: 'ลบของรางวัลแล้ว', severity: 'success' });
      fetchPrizes();
    } catch { setSnackbar({ open: true, message: 'ลบรางวัลไม่สำเร็จ', severity: 'error' }); }
  };

  const handleRevokePrize = async (prizeId, winnerId) => {
    if (!window.confirm("ยืนยันการยกเลิกสิทธิ์ผู้โชคดีท่านนี้? \nระบบจะคืนโควตารางวัล และผู้ใช้ท่านนี้จะมีสิทธิ์จับรางวัลใหม่อีกครั้ง")) return;
    try {
      await cancelPrizeWinner(prizeId, winnerId);
      setSnackbar({ open: true, message: 'ยกเลิกสิทธิ์และดึงโควต้าคืนสำเร็จ', severity: 'success' });
      fetchPrizes();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'เกิดข้อผิดพลาดในการยกเลิกสิทธิ์', severity: 'error' });
    }
  };

  const handleRestoreRight = async (id) => {
    if (!window.confirm("ยืนยันการคืนสิทธิ์ให้ผู้เข้าร่วมท่านนี้?\nระบบจะปลดล็อกให้เขากลับไปมีชื่อในการสุ่มรางวัลอีกครั้ง")) return;
    try {
      await restorePrizeRight(id);
      setSnackbar({ open: true, message: 'คืนสิทธิ์สำเร็จ ผู้เข้าร่วมสามารถลุ้นรางวัลได้แล้ว', severity: 'success' });
      fetchParticipants();
    } catch {
      setSnackbar({ open: true, message: 'เกิดข้อผิดพลาดในการคืนสิทธิ์', severity: 'error' });
    }
  };

  const handleRefreshAll = () => {
    fetchParticipants();
    fetchPrizes();
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 8, p: { xs: 2, md: 4 }, fontFamily: 'Prompt, sans-serif', bgcolor: "#fafafa", borderRadius: 4, minHeight: "80vh" }}>

      {/* Header Section */}
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} mb={3} gap={2}>
        <Box>
           <Typography variant="h4" fontWeight={800} sx={{ color: Y.text, mb: 0.5 }}>Admin Dashboard</Typography>
           <Typography variant="body1" color="text.secondary">จัดการรายชื่อผู้เข้าร่วมงานและของรางวัล</Typography>
        </Box>
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate('/dashboard')} sx={{ borderRadius: 3, borderColor: 'rgba(0,0,0,0.2)', color: 'text.primary', "&:hover": { borderColor: Y.dark, bgcolor: '#fff' } }}>กลับหน้าหลัก</Button>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefreshAll} sx={{ borderRadius: 3, borderColor: Y.main, color: Y.dark, "&:hover":{ bgcolor: Y.light, borderColor: Y.dark } }}>รีเฟรชข้อมูล</Button>
        </Stack>
      </Stack>

      {/* Tabs สำหรับสลับหน้าจอ */}
      <Paper elevation={0} sx={{ mb: 4, borderBottom: 1, borderColor: 'divider', bgcolor: 'transparent' }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} textColor="primary" indicatorColor="primary" variant="scrollable" scrollButtons="auto">
          <Tab icon={<FormatListBulletedIcon />} iconPosition="start" label={<Typography fontWeight={700}>รายชื่อผู้เข้าร่วม</Typography>} sx={{ textTransform: 'none', fontSize: '1.1rem' }} />
          <Tab icon={<CardGiftcardIcon />} iconPosition="start" label={<Typography fontWeight={700}>จัดการของรางวัล</Typography>} sx={{ textTransform: 'none', fontSize: '1.1rem' }} />
        </Tabs>
      </Paper>

      {/* ======================================================== */}
      {/* TAB 0: รายชื่อผู้เข้าร่วม */}
      {/* ======================================================== */}
      {activeTab === 0 && (
        <Fade in>
          <Box>
            {/* Stats Cards */}
            <Grid container spacing={2} mb={4}>
              <Grid item xs={12} sm={4}><StyledCard><CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Box><Typography variant="subtitle2" color="text.secondary">ผู้ลงทะเบียนทั้งหมด</Typography><Typography variant="h4" fontWeight={800} color={Y.text}>{stats.total}</Typography></Box><Box sx={{ p: 1.5, borderRadius: '50%', bgcolor: '#E3F2FD', color: '#1565C0' }}><PeopleIcon fontSize="large" /></Box></CardContent></StyledCard></Grid>
              <Grid item xs={12} sm={4}><StyledCard><CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Box><Typography variant="subtitle2" color="text.secondary">เช็คอินแล้ว</Typography><Typography variant="h4" fontWeight={800} color={Y.success}>{stats.checkedIn}</Typography></Box><Box sx={{ p: 1.5, borderRadius: '50%', bgcolor: '#E8F5E9', color: '#2E7D32' }}><CheckCircleIcon fontSize="large" /></Box></CardContent></StyledCard></Grid>
              <Grid item xs={12} sm={4}><StyledCard><CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Box><Typography variant="subtitle2" color="text.secondary">รอเช็คอิน</Typography><Typography variant="h4" fontWeight={800} color={Y.dark}>{stats.registered}</Typography></Box><Box sx={{ p: 1.5, borderRadius: '50%', bgcolor: Y.light, color: Y.dark }}><AccessTimeIcon fontSize="large" /></Box></CardContent></StyledCard></Grid>
            </Grid>

            {/* Filter Section - เพิ่มกล่องแรเงาให้ดูมีมิติ */}
            <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 4, border: "1px solid #eee", bgcolor: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.03)" }}>
              <Grid container spacing={2}>

                {/* Search Bar */}
                <Grid item xs={12}>
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

                {/* ตัวกรอง (Filters) */}
                <Grid item xs={6} sm={4} md={2}>
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
                <Grid item xs={6} sm={4} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>ภาควิชา</InputLabel>
                    <Select value={deptFilter} label="ภาควิชา" onChange={e => setDeptFilter(e.target.value)} sx={{borderRadius: 3}}>
                      <MenuItem value="all">ทั้งหมด</MenuItem>
                      {uniqueDepts.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>ปีการศึกษา</InputLabel>
                    <Select value={yearFilter} label="ปีการศึกษา" onChange={e => setYearFilter(e.target.value)} sx={{borderRadius: 3}}>
                      <MenuItem value="all">ทั้งหมด</MenuItem>
                      {uniqueYears.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>ผู้ติดตาม</InputLabel>
                    <Select value={followerFilter} label="ผู้ติดตาม" onChange={e => setFollowerFilter(e.target.value)} sx={{borderRadius: 3}}>
                      <MenuItem value="all">ทั้งหมด</MenuItem>
                      <MenuItem value="has">มีผู้ติดตาม</MenuItem>
                      <MenuItem value="none">ไม่มีผู้ติดตาม</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Tags</InputLabel>
                    <Select value={tagFilter} label="Tags" onChange={e => setTagFilter(e.target.value)} sx={{borderRadius: 3}}>
                      <MenuItem value="all">ทั้งหมด</MenuItem>
                      {uniqueTags.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>อีเมล</InputLabel>
                    <Select value={emailFilter} label="อีเมล" onChange={e => setEmailFilter(e.target.value)} sx={{borderRadius: 3}}>
                      <MenuItem value="all">ทั้งหมด</MenuItem>
                      <MenuItem value="has">มีอีเมล</MenuItem>
                      <MenuItem value="none">ไม่มีอีเมล</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {/* กลุ่มปุ่ม Actions ด้านล่างตัวกรอง */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 1, borderStyle: 'dashed' }} />
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    justifyContent="flex-end"
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                    mt={1}
                  >
                    <Button variant="outlined" onClick={handleSharePublicReport} startIcon={<IosShareIcon />} sx={{ borderRadius: 3, height: 40, borderColor: Y.main, color: Y.dark, "&:hover": { bgcolor: Y.light } }}>
                      Public Link
                    </Button>
                    <Button variant="contained" color="error" onClick={handleDownloadPdf} startIcon={<PictureAsPdfIcon />} sx={{ borderRadius: 3, height: 40, minWidth: 'auto' }}>
                      PDF Report
                    </Button>
                    <Button variant="contained" onClick={exportExcel} startIcon={<DownloadIcon />} sx={{ borderRadius: 3, fontWeight: 700, height: 40, background: `linear-gradient(45deg, ${Y.main}, ${Y.dark})`, color: '#fff', boxShadow: '0 4px 12px rgba(245, 127, 23, 0.3)' }}>
                      Export CSV
                    </Button>
                    <Button
                      variant="contained"
                      color="info"
                      onClick={handleBulkResend}
                      disabled={isBulkResending}
                      startIcon={isBulkResending ? <CircularProgress size={20} color="inherit" /> : <EmailIcon />}
                      sx={{ borderRadius: 3, height: 40, fontWeight: 700 }}
                    >
                      {isBulkResending ? `กำลังทยอยส่ง (${bulkProgress.current}/${bulkProgress.total})` : "ส่ง E-Ticket ตามตาราง"}
                    </Button>
                  </Stack>
                </Grid>
              </Grid>
            </Paper>

            {/* 🌟 ตารางข้อมูล - ปรับให้ overflowX: 'auto' ป้องกันกรอบล้น */}
            {loading ? ( <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}><CircularProgress sx={{ color: Y.main }} /></Box> ) : (
              <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 4, border: "1px solid #eee", boxShadow: "0 4px 20px rgba(0,0,0,0.03)", overflowX: 'auto' }}>
                <Table stickyHeader>
                  <TableHead>
                    <TableRow>
                      {/* 🌟 เพิ่ม 'ปีการศึกษา' เข้าไปใน Header */}
                      {['ชื่อ-นามสกุล', 'เบอร์โทร', 'สถานะ', 'สละสิทธิ์', 'ผู้ติดตาม', 'Tags', 'อีเมล', 'ของรางวัล', 'เวลาเช็คอิน', 'ภาควิชา', 'ปีการศึกษา', 'จัดการ'].map((head) => (
                        <TableCell key={head} align="center" sx={{ bgcolor: Y.light, color: Y.text, fontWeight: 800, whiteSpace: 'nowrap' }}>{head}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredParticipants.length === 0 ? (
                      <TableRow><TableCell colSpan={12} align="center" sx={{ py: 6, color: 'text.secondary' }}><SearchIcon sx={{ fontSize: 40, mb: 1, opacity: 0.5 }} /><br/>ไม่พบข้อมูล</TableCell></TableRow>
                    ) : (
                      filteredParticipants.map(p => {
                        const wonPrizes = prizes.filter(pz => pz.winners.some(w => w.participantId?._id === p._id || w.participantId === p._id));

                        return (
                          <TableRow key={p._id} hover sx={{ "&:hover": { bgcolor: "#fffcf2" } }}>
                            <TableCell align="left" sx={{ whiteSpace: 'nowrap' }}><Typography fontWeight={600} color={Y.text}>{p.fields.name || '-'}</Typography></TableCell>
                            <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}><Typography fontFamily="monospace">{p.fields.phone || '-'}</Typography></TableCell>
                            <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}><StatusChip label={p.status === 'checkedIn' ? 'เช็คอินแล้ว' : p.status === 'registered' ? 'รอเช็คอิน' : p.status} status={p.status} size="small" /></TableCell>

                            <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                              {p.isForfeited ? (
                                <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                                  <Chip label="หมดสิทธิ์สุ่ม" size="small" sx={{ bgcolor: '#ffebee', color: '#c62828', fontWeight: 700 }} />
                                  <Tooltip title="คลิกเพื่อคืนสิทธิ์ให้กลับไปสุ่มรางวัลได้">
                                    <IconButton size="small" color="success" onClick={() => handleRestoreRight(p._id)}>
                                      <SettingsBackupRestoreIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Stack>
                              ) : (
                                <Typography variant="body2" color="text.secondary">-</Typography>
                              )}
                            </TableCell>

                            <TableCell align="center">
                              <Typography fontWeight={600} color={p.followers > 0 ? "primary" : "text.secondary"}>
                                {p.followers || 0}
                              </Typography>
                            </TableCell>

                            <TableCell align="center">
                              {p.tags && p.tags.length > 0 ? (
                                <Stack direction="row" spacing={0.5} justifyContent="center" flexWrap="wrap" useFlexGap>
                                  {p.tags.map((tag, idx) => (
                                    <Chip key={idx} label={tag} size="small" sx={{ bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 600, fontSize: '0.75rem', height: 20 }} />
                                  ))}
                                </Stack>
                              ) : '-'}
                            </TableCell>

                            <TableCell align="center">
                              {p.fields.email ? (
                                <Tooltip title={p.fields.email}>
                                  <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                                </Tooltip>
                              ) : (
                                <Typography color="text.disabled" variant="body2">-</Typography>
                              )}
                            </TableCell>

                            <TableCell align="center">
                              {wonPrizes.length > 0 ? (
                                <Stack direction="row" spacing={0.5} justifyContent="center" flexWrap="wrap" useFlexGap>
                                  {wonPrizes.map(pz => (
                                    <Tooltip key={pz._id} title="คลิก (x) เพื่อยกเลิกสิทธิ์และดึงโควต้าคืน">
                                      <Chip
                                        icon={<CardGiftcardIcon style={{ color: '#E65100' }} />}
                                        label={pz.name}
                                        size="small"
                                        sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 700, border: '1px solid #FFE0B2', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}
                                        onDelete={() => handleRevokePrize(pz._id, p._id)}
                                      />
                                    </Tooltip>
                                  ))}
                                </Stack>
                              ) : <Typography variant="caption" color="text.disabled">-</Typography>}
                            </TableCell>

                            <TableCell align="center" sx={{ color: 'text.secondary', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>{formatCheckinDate(p.checkedInAt)}</TableCell>
                            <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>{p.fields.dept || '-'}</TableCell>

                            {/* 🌟 แสดงข้อมูล "ปีการศึกษา" ตรงนี้ */}
                            <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>{p.fields.date_year || '-'}</TableCell>

                            <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                              <Stack direction="row" justifyContent="center" spacing={1}>
                                <Tooltip title="ดู QR Code"><IconButton onClick={() => { setSelectedParticipantForQr(p); setQrDialogOpen(true); }} size="small" sx={{ color: '#00bcd4', "&:hover": { bgcolor: '#e0f7fa' } }}><QrCode2Icon fontSize="small" /></IconButton></Tooltip>
                                <Tooltip title="แก้ไข"><IconButton onClick={() => handleEditClick(p)} size="small" sx={{ color: 'primary.main', "&:hover": { bgcolor: '#e3f2fd' } }}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                <Tooltip title="ลบ"><IconButton onClick={() => handleDelete(p._id)} size="small" sx={{ color: 'error.main', "&:hover": { bgcolor: '#ffebee' } }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                {p.fields.email && ( <Tooltip title="ส่งบัตร E-Ticket อีกครั้ง"><span><IconButton onClick={() => handleResend(p)} disabled={resendLoadingId === p._id} size="small" sx={{ color: Y.dark, "&:hover": { bgcolor: Y.light } }}>{resendLoadingId === p._id ? <CircularProgress size={16} color="inherit" /> : <EmailIcon fontSize="small" />}</IconButton></span></Tooltip> )}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </Fade>
      )}

      {/* ======================================================== */}
      {/* TAB 1: จัดการของรางวัล */}
      {/* ======================================================== */}
      {activeTab === 1 && (
        <Fade in>
          <Box>
            <Box mb={3} textAlign="right">
              <Button variant="contained" onClick={() => setOpenAddPrize(true)} sx={{ bgcolor: Y.main, color: '#fff', borderRadius: 3, fontWeight: 'bold' }}>+ เพิ่มของรางวัลใหม่</Button>
            </Box>

            {prizeLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}><CircularProgress sx={{ color: Y.main }} /></Box> : (
              <Grid container spacing={3}>
                {prizes.length === 0 ? (
                  <Grid item xs={12}><Typography textAlign="center" color="text.secondary" py={5}>ยังไม่มีรายการของรางวัล</Typography></Grid>
                ) : prizes.map((prize) => (
                  <Grid item xs={12} sm={6} md={4} key={prize._id}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 4, textAlign: 'center', border: `2px solid ${prize.remainingQuantity === 0 ? '#eee' : Y.main}`, bgcolor: '#fff', height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <Box>
                        <CardGiftcardIcon sx={{ fontSize: 60, color: prize.remainingQuantity === 0 ? '#ccc' : Y.dark, mb: 1 }} />
                        <Typography variant="h6" fontWeight="bold" color={Y.text}>{prize.name}</Typography>
                        <Typography variant="body2" color="text.secondary" mb={2}>
                          จำนวนคงเหลือ: <strong style={{color: prize.remainingQuantity === 0 ? 'red' : 'green'}}>{prize.remainingQuantity}</strong> / {prize.totalQuantity} รางวัล
                        </Typography>
                      </Box>

                      <Divider sx={{ my: 1.5 }} />

                      {/* แสดงรายชื่อคนได้รางวัล & ปุ่มลบสิทธิ์ */}
                      <Box sx={{ flexGrow: 1, mb: 2, textAlign: 'left' }}>
                        <Typography variant="caption" fontWeight="bold" color="text.secondary" display="block" mb={1}>รายชื่อผู้ได้รับรางวัล:</Typography>

                        {prize.winners && prize.winners.length === 0 ? (
                          <Typography variant="body2" color="text.disabled" textAlign="center" py={1}>ยังไม่มีผู้ได้รับรางวัล</Typography>
                        ) : (
                          <Stack spacing={1}>
                            {prize.winners.map(w => (
                              <Box key={w.participantId?._id || Math.random()} sx={{ bgcolor: '#FFF8E1', p: 1, borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Box>
                                  <Typography variant="body2" fontWeight={600} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {w.participantId?.fields?.name || 'ไม่ทราบชื่อ'}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '10px' }}>
                                    {new Date(w.wonAt).toLocaleTimeString('th-TH')}
                                  </Typography>
                                </Box>

                                <Tooltip title="ยกเลิกสิทธิ์และดึงโควต้ารางวัลคืน">
                                  <IconButton size="small" color="error" onClick={() => handleRevokePrize(prize._id, w.participantId?._id || w.participantId)}>
                                    <ReplayIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            ))}
                          </Stack>
                        )}
                      </Box>

                      <Button variant="outlined" color="error" fullWidth size="small" onClick={() => handleDeletePrize(prize._id)} startIcon={<DeleteIcon/>} sx={{ borderRadius: 3, mt: 'auto' }}>
                        ลบของรางวัลนี้ทิ้ง
                      </Button>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        </Fade>
      )}

      {/* Dialog เพิ่มของรางวัล */}
      <Dialog open={openAddPrize} onClose={() => setOpenAddPrize(false)} PaperProps={{ sx: { borderRadius: 4, p: 1 } }}>
        <DialogTitle fontWeight="bold">เพิ่มรายการของรางวัล</DialogTitle>
        <DialogContent>
          <Stack spacing={3} mt={1} minWidth={{xs: 250, sm: 350}}>
            <TextField label="ชื่อของรางวัล" fullWidth variant="outlined" value={newPrize.name} onChange={(e) => setNewPrize({...newPrize, name: e.target.value})} InputProps={{sx: {borderRadius: 2}}} />
            <TextField label="จำนวนรางวัลทั้งหมด (ชิ้น)" type="number" fullWidth variant="outlined" value={newPrize.totalQuantity} onChange={(e) => setNewPrize({...newPrize, totalQuantity: parseInt(e.target.value) || ''})} InputProps={{sx: {borderRadius: 2}}} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0, justifyContent: 'center' }}>
          <Button onClick={() => setOpenAddPrize(false)} sx={{ color: 'text.secondary' }}>ยกเลิก</Button>
          <Button onClick={handleAddPrize} variant="contained" sx={{ bgcolor: Y.main, color: '#fff', borderRadius: 2, px: 3 }}>บันทึกรางวัล</Button>
        </DialogActions>
      </Dialog>

      {/* ======================================================== */}
      {/* Dialogs ที่ใช้ร่วมกัน */}
      {/* ======================================================== */}

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onClose={() => setQrDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4, textAlign: 'center', p: 2 } }}>
         <DialogTitle fontWeight="bold">QR Code ของผู้เข้าร่วม</DialogTitle>
         <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Typography variant="body1" color="text.secondary">{selectedParticipantForQr?.fields?.name || "ไม่ระบุชื่อ"}</Typography>
            <Box sx={{ p: 2, bgcolor: '#fff', border: '1px solid #eee', borderRadius: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
               {selectedParticipantForQr && <QRCodeSVG value={selectedParticipantForQr.qrCode || selectedParticipantForQr._id || "no-code"} size={200} level={"H"} />}
            </Box>
            <Typography variant="caption" color="text.secondary">Ref: {selectedParticipantForQr?.qrCode}</Typography>
         </DialogContent>
         <DialogActions sx={{ justifyContent: 'center' }}><Button onClick={() => setQrDialogOpen(false)} variant="contained" color="primary">ปิดหน้าต่าง</Button></DialogActions>
      </Dialog>

      {/* Edit Participant Dialog */}
      <Dialog open={openEditDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ textAlign: 'center', fontWeight: 800, color: Y.text, pt: 3 }}>
          แก้ไขข้อมูลผู้เข้าร่วม
          <IconButton aria-label="close" onClick={handleCloseDialog} sx={{ position: 'absolute', right: 8, top: 8, color: (theme) => theme.palette.grey[500] }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ px: { xs: 3, sm: 4 }, py: 3 }}>
          <Stack spacing={2.5}>
            <Autocomplete
              multiple freeSolo options={[]} value={editTags} onChange={(event, newValue) => setEditTags(newValue)}
              renderTags={(value, getTagProps) => value.map((option, index) => ( <Chip variant="outlined" label={option} {...getTagProps({ index })} color="primary" /> ))}
              renderInput={(params) => ( <TextField {...params} variant="outlined" label="Tags บุคคลพิเศษ (พิมพ์แล้วกด Enter)" placeholder="เช่น VIP, สปอนเซอร์, ศิษย์เก่าดีเด่น" InputProps={{ ...params.InputProps, sx: { borderRadius: 2 } }} /> )}
            />
            <TextField label="ชื่อ-นามสกุล" name="name" fullWidth value={editFields.name} onChange={handleDialogInputChange} variant="outlined" InputProps={{ sx: { borderRadius: 2 } }} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="อีเมล" name="email" fullWidth value={editFields.email} onChange={handleDialogInputChange} variant="outlined" InputProps={{ sx: { borderRadius: 2 } }} />
              <TextField label="เบอร์โทรศัพท์" name="phone" fullWidth value={editFields.phone} onChange={handleDialogInputChange} variant="outlined" InputProps={{ sx: { borderRadius: 2 } }} />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="ภาควิชา" name="dept" fullWidth value={editFields.dept} onChange={handleDialogInputChange} variant="outlined" InputProps={{ sx: { borderRadius: 2 } }} />
              <TextField label="ปีการศึกษา (รุ่น)" name="date_year" fullWidth value={editFields.date_year} onChange={handleDialogInputChange} variant="outlined" InputProps={{ sx: { borderRadius: 2 } }} />
            </Stack>
            <Divider sx={{ my: 1 }}><Chip label="ข้อมูลติดต่อจัดส่ง" size="small" /></Divider>
            <TextField label="ที่อยู่จัดส่ง" name="usr_add" fullWidth multiline rows={2} value={editFields.usr_add} onChange={handleDialogInputChange} variant="outlined" InputProps={{ sx: { borderRadius: 2 } }} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="รหัสไปรษณีย์" name="usr_add_post" fullWidth value={editFields.usr_add_post} onChange={handleDialogInputChange} variant="outlined" InputProps={{ sx: { borderRadius: 2 } }} />
              <TextField label="จำนวนผู้ติดตาม (คน)" type="number" fullWidth value={editFollowers} onChange={(e) => setEditFollowers(e.target.value)} variant="outlined" InputProps={{ sx: { borderRadius: 2 } }} />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ pb: 3, px: 4, justifyContent: 'center', gap: 1 }}>
          <Button onClick={handleCloseDialog} variant="outlined" sx={{ borderRadius: 2, px: 3, borderColor: 'text.secondary', color: 'text.secondary' }}>ยกเลิก</Button>
          <Button onClick={handleSaveEdit} variant="contained" sx={{ borderRadius: 2, px: 4, fontWeight: 700, bgcolor: Y.main, color: '#fff', ":hover": { bgcolor: Y.dark } }}>บันทึกข้อมูล</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ fontWeight: 600, width: '100%', borderRadius: 2 }}>{snackbar.message}</Alert>
      </Snackbar>
    </Container>
  );
}
