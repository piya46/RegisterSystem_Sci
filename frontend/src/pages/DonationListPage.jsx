import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, Button, IconButton, Typography, Stack, Chip, InputAdornment, LinearProgress,
  Card, CardContent, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, MenuItem, FormControl, InputLabel, Select, CircularProgress, Alert
} from '@mui/material';
import Grid from '@mui/material/GridLegacy';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import PaymentsIcon from '@mui/icons-material/Payments';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddBoxIcon from '@mui/icons-material/AddBox';
import InsertPhotoIcon from '@mui/icons-material/InsertPhoto';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloseIcon from '@mui/icons-material/Close';
import { getDonationSummary, updateDonation, deleteDonation, createDonation, createIdempotencyKey, getStoredObjectAccess, uploadDonationSlip } from '../utils/api';
import { downloadCsv } from '../utils/exportCsv';
import { useNavigate, useParams } from 'react-router';
import { EmptyState } from '../components/FeedbackStates';

export default function DonationListPage() {
  const { eventId: paramEventId } = useParams();
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // In the nested layout, eventId comes from URL path.
  // eventYear could still be passed or left empty if not strict.
  const [eventYear] = useState('');
  const [eventId, setEventId] = useState(paramEventId || '');

  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [createRequestKey, setCreateRequestKey] = useState(() => createIdempotencyKey());

  const navigate = useNavigate();

  useEffect(() => {
    if (paramEventId) setEventId(paramEventId);
  }, [paramEventId]);

  const eventParams = useMemo(
    () => ({ eventId, eventYear }),
    [eventId, eventYear]
  );

  const fetchDonations = useCallback(async () => {
    if (!eventId) {
      setDonations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getDonationSummary(eventParams);
      setDonations(res.data?.transactions || []);
    } catch (err) {
      console.error("Failed to fetch donations", err);
    } finally {
      setLoading(false);
    }
  }, [eventId, eventParams]);

  useEffect(() => { fetchDonations(); }, [fetchDonations]);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filteredDonations = useMemo(() => {
    return donations.filter((d) => {
      const query = search.toLowerCase();
      const fullName = `${d.firstName || ''} ${d.lastName || ''}`.toLowerCase();
      const amountStr = d.amount ? d.amount.toString() : '';
      return fullName.includes(query) || amountStr.includes(query);
    });
  }, [donations, search]);

  const displayTotalAmount = filteredDonations.reduce((sum, item) => sum + (item.amount || 0), 0);
  const displayTotalCount = filteredDonations.length;

  const handleOpenDialog = (donation = null) => {
    setDialogError('');
    if (donation) {
      setIsEditing(true);
      setFormData(donation);
    } else {
      setIsEditing(false);
      setCreateRequestKey(createIdempotencyKey());
      setFormData({ firstName: '', lastName: '', amount: '', transferDateTime: new Date().toISOString().slice(0, 16), isPackage: false, packageType: '', size: '', slipUrl: '', address: '', pickupMethod: 'DELIVERY', ...eventParams });
    }
    setOpenDialog(true);
  };

  const handleSave = async () => {
    setDialogError('');
    try {
      if (isEditing) {
        await updateDonation(formData._id, formData);
      } else {
        await createDonation(formData, createRequestKey);
      }
      setOpenDialog(false);
      fetchDonations();
    } catch (error) {
      setDialogError(error.response?.data?.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  const handleSlipUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !eventId) return;
    setUploadingSlip(true);
    setDialogError('');
    try {
      const response = await uploadDonationSlip(file, eventId);
      setFormData((current) => ({ ...current, slipUrl: response.data?.reference || '' }));
    } catch (error) {
      setDialogError(error.response?.data?.message || 'อัปโหลดสลิปไม่สำเร็จ');
    } finally {
      setUploadingSlip(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("คุณแน่ใจหรือไม่ที่จะลบรายการนี้?")) return;
    try {
      await deleteDonation(id, eventParams);
      fetchDonations();
    } catch {
      alert("เกิดข้อผิดพลาดในการลบข้อมูล");
    }
  };

  const handleOpenSlip = async (slipUrl) => {
    if (!slipUrl) return;
    if (!String(slipUrl).startsWith('object://')) {
      try {
        const legacyUrl = new URL(String(slipUrl), window.location.origin);
        if (!['http:', 'https:'].includes(legacyUrl.protocol)) throw new Error('Unsafe legacy slip URL');
        window.open(legacyUrl.href, '_blank', 'noopener,noreferrer');
      } catch {
        alert('ลิงก์สลิปเดิมไม่ปลอดภัยหรือไม่ถูกต้อง');
      }
      return;
    }
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const response = await getStoredObjectAccess(slipUrl);
      const accessUrl = response.data?.url;
      if (!accessUrl) throw new Error('Missing stored object access URL');
      if (tab) tab.location.replace(accessUrl);
      else window.location.assign(accessUrl);
    } catch {
      if (tab) tab.close();
      alert('ไม่สามารถเปิดรูปสลิปได้ กรุณาลองใหม่');
    }
  };

  const exportExcel = () => {
    if (filteredDonations.length === 0) return alert("ไม่พบข้อมูลที่จะส่งออก");
    const dataToExport = filteredDonations.map((d, index) => ({
        'ลำดับ': index + 1,
        'วันที่โอน': formatDate(d.transferDateTime),
        'ชื่อ': d.firstName || '',
        'นามสกุล': d.lastName || '',
        'ประเภท': d.isPackage ? 'ซื้อแพ็กเกจ' : 'บริจาค',
        'แพ็กเกจ': d.packageType || '-',
        'ไซส์': d.size || '-',
        'วิธีรับ': d.pickupMethod === 'DELIVERY' ? 'จัดส่ง' : d.pickupMethod === 'PICKUP' ? 'รับหน้างาน' : '-',
        'ที่อยู่จัดส่ง': d.address || '-',
        'ยอดเงิน': d.amount || 0,
        'แนบสลิป': d.slipUrl ? 'มี' : 'ไม่มี',
        'ช่องทาง': d.source
    }));
    downloadCsv(`Donations_${new Date().toISOString().slice(0,10)}.csv`, dataToExport);
  };

  if (!eventId) {
    return (
      <Box sx={{ p: { xs: 2, md: 4 } }}>
        <Box sx={{ maxWidth: 900, mx: "auto" }}>
          <EmptyState
            title="เลือกกิจกรรมก่อนดูผู้สนับสนุน"
            description="รายการสนับสนุนถูกแยกตามกิจกรรม และจะไม่ค้นจากปีเพื่อป้องกันข้อมูลคนละงานปนกัน"
            actionLabel="ไปหน้าเลือกกิจกรรม"
            onAction={() => navigate('/workspace')}
            icon={<EventAvailableIcon />}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1300, mx: "auto" }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" spacing={2} sx={{ mb: 3 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight="bold" sx={{ color: '#2e7d32', display: 'flex', alignItems: 'center', gap: 1 }}>
              <VolunteerActivismIcon /> จัดการรายชื่อผู้สนับสนุน
            </Typography>
            <Typography variant="body2" color="text.secondary">เพิ่ม ลบ อัปเดต และตรวจสอบสลิป</Typography>
          </Box>
          <Chip label={`กิจกรรมที่เลือก ${eventId.slice(-6)}`} sx={{ bgcolor: '#fff', borderRadius: 2 }} />
          <Button variant="contained" color="primary" startIcon={<AddBoxIcon />} onClick={() => handleOpenDialog()} sx={{ borderRadius: 2 }}>เพิ่มรายการใหม่</Button>
          <Button variant="contained" color="success" startIcon={<DownloadIcon />} onClick={exportExcel} sx={{ borderRadius: 2 }}>Export CSV</Button>
        </Stack>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius: 3, bgcolor: '#e8f5e9', border: '1px solid #c8e6c9', boxShadow: 'none' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: '50%' }}><PaymentsIcon sx={{ color: '#2e7d32' }} /></Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>ยอดเงินรวม</Typography>
                  <Typography variant="h4" fontWeight={800} color="#1b5e20">฿{displayTotalAmount.toLocaleString()}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius: 3, border: '1px solid #eee', boxShadow: 'none' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: '#f5f5f5', borderRadius: '50%' }}><ReceiptLongIcon sx={{ color: '#666' }} /></Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>จำนวนรายการ</Typography>
                  <Typography variant="h4" fontWeight={800}>{displayTotalCount.toLocaleString()}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <TextField fullWidth placeholder="ค้นหาชื่อ, นามสกุล, ยอดเงิน..." value={search} onChange={(e) => setSearch(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment> }} size="small" sx={{ mb: 3, bgcolor: '#fff', '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />

        <TableContainer component={Paper} sx={{ borderRadius: 3, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
          {loading && <LinearProgress color="success" />}
          <Table stickyHeader>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 'bold', bgcolor: '#f1f8e9', color: '#33691e', whiteSpace: 'nowrap' } }}>
                <TableCell>วัน/เวลาโอน</TableCell>
                <TableCell>ชื่อ-นามสกุล</TableCell>
                <TableCell>แพ็กเกจ / ไซส์</TableCell>
                <TableCell>วิธีรับของ / ที่อยู่</TableCell>
                <TableCell align="right">ยอดเงิน</TableCell>
                <TableCell align="center">สลิป</TableCell>
                <TableCell align="center">จัดการ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDonations.length > 0 ? filteredDonations.map((row) => (
                <TableRow key={row._id} hover>
                  <TableCell sx={{ fontSize: '0.9rem' }}>{formatDate(row.transferDateTime)}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{row.firstName} {row.lastName}</TableCell>
                  <TableCell>
                    {row.isPackage ? <Chip icon={<CardGiftcardIcon />} label={`${row.packageType} ${row.size ? `(${row.size})` : ''}`} size="small" color="secondary" variant="outlined" /> : <Typography variant="body2" color="text.secondary">ไม่รับของที่ระลึก</Typography>}
                  </TableCell>
                  <TableCell>
                    {row.isPackage ? (
                      <Box>
                        <Typography variant="caption" fontWeight="bold" color="primary">{row.pickupMethod === 'DELIVERY' ? 'จัดส่ง' : 'รับหน้างาน'}</Typography>
                        {row.pickupMethod === 'DELIVERY' && <Typography variant="caption" display="block" color="text.secondary">{row.address || '-'}</Typography>}
                      </Box>
                    ) : "-"}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#2e7d32', fontWeight: 800 }}>฿{row.amount?.toLocaleString()}</TableCell>
                  <TableCell align="center">
                    {row.slipUrl ? <Tooltip title="ดูสลิป"><IconButton onClick={() => handleOpenSlip(row.slipUrl)} color="info"><InsertPhotoIcon /></IconButton></Tooltip> : <Typography variant="caption" color="text.secondary">-</Typography>}
                  </TableCell>
                  <TableCell align="center">
                    <IconButton onClick={() => handleOpenDialog(row)} color="primary"><EditIcon /></IconButton>
                    <IconButton onClick={() => handleDelete(row._id)} color="error"><DeleteIcon /></IconButton>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6 }}>ไม่พบข้อมูล</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ bgcolor: '#f1f8e9', color: '#2e7d32', fontWeight: 'bold' }}>{isEditing ? 'แก้ไขข้อมูลผู้สนับสนุน' : 'เพิ่มข้อมูลผู้สนับสนุน'}</DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={6}><TextField label="ชื่อ" fullWidth value={formData.firstName || ''} onChange={(e) => setFormData({...formData, firstName: e.target.value})} sx={{ mt: 1 }} /></Grid>
              <Grid item xs={6}><TextField label="นามสกุล" fullWidth value={formData.lastName || ''} onChange={(e) => setFormData({...formData, lastName: e.target.value})} sx={{ mt: 1 }} /></Grid>
              <Grid item xs={6}><TextField label="ยอดเงิน" type="number" fullWidth value={formData.amount || ''} onChange={(e) => setFormData({...formData, amount: e.target.value})} /></Grid>
              <Grid item xs={6}><TextField label="เวลาโอน" type="datetime-local" fullWidth value={formData.transferDateTime ? new Date(formData.transferDateTime).toISOString().slice(0,16) : ''} onChange={(e) => setFormData({...formData, transferDateTime: e.target.value})} InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>ประเภท</InputLabel>
                  <Select value={formData.isPackage ? 'package' : 'general'} label="ประเภท" onChange={(e) => setFormData({...formData, isPackage: e.target.value === 'package'})}>
                    <MenuItem value="general">บริจาคทั่วไป (ไม่รับของ)</MenuItem>
                    <MenuItem value="package">สนับสนุนรับแพ็กเกจ (ของที่ระลึก)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              {formData.isPackage && (
                <>
                  <Grid item xs={8}><TextField label="ชื่อแพ็กเกจ" fullWidth value={formData.packageType || ''} onChange={(e) => setFormData({...formData, packageType: e.target.value})} /></Grid>
                  <Grid item xs={4}><TextField label="ไซส์เสื้อ" fullWidth value={formData.size || ''} onChange={(e) => setFormData({...formData, size: e.target.value})} /></Grid>
                  <Grid item xs={12}>
                    <FormControl fullWidth>
                      <InputLabel>วิธีรับสินค้า</InputLabel>
                      <Select value={formData.pickupMethod || 'DELIVERY'} label="วิธีรับสินค้า" onChange={(e) => setFormData({...formData, pickupMethod: e.target.value})}>
                        <MenuItem value="DELIVERY">จัดส่งตามที่อยู่</MenuItem>
                        <MenuItem value="PICKUP">รับด้วยตนเองหน้างาน</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  {formData.pickupMethod === 'DELIVERY' && <Grid item xs={12}><TextField label="ที่อยู่จัดส่งแบบเต็ม" multiline rows={2} fullWidth value={formData.address || ''} onChange={(e) => setFormData({...formData, address: e.target.value})} /></Grid>}
                </>
              )}
              <Grid item xs={12}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Button component="label" variant="outlined" startIcon={uploadingSlip ? <CircularProgress size={18} /> : <CloudUploadIcon />} disabled={uploadingSlip}>
                    แนบสลิป
                    <input type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleSlipUpload} />
                  </Button>
                  {formData.slipUrl && (
                    <>
                      <Button startIcon={<InsertPhotoIcon />} onClick={() => handleOpenSlip(formData.slipUrl)}>ดูสลิป</Button>
                      <Tooltip title="นำสลิปออก"><IconButton aria-label="นำสลิปออก" onClick={() => setFormData((current) => ({ ...current, slipUrl: '' }))}><CloseIcon /></IconButton></Tooltip>
                    </>
                  )}
                </Stack>
              </Grid>
              {dialogError && <Grid item xs={12}><Alert severity="error">{dialogError}</Alert></Grid>}
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}><Button onClick={() => setOpenDialog(false)} color="inherit">ยกเลิก</Button><Button onClick={handleSave} variant="contained" color="success" disabled={uploadingSlip}>บันทึก</Button></DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}
