// src/pages/RegistrationPointPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Stack,
  Avatar,
  Tooltip,
  TextField,
  InputAdornment,
  LinearProgress,
  Skeleton,
  Divider,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/AddLocationAlt";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchIcon from "@mui/icons-material/Search";
import useAuth from "../hooks/useAuth";
import * as api from "../utils/api";
import { useNavigate } from "react-router-dom";
import RegistrationPointDialog from "../components/RegistrationPointDialog";

export default function RegistrationPointPage() {
  const { user, token, loading } = useAuth();
  const [points, setPoints] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [headerHover, setHeaderHover] = useState(false);
  const navigate = useNavigate();

  // โหลดข้อมูลจุดลงทะเบียน
  const fetchData = async () => {
    setFetching(true);
    try {
      const res = await api.listRegistrationPoints(token);
      const rows = res.data || res || [];
      setPoints(rows);
      setLastFetch(Date.now());
    } catch {
      setPoints([]);
    } finally {
      setFetching(false);
    }
  };

  // Guard: เฉพาะ admin
  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      navigate("/login", { replace: true });
      return;
    }
    const isAdmin = Array.isArray(user.role)
      ? user.role.includes("admin")
      : user.role === "admin";
    if (!isAdmin) {
      navigate("/unauthorized", { replace: true });
      return;
    }
    fetchData();
    // eslint-disable-next-line
  }, [user, token, loading, navigate]);

  // Filter
  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setFiltered(points);
    } else {
      setFiltered(
        points.filter((p) => {
          const name = (p.name || "").toLowerCase();
          const desc = (p.description || "").toLowerCase();
          return name.includes(q) || desc.includes(q);
        })
      );
    }
  }, [points, search]);

  // Relative time “อัปเดตล่าสุด … วินาทีที่แล้ว”
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const sinceText = useMemo(() => {
    if (!lastFetch) return "";
    const sec = Math.max(0, Math.floor((Date.now() - lastFetch) / 1000));
    if (sec < 60) return `${sec} วินาทีที่แล้ว`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m} นาที ${s} วินาทีที่แล้ว`;
  }, [lastFetch, forceTick]); // forceTick changes every sec

  // ฟังก์ชันจัดการเพิ่ม/แก้ไข/ลบ
  const handleDelete = async (id) => {
    if (!window.confirm("คุณแน่ใจว่าต้องการลบจุดลงทะเบียนนี้?")) return;
    setBusyId(id);
    try {
      await api.deleteRegistrationPoint(id, token);
      await fetchData();
    } finally {
      setBusyId(null);
    }
  };
  const handleOpenAdd = () => {
    setEditData(null);
    setDialogOpen(true);
  };
  const handleOpenEdit = (row) => {
    setEditData(row);
    setDialogOpen(true);
  };
  const handleDialogSave = async (data) => {
    setBusyId("form");
    try {
      if (editData) {
        await api.updateRegistrationPoint(editData._id, data, token);
      } else {
        await api.createRegistrationPoint(data, token);
      }
      setDialogOpen(false);
      await fetchData();
    } finally {
      setBusyId(null);
    }
  };

  // Loading เฟรม
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #fff8e1 0%, #fffde7 100%)",
        }}
      >
        <Stack spacing={2} alignItems="center">
          <LinearProgress sx={{ width: 240 }} />
          <Typography color="text.secondary">กำลังโหลด...</Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        pb: 6,
        background:
          "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #ffe082 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)",
      }}
    >
      {/* Header Card */}
      <Box sx={{ maxWidth: 1080, mx: "auto", px: 2 }}>
        <Card
          elevation={headerHover ? 8 : 4}
          onMouseEnter={() => setHeaderHover(true)}
          onMouseLeave={() => setHeaderHover(false)}
          sx={{
            mt: 4,
            borderRadius: 4,
            background:
              "linear-gradient(90deg, rgba(255,243,224,.9), rgba(255,224,130,.9))",
            boxShadow:
              "0 10px 30px rgba(255,193,7,0.25), inset 0 1px 0 rgba(255,255,255,.6)",
            border: "1px solid rgba(255,193,7,.35)",
          }}
        >
          <CardContent>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems="center"
              justifyContent="space-between"
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar
                  src="/logo.svg"
                  alt="Logo"
                  sx={{
                    width: 56,
                    height: 56,
                    bgcolor: "#fff",
                    boxShadow: "0 6px 18px rgba(255,193,7,.45)",
                    border: "2px solid rgba(255,193,7,.7)",
                  }}
                  variant="circular"
                />
                <Box>
                  <Typography
                    variant="h5"
                    fontWeight={900}
                    color="primary"
                    sx={{ letterSpacing: 0.5 }}
                  >
                    จัดการจุดลงทะเบียน
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      label="Admin Only"
                      size="small"
                      color="warning"
                      sx={{ fontWeight: 800 }}
                    />
                    {lastFetch && (
                      <Typography variant="body2" color="text.secondary">
                        อัปเดตล่าสุด: {sinceText}
                      </Typography>
                    )}
                  </Stack>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1.2} alignItems="center">
                <Tooltip title="กลับหน้า Dashboard">
                  <IconButton
                    onClick={() => navigate("/dashboard")}
                    sx={{
                      bgcolor: "#fff",
                      border: "1px solid rgba(0,0,0,.06)",
                      "&:hover": { bgcolor: "#fffbe6" },
                    }}
                  >
                    <ArrowBackIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="รีเฟรชข้อมูล">
                  <span>
                    <IconButton
                      onClick={fetchData}
                      disabled={fetching}
                      color="primary"
                      sx={{
                        bgcolor: "#fff",
                        border: "1px solid rgba(0,0,0,.06)",
                        "&:hover": { bgcolor: "#fffbe6" },
                      }}
                    >
                      <RefreshIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AddIcon />}
                  onClick={handleOpenAdd}
                  sx={{
                    fontWeight: 800,
                    borderRadius: 2.5,
                    boxShadow: "0 6px 18px rgba(255,193,7,.35)",
                  }}
                >
                  เพิ่มจุดลงทะเบียน
                </Button>
              </Stack>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <TextField
              fullWidth
              placeholder="ค้นหา: ชื่อจุด หรือ รายละเอียด"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="warning" />
                  </InputAdornment>
                ),
              }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  bgcolor: "#fff",
                  borderRadius: 2,
                  "& fieldset": { borderColor: "rgba(255,193,7,.6)" },
                  "&:hover fieldset": { borderColor: "rgba(255,193,7,.9)" },
                  "&.Mui-focused fieldset": { borderColor: "#ffb300" },
                },
              }}
            />
          </CardContent>
        </Card>

        {/* Table Card */}
        <Card
          elevation={3}
          sx={{
            mt: 3,
            borderRadius: 4,
            background: "#fff",
            boxShadow: "0 8px 24px rgba(0,0,0,.06)",
          }}
        >
          {fetching && <LinearProgress color="warning" />}

          <CardContent sx={{ pt: 0 }}>
            <TableContainer component={Paper} elevation={0}>
              <Table size="medium" stickyHeader>
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 800, bgcolor: "#fff8e1" } }}>
                    <TableCell>ชื่อจุดลงทะเบียน</TableCell>
                    <TableCell>รายละเอียด</TableCell>
                    <TableCell>สร้างเมื่อ</TableCell>
                    <TableCell align="center" width={140}>
                      จัดการ
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fetching ? (
                    [...Array(4)].map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell><Skeleton width={180} /></TableCell>
                        <TableCell><Skeleton width="80%" /></TableCell>
                        <TableCell><Skeleton width={160} /></TableCell>
                        <TableCell align="center">
                          <Skeleton width={100} />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                        <Avatar
                          src="/logo.svg"
                          alt="empty"
                          sx={{
                            width: 56,
                            height: 56,
                            mb: 1,
                            bgcolor: "#fffde7",
                            border: "2px solid #ffe082",
                          }}
                        />
                        <Typography color="text.secondary" sx={{ fontWeight: 600 }}>
                          {search ? "ไม่พบผลลัพธ์ตามที่ค้นหา" : "ยังไม่มีจุดลงทะเบียน"}
                        </Typography>
                        {!search && (
                          <Button
                            variant="outlined"
                            sx={{ mt: 1.5, borderRadius: 2 }}
                            onClick={handleOpenAdd}
                          >
                            เพิ่มจุดลงทะเบียนแรกของคุณ
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((point, idx) => (
                      <TableRow
                        key={point._id || idx}
                        hover
                        sx={{
                          "&:nth-of-type(odd)": { bgcolor: "rgba(255,248,225,.35)" },
                        }}
                      >
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Chip
                              size="small"
                              color={point.isActive ? "success" : "default"}
                              label={point.isActive ? "Active" : "Inactive"}
                              sx={{ fontWeight: 800 }}
                            />
                            <Typography sx={{ fontWeight: 700 }}>{point.name}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ color: "text.secondary" }}>
                          {point.description || "-"}
                        </TableCell>
                        <TableCell>
                          {point.createdAt
                            ? new Date(point.createdAt).toLocaleString("th-TH")
                            : "-"}
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="แก้ไข">
                            <span>
                              <IconButton
                                color="primary"
                                size="small"
                                onClick={() => handleOpenEdit(point)}
                                disabled={!!busyId}
                                sx={{ mr: 0.5 }}
                              >
                                <EditIcon />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="ลบ">
                            <span>
                              <IconButton
                                color="error"
                                size="small"
                                onClick={() => handleDelete(point._id)}
                                disabled={busyId === point._id}
                              >
                                {busyId === point._id ? (
                                  <RefreshIcon
                                    sx={{ animation: "spin 1s linear infinite" }}
                                  />
                                ) : (
                                  <DeleteIcon />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Box>

      {/* Dialog สร้าง/แก้ไข */}
      <RegistrationPointDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleDialogSave}
        initialData={editData}
        isEdit={!!editData}
      />

      {/* keyframes สำหรับปุ่มหมุน */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </Box>
  );
}
