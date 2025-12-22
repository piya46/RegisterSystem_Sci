import React, { useEffect, useState } from "react";
import {
  Box, Typography, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Chip,
  CircularProgress, Stack, Tooltip, Avatar, Alert
} from "@mui/material";
import { styled } from "@mui/material/styles";

// Icons
import DeleteIcon from "@mui/icons-material/Delete";
import BlockIcon from "@mui/icons-material/Block"; // Revoke icon
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DevicesIcon from "@mui/icons-material/Devices";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";

import useAuth from "../hooks/useAuth";
import * as api from "../utils/api";
import { useNavigate } from "react-router-dom";

// Theme (copy from AdminPage for consistency)
const Y = {
  main: "#FFC107",
  light: "#FFF8E1",
  text: "#4E342E",
  success: "#2e7d32",
  error: "#d32f2f",
};

const StyledCard = styled(Card)(({ theme }) => ({
  borderRadius: 24,
  boxShadow: "0 8px 32px rgba(255, 193, 7, 0.15)",
  border: `1px solid rgba(255, 193, 7, 0.3)`,
  overflow: "hidden"
}));

export default function SessionManagerPage() {
  const { token, user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSessions();
  }, [token]);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await api.listSessions(token);
      setSessions(res.data || []);
    } catch (error) {
      console.error("Failed to fetch sessions", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm("ต้องการยกเลิกสิทธิ์ (Revoke) เซสชันนี้ใช่หรือไม่? ผู้ใช้จะต้องล็อกอินใหม่")) return;
    try {
      await api.revokeSession(id); // เรียก API revoke
      fetchSessions(); // Refresh list
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการ Revoke: " + (error.response?.data?.error || error.message));
    }
  };

  const handleDelete = async (tokenStr) => {
    if (!window.confirm("ต้องการลบเซสชันนี้ออกจากฐานข้อมูลใช่หรือไม่?")) return;
    try {
      await api.deleteSessionByToken(tokenStr);
      fetchSessions();
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการลบ: " + (error.response?.data?.error || error.message));
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("th-TH");
  };

  return (
    <Box sx={{
      minHeight: "100vh",
      background: "linear-gradient(-45deg, #FFECB3, #FFF8E1, #FFD54F, #FFF3E0)",
      backgroundSize: "400% 400%",
      py: { xs: 3, md: 5 }, px: 2
    }}>
      <Box sx={{ maxWidth: 1200, mx: "auto" }}>
        
        {/* Header */}
        <Stack direction="row" alignItems="center" spacing={2} mb={4}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate("/admin")}
            sx={{ color: Y.text, fontWeight: 700, borderRadius: 3 }}
          >
            Back
          </Button>
          <Box>
            <Typography variant="h4" fontWeight={800} sx={{ color: Y.text }}>
              Session Management
            </Typography>
            <Typography variant="body1" color="text.secondary">
              จัดการการเข้าใช้งานระบบ ตรวจสอบ IP และสั่ง Logout ผู้ใช้
            </Typography>
          </Box>
        </Stack>

        <StyledCard>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 3 }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: Y.light }}>
                    <TableCell sx={{ fontWeight: 800, color: Y.text }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: Y.text }}>Device / IP</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: Y.text }}>Created / Expires</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: Y.text }}>Status</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, color: Y.text }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} align="center"><CircularProgress /></TableCell></TableRow>
                  ) : sessions.length === 0 ? (
                    <TableRow><TableCell colSpan={5} align="center"><Alert severity="info">ไม่พบรายการ Session</Alert></TableCell></TableRow>
                  ) : (
                    sessions.map((item) => (
                      <TableRow key={item._id} hover>
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Avatar sx={{ width: 32, height: 32, bgcolor: Y.main }}>
                                <AccountCircleIcon />
                            </Avatar>
                            <Box>
                                <Typography variant="body2" fontWeight={700}>
                                    {item.userId?.username || "Unknown"}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {item.userId?.role || "-"}
                                </Typography>
                            </Box>
                          </Stack>
                        </TableCell>

                        <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <DevicesIcon fontSize="small" color="action" />
                                <Tooltip title={item.userAgent}>
                                    <Typography variant="body2" sx={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.userAgent}
                                    </Typography>
                                </Tooltip>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 3 }}>
                                IP: {item.ip}
                            </Typography>
                        </TableCell>

                        <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <AccessTimeIcon fontSize="small" color="action" />
                                <Box>
                                    <Typography variant="body2">{formatDate(item.createdAt)}</Typography>
                                    <Typography variant="caption" color="text.secondary">Exp: {formatDate(item.expiresAt)}</Typography>
                                </Box>
                            </Stack>
                        </TableCell>

                        <TableCell>
                           {item.revoked ? (
                               <Chip label="Revoked" color="error" size="small" variant="outlined" />
                           ) : (
                               <Chip label="Active" color="success" size="small" />
                           )}
                        </TableCell>

                        <TableCell align="center">
                          <Stack direction="row" justifyContent="center" spacing={1}>
                            {!item.revoked && (
                                <Tooltip title="Revoke (Force Logout)">
                                    <IconButton color="warning" onClick={() => handleRevoke(item._id)}>
                                        <BlockIcon />
                                    </IconButton>
                                </Tooltip>
                            )}
                            <Tooltip title="Delete Log">
                                <IconButton color="error" onClick={() => handleDelete(item.token)}>
                                    <DeleteIcon />
                                </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </StyledCard>
      </Box>
    </Box>
  );
}