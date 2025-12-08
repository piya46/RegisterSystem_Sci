// src/pages/AdminPage.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Box, Typography, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Chip,
  CircularProgress, Stack, Tooltip, Avatar, LinearProgress, Alert, Grid, Fade
} from "@mui/material";
import { styled, keyframes } from "@mui/material/styles";

// Icons
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/PersonAdd";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import SecurityIcon from "@mui/icons-material/Security";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import SupervisorAccountIcon from "@mui/icons-material/SupervisorAccount";

import useAuth from "../hooks/useAuth";
import * as api from "../utils/api";
import AdminUserDialog from "../components/AdminUserDialog";
import AdminPasswordDialog from "../components/AdminPasswordDialog";
import { useNavigate } from "react-router-dom";

/* ---------- Premium Gold Theme ---------- */
const Y = {
  main: "#FFC107",      // Primary Gold
  dark: "#F57F17",      // Dark Gold
  light: "#FFF8E1",     // Light Cream
  glass: "rgba(255, 255, 255, 0.85)", // Glass effect
  text: "#4E342E",      // Dark Brown
  success: "#2e7d32",
  error: "#d32f2f",
  border: "rgba(255, 193, 7, 0.3)"
};

/* ---------- Animations & Styles ---------- */
const gradientAnimation = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const StyledCard = styled(Card)(({ theme }) => ({
  borderRadius: 24,
  background: Y.glass,
  backdropFilter: "blur(20px)",
  boxShadow: "0 8px 32px rgba(255, 193, 7, 0.15)",
  border: `1px solid ${Y.border}`,
  overflow: "hidden"
}));

const StatCard = styled(Box)(({ theme, color }) => ({
  padding: theme.spacing(2.5),
  borderRadius: 20,
  backgroundColor: "#fff",
  border: `1px solid rgba(0,0,0,0.06)`,
  boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(2),
  transition: "transform 0.2s",
  "&:hover": {
    transform: "translateY(-4px)",
    borderColor: Y.main,
    boxShadow: "0 8px 20px rgba(255, 193, 7, 0.2)"
  }
}));

const stringAvatar = (name) => {
  const n = name || "?";
  return { children: n.charAt(0).toUpperCase() };
};

const AUTO_REFRESH_SEC = 10; // ปรับเวลาให้เหมาะสมขึ้น

export default function AdminPage() {
  const { token, user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [refreshCountdown, setRefreshCountdown] = useState(AUTO_REFRESH_SEC);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const intervalRef = useRef(null);
  const navigate = useNavigate();

  const fetchAdmins = useCallback(() => {
    if (!token) return;
    setFetching(true);
    api.listAdmins(token)
      .then(res => setAdmins(res.data || []))
      .catch(() => setAdmins([]))
      .finally(() => setFetching(false));
    setRefreshCountdown(AUTO_REFRESH_SEC);
  }, [token]);

  useEffect(() => {
    fetchAdmins();
    intervalRef.current = setInterval(() => {
      setRefreshCountdown(prev => {
        if (prev <= 1) {
          fetchAdmins();
          return AUTO_REFRESH_SEC;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [fetchAdmins]);

  const handleManualRefresh = () => {
    fetchAdmins();
    setRefreshCountdown(AUTO_REFRESH_SEC);
  };

  const handleDelete = async (id) => {
    if (id === user?.id || id === user?._id) {
      alert("ไม่สามารถลบผู้ใช้ของตนเองได้");
      return;
    }
    if (!window.confirm("ยืนยันการลบผู้ใช้นี้?")) return;
    await api.deleteAdmin(id, token);
    fetchAdmins();
  };

  const handleOpenAdd  = () => { setEditData(null); setDialogOpen(true); };
  const handleOpenEdit = (admin) => { setEditData(admin); setDialogOpen(true); };

  const handleDialogSave = async (data) => {
    if (editData) await api.updateAdmin(editData._id, data, token);
    else          await api.createAdmin(data, token);
    setDialogOpen(false);
    fetchAdmins();
  };

  // ---- Reset/Change Password ----
  const openPasswordDialog = (admin) => {
    setPasswordTarget(admin);
    setPasswordDialogOpen(true);
  };

  const handlePasswordSave = async (newPassword) => {
    if (!passwordTarget) return;
    const isSelf = (passwordTarget._id === user?._id) || (passwordTarget.id === user?.id);
    if (isSelf) {
      await api.changePassword({ password: newPassword }, token);
      alert("เปลี่ยนรหัสผ่านของคุณสำเร็จ");
    } else {
      await api.resetPassword({ userId: passwordTarget._id, newPassword }, token);
      alert("รีเซ็ตรหัสผ่านสำเร็จ และส่งอีเมลแจ้งผู้ใช้แล้ว");
    }
    setPasswordDialogOpen(false);
  };

  const canEdit = !!user && (Array.isArray(user.role) ? user.role.includes("admin") : user.role === "admin");
  const progressValue = (1 - (refreshCountdown - 1) / (AUTO_REFRESH_SEC - 1)) * 100;

  return (
    <Box sx={{
      minHeight: "100vh",
      background: "linear-gradient(-45deg, #FFECB3, #FFF8E1, #FFD54F, #FFF3E0)",
      backgroundSize: "400% 400%",
      animation: `${gradientAnimation} 15s ease infinite`,
      py: { xs: 3, md: 5 }, px: 2
    }}>
      <Box sx={{ maxWidth: 1100, mx: "auto" }}>
        
        {/* Header Section */}
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" mb={4} spacing={2}>
          <Box>
            <Stack direction="row" alignItems="center" spacing={1.5} mb={0.5}>
              <Button 
                startIcon={<ArrowBackIcon />} 
                onClick={() => navigate("/dashboard")}
                sx={{ color: Y.text, fontWeight: 700, borderRadius: 3, "&:hover": { bgcolor: "rgba(255,255,255,0.5)" } }}
              >
                Back
              </Button>
              <Typography variant="h4" fontWeight={800} sx={{ color: Y.text }}>
                System Admins
              </Typography>
            </Stack>
            <Typography variant="body1" color="text.secondary" sx={{ ml: {sm: 1} }}>
              จัดการบัญชีผู้ดูแลระบบและกำหนดสิทธิ์การเข้าถึง
            </Typography>
          </Box>

          {canEdit && (
             <Button
               variant="contained"
               startIcon={<AddIcon />}
               onClick={handleOpenAdd}
               sx={{
                 bgcolor: Y.main, color: "#000", fontWeight: 800,
                 px: 3, py: 1.2, borderRadius: 3,
                 boxShadow: "0 8px 20px rgba(255, 193, 7, 0.4)",
                 ":hover": { bgcolor: Y.dark, color: "#fff", transform: "translateY(-2px)" },
                 transition: "all 0.2s"
               }}
             >
               เพิ่มผู้ดูแล
             </Button>
          )}
        </Stack>

        {/* Stats Section */}
        <Grid container spacing={2} mb={3}>
           <Grid item xs={12} sm={6}>
              <StatCard>
                 <Avatar sx={{ bgcolor: Y.light, color: Y.dark, width: 56, height: 56 }}>
                    <SupervisorAccountIcon fontSize="large" />
                 </Avatar>
                 <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                       ผู้ดูแลทั้งหมด
                    </Typography>
                    <Typography variant="h4" fontWeight={900} color={Y.text}>
                       {admins.length}
                    </Typography>
                 </Box>
              </StatCard>
           </Grid>
           <Grid item xs={12} sm={6}>
              <StatCard>
                 <Avatar sx={{ bgcolor: "#E8F5E9", color: Y.success, width: 56, height: 56 }}>
                    <VerifiedUserIcon fontSize="large" />
                 </Avatar>
                 <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                       บัญชีของคุณ
                    </Typography>
                    <Typography variant="h6" fontWeight={800} color={Y.success}>
                       {user?.username || "Active"}
                    </Typography>
                 </Box>
              </StatCard>
           </Grid>
        </Grid>

        {/* Main Content Card */}
        <StyledCard>
          <Box sx={{ position: 'relative', height: 4 }}>
             {/* Subtle Loading Bar */}
             <LinearProgress
                variant="determinate"
                value={progressValue}
                sx={{
                  height: 4, bgcolor: "transparent",
                  "& .MuiLinearProgress-bar": { bgcolor: Y.main }
                }}
             />
          </Box>

          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            {/* Toolbar */}
            <Stack direction="row" justifyContent="flex-end" alignItems="center" mb={2}>
                <Tooltip title="รีเฟรชข้อมูล">
                  <Button
                    size="small"
                    startIcon={<RefreshIcon sx={{ animation: fetching ? `${spin} 1s infinite linear` : 'none' }} />}
                    onClick={handleManualRefresh}
                    sx={{ color: Y.text, borderRadius: 2, textTransform: 'none' }}
                  >
                    Auto-refresh in {refreshCountdown}s
                  </Button>
                </Tooltip>
            </Stack>

            {/* Table */}
            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 3, border: "1px solid #eee" }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: Y.light }}>
                    <TableCell sx={{ fontWeight: 800, color: Y.text }}>ผู้ใช้งาน (User)</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: Y.text }}>อีเมล</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: Y.text }}>สิทธิ์ (Role)</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, color: Y.text, width: 160 }}>เครื่องมือ</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fetching && admins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                        <CircularProgress sx={{ color: Y.main }} />
                      </TableCell>
                    </TableRow>
                  ) : admins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                        <Alert severity="info" sx={{ display: 'inline-flex', borderRadius: 3 }}>
                           ไม่พบข้อมูลผู้ดูแลระบบ
                        </Alert>
                      </TableCell>
                    </TableRow>
                  ) : (
                    admins.map((admin) => {
                      const isSelf = admin._id === user?._id || admin.id === user?.id;
                      // Logic: ถ้าไม่ใช่ admin ใหญ่ (canEdit) ให้เห็นแค่ตัวเอง
                      if (!canEdit && !isSelf) return null;

                      return (
                        <TableRow
                          key={admin._id}
                          hover
                          sx={{ 
                             "&:hover": { backgroundColor: "#FFF8E1" },
                             transition: "background-color 0.2s"
                          }}
                        >
                          <TableCell>
                             <Stack direction="row" alignItems="center" spacing={2}>
                                <Avatar {...stringAvatar(admin.fullName || admin.username)} sx={{ bgcolor: isSelf ? Y.main : "#bdbdbd", fontWeight: 700 }} />
                                <Box>
                                   <Typography variant="body1" fontWeight={700} color={Y.text}>
                                      {admin.fullName || admin.username}
                                      {isSelf && <Chip label="Me" size="small" sx={{ ml: 1, height: 20, fontSize: 10, bgcolor: Y.light, color: Y.dark, fontWeight: 800 }} />}
                                   </Typography>
                                   <Typography variant="caption" color="text.secondary">
                                      @{admin.username}
                                   </Typography>
                                </Box>
                             </Stack>
                          </TableCell>
                          
                          <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                             {admin.email || "-"}
                          </TableCell>

                          <TableCell>
                            {Array.isArray(admin.role)
                              ? admin.role.map((r) => (
                                  <Chip
                                    key={r}
                                    icon={<SecurityIcon style={{ fontSize: 16 }} />}
                                    label={r.toUpperCase()}
                                    size="small"
                                    sx={{
                                      mr: 0.5,
                                      bgcolor: r === "admin" ? "rgba(255, 193, 7, 0.2)" : "#f5f5f5",
                                      color: r === "admin" ? "#b38f00" : "text.secondary",
                                      fontWeight: 700,
                                      border: "1px solid transparent",
                                      borderColor: r === "admin" ? Y.main : "transparent"
                                    }}
                                  />
                                ))
                              : (
                                <Chip
                                  label={admin.role}
                                  size="small"
                                />
                              )}
                          </TableCell>

                          <TableCell align="center">
                            <Stack direction="row" justifyContent="center" spacing={1}>
                               {canEdit && (
                                  <Tooltip title="แก้ไข">
                                    <IconButton size="small" onClick={() => handleOpenEdit(admin)} sx={{ color: 'primary.main', bgcolor: '#e3f2fd', '&:hover': { bgcolor: '#bbdefb' } }}>
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                               )}
                               
                               <Tooltip title={isSelf ? "เปลี่ยนรหัสผ่าน" : "รีเซ็ตรหัสผ่าน"}>
                                 <IconButton 
                                    size="small" 
                                    onClick={() => openPasswordDialog(admin)} 
                                    disabled={!canEdit && !isSelf}
                                    sx={{ color: Y.dark, bgcolor: Y.light, '&:hover': { bgcolor: '#ffe082' } }}
                                 >
                                   <VpnKeyIcon fontSize="small" />
                                 </IconButton>
                               </Tooltip>

                               {canEdit && (
                                  <Tooltip title="ลบผู้ใช้">
                                    <span>
                                      <IconButton
                                        size="small"
                                        onClick={() => handleDelete(admin._id)}
                                        disabled={isSelf}
                                        sx={{ color: 'error.main', bgcolor: '#ffebee', '&:hover': { bgcolor: '#ffcdd2' }, opacity: isSelf ? 0.5 : 1 }}
                                      >
                                        <DeleteIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                               )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </StyledCard>
      </Box>

      {/* Dialog เพิ่ม/แก้ไข user */}
      <AdminUserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleDialogSave}
        initialData={editData}
        isEdit={!!editData}
      />
      
      {/* Dialog เปลี่ยน/รีเซ็ตรหัสผ่าน */}
      <AdminPasswordDialog
        open={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
        onSave={handlePasswordSave}
        isSelf={passwordTarget?._id === user?._id || passwordTarget?.id === user?.id}
        user={passwordTarget}
      />
    </Box>
  );
}