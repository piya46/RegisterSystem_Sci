import React, { useEffect, useState } from 'react';
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField, Button,
  IconButton, Tooltip, CircularProgress, Typography, MenuItem, Select, InputLabel, FormControl, Stack, Chip, Snackbar, Alert
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';
import DownloadIcon from '@mui/icons-material/Download';
import EmailIcon from '@mui/icons-material/Email';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { listParticipants, deleteParticipant, updateParticipant, resendTicket } from '../utils/api';

function AdminParticipantsPage() {
  const [participants, setParticipants] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [resendLoadingId, setResendLoadingId] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

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

  // สร้างรายการภาควิชาและปีการศึกษาแบบไม่ซ้ำ
  const uniqueDepts = Array.from(new Set(participants.map(p => p.fields.dept).filter(Boolean)));
  const uniqueYears = Array.from(new Set(participants.map(p => p.fields.date_year).filter(Boolean)));

  // กรองข้อมูลแบบหลายเงื่อนไข
  const filteredParticipants = participants.filter(p => {
    const matchSearch = (p.fields.name || '').toLowerCase().includes(search.toLowerCase())
      || (p.fields.phone || '').includes(search);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchDept = deptFilter === 'all' || p.fields.dept === deptFilter;
    const matchYear = yearFilter === 'all' || p.fields.date_year === yearFilter;
    return matchSearch && matchStatus && matchDept && matchYear;
  });

  // ฟังก์ชันแปลงวันที่เช็คอินให้อ่านง่าย
  const formatCheckinDate = (dateString) => {
    if (!dateString) return '-';
    const options = {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    };
    return new Date(dateString).toLocaleString('th-TH', options);
  };

  // ลบข้อมูล
  const handleDelete = async (id) => {
    if (!window.confirm('ยืนยันการลบผู้เข้าร่วม?')) return;
    try {
      await deleteParticipant(id, token);
      setSnackbar({ open: true, message: 'ลบสำเร็จ', severity: 'success' });
      fetchParticipants();
    } catch {
      setSnackbar({ open: true, message: 'ลบไม่สำเร็จ', severity: 'error' });
    }
  };

  // เริ่มแก้ไข
  const startEdit = (participant) => {
    setEditId(participant._id);
    setEditFields({ ...participant.fields });
  };

  // บันทึกแก้ไข
  const saveEdit = async () => {
    try {
      // ส่งเฉพาะ fields!
      await updateParticipant(editId, { fields: editFields }, token);
      setSnackbar({ open: true, message: 'บันทึกสำเร็จ', severity: 'success' });
      setEditId(null);
      fetchParticipants();
    } catch {
      setSnackbar({ open: true, message: 'บันทึกไม่สำเร็จ', severity: 'error' });
    }
  };

  // เปลี่ยนค่าในฟอร์มแก้ไข
  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFields(f => ({ ...f, [name]: value }));
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
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, "Participants_Report.xlsx");
  };

  // Resend E-Ticket
  const handleResend = async (participant) => {
    if (!participant.fields.phone) {
      setSnackbar({ open: true, message: 'ไม่พบเบอร์โทรผู้เข้าร่วม', severity: 'error' });
      return;
    }
    setResendLoadingId(participant._id);
    try {
      const res = await resendTicket({ phone: participant.fields.phone });
      if (res.data?.sent) {
        setSnackbar({ open: true, message: 'ส่งอีเมล E-Ticket สำเร็จ', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: res.data?.message || 'ไม่สามารถส่งอีเมลได้', severity: 'warning' });
      }
    } catch (err) {
      setSnackbar({ open: true, message: 'ส่งอีเมลล้มเหลว', severity: 'error' });
    }
    setResendLoadingId(null);
  };

  return (
    <Box sx={{
      maxWidth: 1100, mx: 'auto', mt: 4, mb: 8,
      p: { xs: 1, sm: 2, md: 4 },
      fontFamily: 'Prompt, Arial, sans-serif'
    }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', color: '#1677ff', letterSpacing: 1 }}>
        จัดการผู้เข้าร่วม
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }} alignItems="center">
        <TextField
          label="ค้นหาชื่อหรือเบอร์โทร"
          variant="outlined"
          value={search}
          onChange={e => setSearch(e.target.value)}
          sx={{ flexGrow: 1, minWidth: 170 }}
          InputProps={{
            startAdornment: <PersonIcon sx={{ mr: 1, color: '#1976d2' }} />,
          }}
        />

        <FormControl sx={{ minWidth: 140 }}>
          <InputLabel id="status-filter-label">สถานะ</InputLabel>
          <Select
            labelId="status-filter-label"
            label="สถานะ"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <MenuItem value="all">ทั้งหมด</MenuItem>
            <MenuItem value="registered">ลงทะเบียนล่วงหน้า</MenuItem>
            <MenuItem value="checkedIn">เช็คอินแล้ว</MenuItem>
            <MenuItem value="cancelled">ยกเลิก</MenuItem>
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 140 }}>
          <InputLabel id="dept-filter-label">ภาควิชา</InputLabel>
          <Select
            labelId="dept-filter-label"
            label="ภาควิชา"
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
          >
            <MenuItem value="all">ทั้งหมด</MenuItem>
            {uniqueDepts.map(dept => (
              <MenuItem key={dept} value={dept}>{dept}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 140 }}>
          <InputLabel id="year-filter-label">ปีการศึกษา</InputLabel>
          <Select
            labelId="year-filter-label"
            label="ปีการศึกษา"
            value={yearFilter}
            onChange={e => setYearFilter(e.target.value)}
          >
            <MenuItem value="all">ทั้งหมด</MenuItem>
            {uniqueYears.map(year => (
              <MenuItem key={year} value={year}>{year}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          variant="contained"
          color="primary"
          startIcon={<DownloadIcon />}
          onClick={exportExcel}
          sx={{ borderRadius: 2, fontWeight: 700 }}
        >
          Export Excel
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 650, borderRadius: 4, boxShadow: '0 3px 16px #1565c01b' }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ fontWeight: 700 }}>ชื่อ</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>เบอร์โทร</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>สถานะ</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>เวลาเช็คอิน</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>ภาควิชา</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>ปีการศึกษา</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>จัดการ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredParticipants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">ไม่พบข้อมูล</TableCell>
                </TableRow>
              ) : (
                filteredParticipants.map(p => (
                  <TableRow key={p._id} hover>
                    <TableCell align="center">
                      {editId === p._id ? (
                        <TextField
                          name="name"
                          value={editFields.name || ''}
                          onChange={handleEditChange}
                          size="small"
                          fullWidth
                        />
                      ) : (
                        <span style={{ fontWeight: 500 }}>{p.fields.name || '-'}</span>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {editId === p._id ? (
                        <TextField
                          name="phone"
                          value={editFields.phone || ''}
                          onChange={handleEditChange}
                          size="small"
                          fullWidth
                        />
                      ) : (
                        p.fields.phone || '-'
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={
                          p.status === 'checkedIn'
                            ? 'เช็คอินแล้ว'
                            : p.status === 'registered'
                              ? 'ลงทะเบียนล่วงหน้า'
                              : p.status === 'cancelled'
                                ? 'ยกเลิก'
                                : '-'
                        }
                        color={
                          p.status === 'checkedIn' ? 'success'
                            : p.status === 'registered' ? 'primary'
                            : p.status === 'cancelled' ? 'default'
                            : 'default'
                        }
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell align="center">{formatCheckinDate(p.checkedInAt)}</TableCell>
                    <TableCell align="center">
                      {editId === p._id ? (
                        <TextField
                          name="dept"
                          value={editFields.dept || ''}
                          onChange={handleEditChange}
                          size="small"
                          fullWidth
                        />
                      ) : (
                        p.fields.dept || '-'
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {editId === p._id ? (
                        <TextField
                          name="date_year"
                          value={editFields.date_year || ''}
                          onChange={handleEditChange}
                          size="small"
                          fullWidth
                        />
                      ) : (
                        p.fields.date_year || '-'
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {editId === p._id ? (
                        <>
                          <Tooltip title="บันทึก">
                            <IconButton onClick={saveEdit} color="success" size="small">
                              <SaveIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="ยกเลิก">
                            <IconButton onClick={() => setEditId(null)} color="error" size="small">
                              <CancelIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      ) : (
                        <>
                          <Tooltip title="แก้ไข">
                            <IconButton onClick={() => startEdit(p)} size="small">
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="ลบ">
                            <IconButton onClick={() => handleDelete(p._id)} color="error" size="small">
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                          {p.fields.email &&
                            <Tooltip title="Resend E-Ticket (อีเมล)">
                              <span>
                                <IconButton
                                  onClick={() => handleResend(p)}
                                  disabled={resendLoadingId === p._id}
                                  color="info"
                                  size="small"
                                >
                                  {resendLoadingId === p._id ? <CircularProgress size={18} /> : <EmailIcon />}
                                </IconButton>
                              </span>
                            </Tooltip>
                          }
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Snackbar แจ้งเตือน */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={2600}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} sx={{ width: '100%', fontWeight: 600 }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default AdminParticipantsPage;
