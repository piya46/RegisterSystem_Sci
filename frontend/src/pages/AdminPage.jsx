// frontend/src/pages/AdminPage.jsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Box, Typography, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Chip,
  CircularProgress, Stack, Tooltip, Avatar, LinearProgress, Alert, Fade, Checkbox
} from "@mui/material";
import Grid from "@mui/material/GridLegacy";
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
import HistoryIcon from "@mui/icons-material/History";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import ViewModuleIcon from "@mui/icons-material/ViewModule";

import useAuth from "../hooks/useAuth";
import * as api from "../utils/api";
import AdminUserDialog from "../components/AdminUserDialog";
import AdminPasswordDialog from "../components/AdminPasswordDialog";
import AdminGenerateLinkDialog from "../components/AdminGenerateLinkDialog";
import { useNavigate } from "react-router";

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
const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const StyledCard = styled(Card)(() => ({
  borderRadius: 24,
  background: Y.glass,
  backdropFilter: "blur(20px)",
  boxShadow: "0 8px 32px rgba(255, 193, 7, 0.15)",
  border: `1px solid ${Y.border}`,
  overflow: "hidden"
}));

const StatCard = styled(Box)(({ theme }) => ({
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

const entityId = (value) => String(value?._id || value?.id || value || "");

const AUTO_REFRESH_SEC = 10;

export default function AdminPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [refreshCountdown, setRefreshCountdown] = useState(AUTO_REFRESH_SEC);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null);

  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrTargetAdmins, setQrTargetAdmins] = useState([]); // 🌟 เปลี่ยนเป็นเก็บ Array ของ Admin

  // 🌟 State สำหรับการเลือก Checkbox
  const [selectedAdmins, setSelectedAdmins] = useState([]);

  const intervalRef = useRef(null);
  const navigate = useNavigate();
  const [pointsList, setPointsList] = useState([]);
  const [eventCatalog, setEventCatalog] = useState({ organizations: [], events: [] });

  const fetchAdmins = useCallback(() => {
    if (!user) return;
    setFetching(true);
    api.listAdmins()
      .then(res => setAdmins(res.data || []))
      .catch(() => setAdmins([]))
      .finally(() => setFetching(false));
    setRefreshCountdown(AUTO_REFRESH_SEC);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.listRegistrationPoints(),
      api.getEventCatalog(),
    ])
      .then(([pointsRes, catalogRes]) => {
        setPointsList(pointsRes.data || pointsRes || []);
        const data = catalogRes.data?.data || {};
        setEventCatalog({
          organizations: data.organizations || [],
          events: data.events || [],
        });
      })
      .catch(err => console.error("Load access catalog failed", err));
  }, [user]);

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
    await api.deleteAdmin(id);
    setSelectedAdmins(prev => prev.filter(adminId => adminId !== id)); // ลบออกจากรายการที่เลือกด้วย
    fetchAdmins();
  };

  const handleOpenAdd = () => { setEditData(null); setDialogOpen(true); };
  const handleOpenEdit = (admin) => { setEditData(admin); setDialogOpen(true); };

  const handleDialogSave = async (data) => {
    if (editData) await api.updateAdmin(editData._id, data);
    else await api.createAdmin(data);
    setDialogOpen(false);
    fetchAdmins();
  };

  const openPasswordDialog = (admin) => {
    setPasswordTarget(admin);
    setPasswordDialogOpen(true);
  };

  // 🌟 ฟังก์ชันจัดการ Checkbox
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedAdmins(admins.map(a => a._id));
    } else {
      setSelectedAdmins([]);
    }
  };

  const handleSelectOne = (e, id) => {
    if (e.target.checked) {
      setSelectedAdmins(prev => [...prev, id]);
    } else {
      setSelectedAdmins(prev => prev.filter(item => item !== id));
    }
  };

  // 🌟 ฟังก์ชันเปิดหน้าต่าง QR (รองรับทั้งเดี่ยวและกลุ่ม)
  const openQrDialog = (adminArray) => {
    setQrTargetAdmins(adminArray);
    setQrDialogOpen(true);
  };

  const userRoles = Array.isArray(user?.role) ? user.role : [user?.role].filter(Boolean);
  const canManageSystemRoles = userRoles.includes("superadmin");
  const canEdit = !!user && (canManageSystemRoles || userRoles.includes("admin"));
  const progressValue = (1 - (refreshCountdown - 1) / (AUTO_REFRESH_SEC - 1)) * 100;
  const organizationsById = useMemo(
    () => Object.fromEntries((eventCatalog.organizations || []).map((item) => [entityId(item), item])),
    [eventCatalog.organizations]
  );
  const eventsById = useMemo(
    () => Object.fromEntries((eventCatalog.events || []).map((item) => [entityId(item), item])),
    [eventCatalog.events]
  );

  const renderAccessScope = (admin) => {
    const roles = Array.isArray(admin.role) ? admin.role : [admin.role].filter(Boolean);
    if (roles.some((role) => ["superadmin", "admin"].includes(role))) {
      return <Chip size="small" color="warning" variant="outlined" label="ทุกระบบ" sx={{ mt: 0.75, fontWeight: 800 }} />;
    }
    const orgIds = (admin.organizationIds || []).map(entityId).filter(Boolean);
    const eventIds = (admin.eventIds || []).map(entityId).filter(Boolean);
    if (orgIds.length > 0) {
      return (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mt={0.75}>
          {orgIds.slice(0, 2).map((id) => <Chip key={id} size="small" label={organizationsById[id]?.name || "หน่วยงาน"} />)}
          {orgIds.length > 2 && <Chip size="small" label={`+${orgIds.length - 2}`} />}
        </Stack>
      );
    }
    if (eventIds.length > 0) {
      return (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mt={0.75}>
          {eventIds.slice(0, 2).map((id) => {
            const event = eventsById[id];
            return <Chip key={id} size="small" color="info" variant="outlined" label={event ? `${event.name} ${event.eventYear || ""}` : "รอบกิจกรรม"} />;
          })}
          {eventIds.length > 2 && <Chip size="small" label={`+${eventIds.length - 2}`} />}
        </Stack>
      );
    }
    return <Chip size="small" color="error" variant="outlined" label="ยังไม่กำหนด scope" sx={{ mt: 0.75, fontWeight: 800 }} />;
  };

  return (
    <Box sx={{
      minHeight: "calc(100vh - 68px)",
      background: "#f6f8fb",
      py: { xs: 3, md: 4 }, px: 2
    }}>
      <Box sx={{ maxWidth: 1100, mx: "auto" }}>

        {/* Header Section */}
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" mb={4} spacing={2}>
          <Box>
            <Stack direction="row" alignItems="center" spacing={1.5} mb={0.5}>
              <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate("/dashboard")}
                sx={{ color: Y.text, fontWeight: 800, borderRadius: 2, "&:hover": { bgcolor: "#fff8e1" } }}
              >
                ภาพรวม
              </Button>
              <Typography variant="h4" fontWeight={800} sx={{ color: Y.text }}>
                System Admins
              </Typography>
            </Stack>
            <Typography variant="body1" color="text.secondary" sx={{ ml: { sm: 1 } }}>
              จัดการบัญชีผู้ดูแลระบบและกำหนดสิทธิ์การเข้าถึง
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<HistoryIcon />}
            onClick={() => navigate("/admin/sessions")}
            sx={{
              color: "#6d4c41",
              borderColor: "#6d4c41",
              borderRadius: 3,
              fontWeight: 700
            }}
          >
            จัดการ Sessions
          </Button>

          {canEdit && (
            <Stack direction="row" spacing={1}>
              {/* 🌟 ปุ่มสร้าง QR แบบกลุ่ม จะโผล่มาเมื่อมีการเลือก Checkbox */}
              {selectedAdmins.length > 0 && (
                 <Button
                    variant="contained"
                    color="info"
                    startIcon={<ViewModuleIcon />}
                    onClick={() => {
                        const selectedObjects = admins.filter(a => selectedAdmins.includes(a._id));
                        openQrDialog(selectedObjects);
                    }}
                    sx={{
                      fontWeight: 800, borderRadius: 3,
                      boxShadow: "0 8px 20px rgba(2, 136, 209, 0.3)",
                    }}
                 >
                   สร้าง QR แบบกลุ่ม ({selectedAdmins.length})
                 </Button>
              )}

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
            </Stack>
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
                    {/* 🌟 หัวตาราง Checkbox */}
                    {canEdit && (
                       <TableCell padding="checkbox">
                         <Checkbox
                           color="primary"
                           indeterminate={selectedAdmins.length > 0 && selectedAdmins.length < admins.length}
                           checked={admins.length > 0 && selectedAdmins.length === admins.length}
                           onChange={handleSelectAll}
                         />
                       </TableCell>
                    )}
                    <TableCell sx={{ fontWeight: 800, color: Y.text }}>ผู้ใช้งาน (User)</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: Y.text }}>อีเมล</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: Y.text }}>สิทธิ์ (Role)</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, color: Y.text, width: 160 }}>เครื่องมือ</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fetching && admins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 5 : 4} align="center" sx={{ py: 6 }}>
                        <CircularProgress sx={{ color: Y.main }} />
                      </TableCell>
                    </TableRow>
                  ) : admins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 5 : 4} align="center" sx={{ py: 6 }}>
                        <Alert severity="info" sx={{ display: 'inline-flex', borderRadius: 3 }}>
                          ไม่พบข้อมูลผู้ดูแลระบบ
                        </Alert>
                      </TableCell>
                    </TableRow>
                  ) : (
                    admins.map((admin) => {
                      const isSelf = admin._id === user?._id || admin.id === user?.id;
                      if (!canEdit && !isSelf) return null;
                      const isItemSelected = selectedAdmins.includes(admin._id);

                      return (
                        <TableRow
                          key={admin._id}
                          hover
                          selected={isItemSelected}
                          sx={{ "&:hover": { backgroundColor: "#FFF8E1" }, transition: "background-color 0.2s" }}
                        >
                          {/* 🌟 Checkbox รายคน */}
                          {canEdit && (
                            <TableCell padding="checkbox">
                              <Checkbox color="primary" checked={isItemSelected} onChange={(e) => handleSelectOne(e, admin._id)} />
                            </TableCell>
                          )}

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
                                <Chip label={admin.role} size="small" />
                              )}
                            {renderAccessScope(admin)}
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
                                <Tooltip title="สร้าง QR ให้สตาฟ (Self-Register)">
                                  <IconButton
                                    size="small"
                                    onClick={() => openQrDialog([admin])} // 🌟 ส่งเป็น Array เสมอ
                                    sx={{ color: '#FF9800', bgcolor: '#FFF3E0', '&:hover': { bgcolor: '#FFE0B2' } }}
                                  >
                                    <QrCode2Icon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}

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

      <AdminUserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleDialogSave}
        initialData={editData}
        isEdit={!!editData}
        pointsList={pointsList}
        eventCatalog={eventCatalog}
        canManageSystemRoles={canManageSystemRoles}
      />

      <AdminPasswordDialog
        open={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
        onSuccess={fetchAdmins}
        isSelf={passwordTarget?._id === user?._id || passwordTarget?.id === user?.id}
        user={passwordTarget}
      />

      <AdminGenerateLinkDialog
        open={qrDialogOpen}
        onClose={() => setQrDialogOpen(false)}
        targetAdmins={qrTargetAdmins} // 🌟 เปลี่ยนชื่อ Prop
        pointsList={pointsList}
      />
    </Box>
  );
}
