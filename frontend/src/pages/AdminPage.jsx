// src/pages/AdminPage.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Box, Typography, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Chip,
  CircularProgress, Stack, Tooltip, Avatar, LinearProgress, Alert
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/PersonAdd";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import useAuth from "../hooks/useAuth";
import * as api from "../utils/api";
import AdminUserDialog from "../components/AdminUserDialog";
import AdminPasswordDialog from "../components/AdminPasswordDialog";
import { useNavigate } from "react-router-dom";

/* ---------- Amber Theme Tokens (match yellow look & feel) ---------- */
const Y = {
  main: "#FFC107",   // amber 500
  dark: "#FFB300",   // amber 600
  light: "#FFE082",  // amber 200
  pale: "#FFF8E1",   // amber 50
  text: "#6B5B00",
  border: "rgba(255,193,7,.35)",
  glow: "0 14px 36px rgba(255,193,7,0.25)"
};

const AUTO_REFRESH_SEC = 5;

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
      background:
        "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), " +
        "radial-gradient(1200px 600px at 120% 110%, #fff3cd 0%, transparent 60%), " +
        "linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)",
      py: { xs: 3, md: 6 }, px: 2
    }}>
      <Card sx={{
        maxWidth: 1000, mx: "auto",
        borderRadius: 4, boxShadow: Y.glow, border: `1px solid ${Y.border}`,
        bgcolor: "#fffefa", overflow: "hidden", position: "relative"
      }}>
        {/* Watermark logo */}
        <Avatar
          src="/logo.svg"
          alt="Logo"
          sx={{
            width: 64, height: 64,
            position: "absolute", right: 14, top: 14,
            bgcolor: "#fff",
            border: `2px solid ${Y.border}`, boxShadow: Y.glow
          }}
        />

        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          {/* Header */}
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate("/dashboard")}
              sx={{
                borderColor: Y.main, color: Y.text, fontWeight: 700,
                ":hover": { borderColor: Y.dark, backgroundColor: Y.pale }
              }}
            >
              กลับหน้าหลัก
            </Button>

            <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, justifyContent: "center" }}>
              <Avatar
                src="/logo.svg"
                alt="Logo"
                sx={{ width: 42, height: 42, border: `2px solid ${Y.border}` }}
              />
              <Typography
                variant="h5"
                fontWeight={900}
                sx={{ letterSpacing: .4, color: Y.text, textAlign: "center" }}
              >
                จัดการผู้ดูแลระบบ
              </Typography>
              <Chip
                label="Admin Only"
                size="small"
                sx={{
                  ml: 1,
                  bgcolor: Y.light, color: "#3E2723", fontWeight: 800,
                  border: `1px solid ${Y.border}`
                }}
              />
            </Stack>

            {canEdit && (
              <Stack direction="row" spacing={1}>
                <Tooltip title="รีเฟรชรายการ">
                  <span>
                    <Button
                      variant="outlined"
                      startIcon={<RefreshIcon />}
                      onClick={handleManualRefresh}
                      disabled={fetching}
                      sx={{
                        borderColor: Y.main, color: Y.text, fontWeight: 700,
                        ":hover": { borderColor: Y.dark, backgroundColor: Y.pale }
                      }}
                    >
                      Refresh
                    </Button>
                  </span>
                </Tooltip>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleOpenAdd}
                  sx={{
                    bgcolor: Y.main, color: "#3E2723", fontWeight: 900,
                    ":hover": { bgcolor: Y.dark }, boxShadow: Y.glow
                  }}
                >
                  เพิ่มผู้ใช้
                </Button>
              </Stack>
            )}
          </Stack>

          {/* Auto refresh indicator */}
          <Stack spacing={0.5} sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: "#7f6b16", textAlign: "right" }}>
              รีเฟรชอัตโนมัติใน <b>{refreshCountdown}</b> วินาที
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progressValue}
              sx={{
                height: 8, borderRadius: 6, bgcolor: Y.pale,
                "& .MuiLinearProgress-bar": { bgcolor: Y.main }
              }}
            />
          </Stack>

          {/* Table */}
          <TableContainer component={Paper} sx={{
            borderRadius: 3, overflow: "hidden",
            border: `1px solid ${Y.border}`
          }}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: Y.pale }}>
                  <TableCell sx={{ fontWeight: 800, color: Y.text }}>ชื่อเข้าใช้</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: Y.text }}>ชื่อ-สกุล</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: Y.text }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: Y.text }}>สิทธิ์</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 800, color: Y.text, width: 180 }}>จัดการ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fetching && admins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                      <CircularProgress sx={{ color: Y.main }} />
                      <Typography sx={{ mt: 1, color: Y.text }}>กำลังโหลด...</Typography>
                    </TableCell>
                  </TableRow>
                ) : admins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Alert severity="info" variant="outlined" sx={{ mx: "auto", maxWidth: 420 }}>
                        ยังไม่มีผู้ดูแลระบบในระบบ — กด “เพิ่มผู้ใช้” เพื่อเริ่มต้น
                      </Alert>
                    </TableCell>
                  </TableRow>
                ) : (
                  admins.map((admin, idx) => {
                    // ถ้าไม่ใช่ admin ให้เห็นเฉพาะบัญชีตัวเอง
                    const isSelf = admin._id === user?._id || admin.id === user?.id;
                    if (!canEdit && !isSelf) return null;

                    return (
                      <TableRow
                        key={admin._id}
                        sx={{
                          "&:nth-of-type(odd)": { bgcolor: "#FFFDF4" },
                          "&:hover": { backgroundColor: "#FFF8E1" }
                        }}
                      >
                        <TableCell sx={{ fontWeight: 600 }}>{admin.username}</TableCell>
                        <TableCell>{admin.fullName || "-"}</TableCell>
                        <TableCell>{admin.email || "-"}</TableCell>
                        <TableCell>
                          {Array.isArray(admin.role)
                            ? admin.role.map((r) => (
                                <Chip
                                  key={r}
                                  label={r}
                                  size="small"
                                  sx={{
                                    mr: 0.5,
                                    bgcolor: r === "admin" ? Y.main : Y.light,
                                    color: "#3E2723",
                                    fontWeight: 800,
                                    border: `1px solid ${Y.border}`
                                  }}
                                />
                              ))
                            : (
                              <Chip
                                label={admin.role}
                                size="small"
                                sx={{
                                  bgcolor: admin.role === "admin" ? Y.main : Y.light,
                                  color: "#3E2723",
                                  fontWeight: 800,
                                  border: `1px solid ${Y.border}`
                                }}
                              />
                            )}
                        </TableCell>
                        <TableCell align="center">
                          {/* Edit */}
                          {canEdit && (
                            <Tooltip title="แก้ไขข้อมูลผู้ใช้">
                              <IconButton
                                color="primary"
                                size="small"
                                onClick={() => handleOpenEdit(admin)}
                                sx={{ mr: 0.5 }}
                              >
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          {/* Change/Reset Password */}
                          <Tooltip title={isSelf ? "เปลี่ยนรหัสผ่านของคุณ" : "รีเซ็ตรหัสผ่านผู้ใช้"}>
                            <span>
                              <IconButton
                                color="info"
                                size="small"
                                onClick={() => openPasswordDialog(admin)}
                                disabled={!canEdit && !isSelf}
                                sx={{ mr: 0.5 }}
                              >
                                <VpnKeyIcon />
                              </IconButton>
                            </span>
                          </Tooltip>
                          {/* Delete */}
                          {canEdit && (
                            <Tooltip title="ลบผู้ใช้">
                              <span>
                                <IconButton
                                  color="error"
                                  size="small"
                                  onClick={() => handleDelete(admin._id)}
                                  disabled={isSelf}
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

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
