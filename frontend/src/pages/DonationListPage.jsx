// frontend/src/pages/DonationListPage.jsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, Button, IconButton, Typography, Stack, Chip, InputAdornment, LinearProgress,
  Card, CardContent, Grid
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import PaymentsIcon from '@mui/icons-material/Payments';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import * as XLSX from 'xlsx';
import { getDonationSummary } from '../utils/api';
import useAuth from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export default function DonationListPage() {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [apiStats, setApiStats] = useState({ totalAmount: 0, totalCount: 0 });
  
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDonations();
  }, [token]);

  const fetchDonations = async () => {
    setLoading(true);
    try {
      const res = await getDonationSummary(token);
      setDonations(res.data?.transactions || []);
      if (res.data?.stats) {
        setApiStats(res.data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch donations", err);
    } finally {
      setLoading(false);
    }
  };

  // Helper Formatter
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getPackageDisplay = (d) => {
    if (!d.isPackage) return null;
    let name = d.packageType || 'แพ็กเกจไม่ระบุชื่อ';
    if (d.size) name += ` (Size: ${d.size})`;
    return name;
  };

  const filteredDonations = useMemo(() => {
    return donations.filter((d) => {
      const query = search.toLowerCase();
      const fullName = `${d.firstName || ''} ${d.lastName || ''}`.toLowerCase();
      const amountStr = d.amount ? d.amount.toString() : '';
      const pkgName = (d.packageType || '').toLowerCase();
      return fullName.includes(query) || amountStr.includes(query) || pkgName.includes(query);
    });
  }, [donations, search]);

  const displayTotalAmount = filteredDonations.reduce((sum, item) => sum + (item.amount || 0), 0);
  const displayTotalCount = filteredDonations.length;

  const exportExcel = () => {
    if (filteredDonations.length === 0) return alert("ไม่พบข้อมูลที่จะส่งออก");
    const dataToExport = filteredDonations.map((d, index) => ({
        'ลำดับ': index + 1,
        'วันที่โอน': formatDate(d.transferDateTime),
        'ชื่อ-นามสกุล': `${d.firstName || ''} ${d.lastName || ''}`.trim(),
        'ประเภท': d.isPackage ? 'ซื้อแพ็กเกจ' : 'บริจาค',
        'รายละเอียด': getPackageDisplay(d) || '-',
        'ยอดเงิน': d.amount || 0,
        'ช่องทาง': d.source === 'PRE_REGISTER' ? 'ลงทะเบียน' : d.source,
        'บันทึกเมื่อ': formatDate(d.createdAt)
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Donations");
    XLSX.writeFile(workbook, `Donations_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5", p: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1200, mx: "auto" }}>
        
        {/* Header */}
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" spacing={2} sx={{ mb: 3 }}>
          <IconButton onClick={() => navigate('/dashboard')} sx={{ bgcolor: '#fff' }}><ArrowBackIcon /></IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight="bold" sx={{ color: '#2e7d32', display: 'flex', alignItems: 'center', gap: 1 }}>
              <VolunteerActivismIcon /> รายการสนับสนุน (Donations)
            </Typography>
            <Typography variant="body2" color="text.secondary">ตรวจสอบรายการโอนเงินและแพ็กเกจของที่ระลึก</Typography>
          </Box>
          <Button variant="contained" color="success" startIcon={<DownloadIcon />} onClick={exportExcel} sx={{ borderRadius: 2 }}>
            Export Excel
          </Button>
        </Stack>

        {/* Stats Cards */}
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
                  <Typography variant="h4" fontWeight={800}>{displayTotalCount.toLocaleString()} <Typography component="span" variant="body2" color="text.secondary">รายการ</Typography></Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Search */}
        <TextField
          fullWidth placeholder="ค้นหาชื่อ, แพ็กเกจ, ยอดเงิน..." value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment> }}
          size="small" sx={{ mb: 3, bgcolor: '#fff', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />

        {/* Table */}
        <TableContainer component={Paper} sx={{ borderRadius: 3, boxShadow: "0 4px 20px rgba(0,0,0,0.04)", overflow: 'hidden' }}>
          {loading && <LinearProgress color="success" />}
          <Table stickyHeader>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 'bold', bgcolor: '#f1f8e9', color: '#33691e', whiteSpace: 'nowrap' } }}>
                <TableCell width="5%" align="center">#</TableCell>
                <TableCell width="12%">เวลาที่โอน</TableCell>
                <TableCell width="15%">ชื่อผู้สนับสนุน</TableCell>
                <TableCell width="40%">รายการ</TableCell> {/* ให้พื้นที่เยอะสุด */}
                <TableCell width="10%" align="right">ยอดเงิน</TableCell>
                <TableCell width="10%" align="center">ช่องทาง</TableCell>
                <TableCell width="8%" align="right">บันทึกเมื่อ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDonations.length > 0 ? (
                filteredDonations.map((row, index) => {
                  const pkgDisplay = getPackageDisplay(row);
                  return (
                    <TableRow key={row._id || index} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      <TableCell align="center" sx={{ color: 'text.secondary' }}>{index + 1}</TableCell>
                      
                      {/* เวลาที่โอน */}
                      <TableCell sx={{ fontSize: '0.9rem' }}>
                        <Stack>
                           <Typography variant="body2" fontWeight={500}>{formatDate(row.transferDateTime).split(' ')[0]} {formatDate(row.transferDateTime).split(' ')[1]} {formatDate(row.transferDateTime).split(' ')[2]}</Typography>
                           <Typography variant="caption" color="text.secondary">{formatDate(row.transferDateTime).split(' ')[3]}</Typography>
                        </Stack>
                      </TableCell>

                      <TableCell sx={{ fontWeight: 600 }}>{row.firstName} {row.lastName}</TableCell>
                      
                      {/* รายการ (Chip แบบ Multiline) */}
                      <TableCell>
                        {pkgDisplay ? (
                          <Chip 
                            icon={<CardGiftcardIcon style={{ fontSize: 16 }} />} 
                            label={pkgDisplay} 
                            size="small" 
                            sx={{ 
                              bgcolor: '#fff3e0', color: '#e65100', border: '1px solid #ffe0b2',
                              height: 'auto', 
                              '& .MuiChip-label': { 
                                display: 'block', 
                                whiteSpace: 'normal', 
                                py: 1, 
                                lineHeight: 1.4,
                                textAlign: 'left'
                              },
                              '& .MuiChip-icon': { alignSelf: 'flex-start', mt: 1, ml: 1 }
                            }} 
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">-</Typography>
                        )}
                      </TableCell>

                      <TableCell align="right" sx={{ color: '#2e7d32', fontWeight: 800 }}>+{row.amount?.toLocaleString()}</TableCell>
                      
                      {/* ช่องทาง (Outline Green Chip) */}
                      <TableCell align="center">
                        <Chip 
                          label={row.source === 'PRE_REGISTER' ? 'ลงทะเบียน' : row.source} 
                          size="small" 
                          variant="outlined"
                          color="success" // จะได้ขอบเขียว ตัวหนังสือเขียว
                          sx={{ fontWeight: 600, bgcolor: 'transparent' }}
                        />
                      </TableCell>
                      
                      <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                         {new Date(row.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>ไม่พบข้อมูล</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}