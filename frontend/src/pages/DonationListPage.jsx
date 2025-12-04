// frontend/src/pages/DonationListPage.jsx
import React, { useEffect, useState } from 'react';
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, Button, IconButton, Typography, Stack, Chip, InputAdornment, LinearProgress,
  Card, CardContent
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { getDonationSummary } from '../utils/api';
import useAuth from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export default function DonationListPage() {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
    } catch (err) {
      console.error("Failed to fetch donations", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredDonations = donations.filter((d) => {
    const query = search.toLowerCase();
    const fullName = `${d.firstName} ${d.lastName}`.toLowerCase();
    return fullName.includes(query) || (d.amount && d.amount.toString().includes(query));
  });

  const exportExcel = () => {
    const dataToExport = filteredDonations.map(d => ({
      'วันที่โอน': new Date(d.transferDateTime).toLocaleString('th-TH'),
      'ชื่อ-นามสกุล': `${d.firstName} ${d.lastName}`,
      'ยอดเงิน': d.amount,
      'ช่องทาง': d.source === 'PRE_REGISTER' ? 'ลงทะเบียน' : d.source,
      'บันทึกเมื่อ': new Date(d.createdAt).toLocaleString('th-TH'),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Donations");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, `Donation_List_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5", p: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1100, mx: "auto" }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" spacing={2} sx={{ mb: 3 }}>
          <IconButton onClick={() => navigate('/dashboard')} sx={{ bgcolor: '#fff', boxShadow: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#2e7d32' }}>
              <VolunteerActivismIcon /> รายชื่อผู้ร่วมสนับสนุน (Donations)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              รายการโอนเงินสนับสนุนทั้งหมด
            </Typography>
          </Box>
          <Button variant="contained" color="success" startIcon={<DownloadIcon />} onClick={exportExcel} sx={{ borderRadius: 2, fontWeight: 700 }}>
            Export Excel
          </Button>
        </Stack>

        <Card sx={{ mb: 3, borderRadius: 3, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
          <CardContent>
            <TextField
              fullWidth
              placeholder="ค้นหาชื่อ หรือ ยอดเงิน..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>
                ),
              }}
              size="small"
              sx={{ bgcolor: '#fff' }}
            />
          </CardContent>
        </Card>

        <TableContainer component={Paper} sx={{ borderRadius: 3, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", overflow: 'hidden' }}>
          {loading && <LinearProgress color="success" />}
          <Table stickyHeader>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 'bold', bgcolor: '#e8f5e9', color: '#1b5e20' } }}>
                <TableCell width="20%">เวลาที่โอน</TableCell>
                <TableCell width="30%">ชื่อผู้บริจาค</TableCell>
                <TableCell width="20%" align="right">ยอดเงิน (บาท)</TableCell>
                <TableCell width="15%" align="center">ช่องทาง</TableCell>
                <TableCell width="15%" align="right">วันที่บันทึก</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDonations.length > 0 ? (
                filteredDonations.map((row) => (
                  <TableRow key={row._id} hover>
                    <TableCell>{new Date(row.transferDateTime).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>{row.firstName} {row.lastName}</TableCell>
                    <TableCell align="right" sx={{ color: '#2e7d32', fontWeight: 'bold' }}>
                      {row.amount.toLocaleString()}
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={row.source === 'PRE_REGISTER' ? 'ลงทะเบียน' : row.source} size="small" color="success" variant="outlined" />
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                      {new Date(row.createdAt).toLocaleDateString('th-TH')}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    {!loading && "ไม่พบข้อมูลรายการบริจาค"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        <Box sx={{ mt: 2, textAlign: 'right' }}>
          <Typography variant="body2" color="text.secondary">
            รวมทั้งหมด {filteredDonations.length} รายการ | ยอดรวม: {filteredDonations.reduce((s, c) => s + c.amount, 0).toLocaleString()} บาท
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}