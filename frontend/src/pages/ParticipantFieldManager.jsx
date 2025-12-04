// src/pages/ParticipantFieldManager.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Card, CardContent, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Switch, Chip, Stack, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, FormControlLabel, CircularProgress, Snackbar, Alert,
  InputAdornment, LinearProgress, Divider, Avatar, Select, FormControl, InputLabel
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import useAuth from "../hooks/useAuth";
import * as api from "../utils/api";
import { useNavigate } from "react-router-dom";

export default function ParticipantFieldManager() {
  const { user, token, loading } = useAuth();
  const navigate = useNavigate();

  // data
  const [fields, setFields] = useState([]);
  const [fetching, setFetching] = useState(true);

  // ui state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  // filters
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [enabledFilter, setEnabledFilter] = useState("all");

  // busy flags
  const [busyId, setBusyId] = useState(null);
  const [busyReorder, setBusyReorder] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);

  // ===== Permission Guard =====
  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      navigate("/login", { replace: true });
      return;
    }
    const isAdmin = Array.isArray(user.role) ? user.role.includes("admin") : user.role === "admin";
    if (!isAdmin) {
      navigate("/unauthorized", { replace: true });
      return;
    }
    fetchData();
    // eslint-disable-next-line
  }, [user, token, loading]);

  // ===== Fetch =====
  const fetchData = () => {
    setFetching(true);
    api
      .listParticipantFields(token)
      .then((res) => {
        const rows = (res.data || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setFields(rows);
        setLastFetch(Date.now());
      })
      .catch(() => setFields([]))
      .finally(() => setFetching(false));
  };

  // ===== CRUD =====
  const handleSave = async (data) => {
    try {
      if (editData?._id) {
        await api.updateParticipantField(editData._id, data, token);
        setSnackbar({ open: true, message: "บันทึกสำเร็จ", severity: "success" });
      } else {
        await api.createParticipantField(data, token);
        setSnackbar({ open: true, message: "เพิ่มสำเร็จ", severity: "success" });
      }
      setDialogOpen(false);
      fetchData();
    } catch {
      setSnackbar({ open: true, message: "บันทึกไม่สำเร็จ", severity: "error" });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("ลบฟิลด์นี้ถาวร?")) return;
    setBusyId(id);
    try {
      await api.deleteParticipantField(id, token);
      setSnackbar({ open: true, message: "ลบสำเร็จ", severity: "success" });
      fetchData();
    } catch {
      setSnackbar({ open: true, message: "ลบไม่สำเร็จ", severity: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const toggleEnabled = async (field) => {
    setBusyId(field._id);
    try {
      await api.updateParticipantField(field._id, { enabled: !field.enabled }, token);
      fetchData();
    } finally {
      setBusyId(null);
    }
  };

  // ===== Reorder (move up/down) =====
  const moveField = async (index, direction) => {
    if ((direction === -1 && index === 0) || (direction === 1 && index === fields.length - 1)) return;
    const a = fields[index];
    const b = fields[index + direction];
    if (!a || !b) return;

    setBusyReorder(true);
    try {
      await api.updateParticipantField(a._id, { order: b.order }, token);
      await api.updateParticipantField(b._id, { order: a.order }, token);
      fetchData();
    } finally {
      setBusyReorder(false);
    }
  };

  // ===== Derived / Filtered =====
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return fields.filter((f) => {
      const byKw = !kw || [f.name, f.label, f.type].some((v) => (v || "").toLowerCase().includes(kw));
      const byType = typeFilter === "all" || f.type === typeFilter;
      const byEnabled =
        enabledFilter === "all" ||
        (enabledFilter === "enabled" && !!f.enabled) ||
        (enabledFilter === "disabled" && !f.enabled);
      return byKw && byType && byEnabled;
    });
  }, [fields, q, typeFilter, enabledFilter]);

  // ===== Loading Screen =====
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #fff8e1 0%, #fffde7 100%)",
        }}
      >
        <Stack alignItems="center" spacing={2}>
          <LinearProgress color="warning" sx={{ width: 260 }} />
          <Typography color="text.secondary">กำลังโหลด...</Typography>
        </Stack>
      </Box>
    );
  }

  // ===== Pretty Container =====
  return (
    <Box
      sx={{
        minHeight: "100vh",
        pb: 6,
        background:
          "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #ffe082 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)",
      }}
    >
      <Box sx={{ maxWidth: 1100, mx: "auto", px: 2 }}>
        {/* Header Card */}
        <Card
          elevation={4}
          sx={{
            mt: 4,
            borderRadius: 4,
            background: "linear-gradient(90deg, rgba(255,243,224,.92), rgba(255,224,130,.92))",
            boxShadow: "0 10px 30px rgba(255,193,7,0.25), inset 0 1px 0 rgba(255,255,255,.6)",
            border: "1px solid rgba(255,193,7,.35)",
          }}
        >
          {fetching && <LinearProgress color="warning" />}
          <CardContent>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" justifyContent="space-between">
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
                />
                <Box>
                  <Typography variant="h5" fontWeight={900} color="primary" sx={{ letterSpacing: 0.5 }}>
                    จัดการฟิลด์สำหรับลงทะเบียน
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.3 }}>
                    <Chip label="Admin Only" size="small" color="warning" sx={{ fontWeight: 800 }} />
                    {lastFetch && (
                      <Typography variant="body2" color="text.secondary">
                        อัปเดตล่าสุด: {formatSince(lastFetch)}
                      </Typography>
                    )}
                  </Stack>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1}>
                <Tooltip title="กลับหน้าหลัก">
                  <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate("/settings")} sx={{ fontWeight: 700 }}>
                    กลับ
                  </Button>
                </Tooltip>
                <Tooltip title="รีเฟรชข้อมูล">
                  <span>
                    <Button
                      variant="outlined"
                      startIcon={<RefreshIcon />}
                      onClick={fetchData}
                      disabled={fetching || busyReorder}
                      sx={{ fontWeight: 700 }}
                    >
                      รีเฟรช
                    </Button>
                  </span>
                </Tooltip>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setEditData(null);
                    setDialogOpen(true);
                  }}
                  sx={{ fontWeight: 800, boxShadow: "0 6px 18px rgba(255,193,7,.35)" }}
                >
                  เพิ่มฟิลด์
                </Button>
              </Stack>
            </Stack>

            <Divider sx={{ my: 2 }} />

            {/* Filters */}
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
              <TextField
                fullWidth
                placeholder="ค้นหา: ชื่อ/ป้ายกำกับ/ประเภท"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="warning" />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  maxWidth: { md: 420 },
                  "& .MuiOutlinedInput-root": {
                    bgcolor: "#fff",
                    borderRadius: 2,
                    "& fieldset": { borderColor: "rgba(255,193,7,.6)" },
                    "&:hover fieldset": { borderColor: "rgba(255,193,7,.9)" },
                    "&.Mui-focused fieldset": { borderColor: "#ffb300" },
                  },
                }}
              />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>ประเภท</InputLabel>
                <Select value={typeFilter} label="ประเภท" onChange={(e) => setTypeFilter(e.target.value)}>
                  <MenuItem value="all">ทั้งหมด</MenuItem>
                  <MenuItem value="text">text</MenuItem>
                  <MenuItem value="number">number</MenuItem>
                  <MenuItem value="email">email</MenuItem>
                  <MenuItem value="date">date</MenuItem>
                  <MenuItem value="select">select</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 170 }}>
                <InputLabel>สถานะ</InputLabel>
                <Select value={enabledFilter} label="สถานะ" onChange={(e) => setEnabledFilter(e.target.value)}>
                  <MenuItem value="all">ทั้งหมด</MenuItem>
                  <MenuItem value="enabled">Enabled</MenuItem>
                  <MenuItem value="disabled">Disabled</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{ flex: 1 }} />
              <Chip
                label={`ทั้งหมด ${filtered.length} ฟิลด์`}
                color="default"
                sx={{ alignSelf: "center", fontWeight: 700 }}
                variant="outlined"
              />
            </Stack>
          </CardContent>
        </Card>

        {/* Table Card */}
        <Card elevation={3} sx={{ mt: 3, borderRadius: 4, background: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,.06)" }}>
          {fetching && <LinearProgress color="warning" />}
          <CardContent sx={{ pt: 0 }}>
            <TableContainer component={Paper} elevation={0}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 800, bgcolor: "#fff8e1" } }}>
                    <TableCell width={60} align="center">ลำดับ</TableCell>
                    <TableCell>ชื่อฟิลด์</TableCell>
                    <TableCell>Label</TableCell>
                    <TableCell>ประเภท</TableCell>
                    <TableCell align="center">จำเป็น</TableCell>
                    <TableCell align="center">Enabled</TableCell>
                    <TableCell>Options</TableCell>
                    <TableCell align="center" width={184}>จัดการ</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!fetching && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
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
                          {q || typeFilter !== "all" || enabledFilter !== "all" ? "ไม่พบผลลัพธ์ตามที่ค้นหา/กรอง" : "ยังไม่มีฟิลด์"}
                        </Typography>
                        {!q && typeFilter === "all" && enabledFilter === "all" && (
                          <Button variant="outlined" sx={{ mt: 1.5, borderRadius: 2 }} onClick={() => { setEditData(null); setDialogOpen(true); }}>
                            เพิ่มฟิลด์แรกของคุณ
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )}

                  {filtered.map((f, idx) => (
                    <TableRow key={f._id} hover sx={{ "&:nth-of-type(odd)": { bgcolor: "rgba(255,248,225,.35)" } }}>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>{f.order ?? idx + 1}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{f.name}</TableCell>
                      <TableCell>{f.label}</TableCell>
                      <TableCell>
                        <Chip label={f.type} color={colorByType(f.type)} size="small" sx={{ fontWeight: 700 }} />
                      </TableCell>
                      <TableCell align="center">
                        {f.required ? <Chip label="จำเป็น" color="error" size="small" sx={{ fontWeight: 700 }} /> : "-"}
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title={f.enabled ? "คลิกเพื่อปิดการใช้งาน" : "คลิกเพื่อเปิดใช้งาน"}>
                          <span>
                            <Switch
                              checked={!!f.enabled}
                              onChange={() => toggleEnabled(f)}
                              color="success"
                              disabled={busyId === f._id}
                            />
                          </span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {f.type === "select" && f.options?.length
                          ? f.options.map((o) => <Chip key={o} label={o} size="small" sx={{ mr: 0.5, mb: 0.5 }} />)
                          : <Typography variant="body2" color="text.secondary">—</Typography>}
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="เลื่อนขึ้น">
                            <span>
                              <IconButton size="small" onClick={() => moveField(findIndexById(filtered, f._id, fields), -1)} disabled={isFirst(filtered, f, fields) || busyReorder}>
                                <ArrowUpwardIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="เลื่อนลง">
                            <span>
                              <IconButton size="small" onClick={() => moveField(findIndexById(filtered, f._id, fields), 1)} disabled={isLast(filtered, f, fields) || busyReorder}>
                                <ArrowDownwardIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="แก้ไข">
                            <IconButton size="small" onClick={() => { setEditData(f); setDialogOpen(true); }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="ลบ">
                            <span>
                              <IconButton size="small" color="error" onClick={() => handleDelete(f._id)} disabled={busyId === f._id}>
                                {busyId === f._id ? <RefreshIcon sx={{ animation: "spin 1s linear infinite" }} /> : <DeleteIcon fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Box>

      {/* Dialog */}
      <FieldDialog
        open={dialogOpen}
        data={editData}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={2400}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </Box>
  );
}

// ========= Helpers =========
function colorByType(t) {
  switch (t) {
    case "text": return "default";
    case "number": return "info";
    case "email": return "primary";
    case "date": return "success";
    case "select": return "warning";
    default: return "default";
  }
}
function formatSince(ts) {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec} วินาทีที่แล้ว`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} นาที ${s} วินาทีที่แล้ว`;
}
function findIndexById(filtered, id, all) {
  // ใช้ index จริงใน all (เพื่อแลก order ถูกต้องแม้มี filter)
  const idx = all.findIndex((x) => x._id === id);
  return idx === -1 ? 0 : idx;
}
function isFirst(filtered, row, all) {
  const idx = findIndexById(filtered, row._id, all);
  return idx === 0;
}
function isLast(filtered, row, all) {
  const idx = findIndexById(filtered, row._id, all);
  return idx === all.length - 1;
}

// ========= Dialog =========
function FieldDialog({ open, data, onClose, onSave }) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [required, setRequired] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [options, setOptions] = useState("");

  useEffect(() => {
    setName(data?.name || "");
    setLabel(data?.label || "");
    setType(data?.type || "text");
    setRequired(!!data?.required);
    setEnabled(data?.enabled ?? true);
    setOptions(Array.isArray(data?.options) ? data.options.join(", ") : "");
  }, [data, open]);

  // auto-generate ชื่อ จาก label (ครั้งแรกๆ เท่านั้น)
  useEffect(() => {
    if (!data && label && !name) {
      const slug = label
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .toLowerCase();
      if (slug) setName(slug);
    }
    // eslint-disable-next-line
  }, [label]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const optArr = type === "select"
      ? options.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    onSave({ name, label, type, required, enabled, options: optArr });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Avatar src="/logo.svg" sx={{ width: 28, height: 28 }} />
          {data ? "แก้ไขฟิลด์" : "เพิ่มฟิลด์"}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label="ชื่อ (อังกฤษ, สำหรับ backend)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              helperText="เช่น student_id, email, phone"
              InputProps={{
                startAdornment: <InputAdornment position="start">api:</InputAdornment>,
              }}
            />
            <TextField
              label="ป้ายกำกับที่แสดง (label)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              InputProps={{
                startAdornment: <InputAdornment position="start">UI:</InputAdornment>,
              }}
            />
            <TextField label="ประเภท" select value={type} onChange={(e) => setType(e.target.value)}>
              <MenuItem value="text">ข้อความ (text)</MenuItem>
              <MenuItem value="number">ตัวเลข (number)</MenuItem>
              <MenuItem value="email">อีเมล (email)</MenuItem>
              <MenuItem value="date">วันที่ (date)</MenuItem>
              <MenuItem value="select">ตัวเลือก (select)</MenuItem>
            </TextField>
            {type === "select" && (
              <TextField
                label="ตัวเลือก (คั่นด้วย ,)"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="เช่น A, B, C"
                helperText="ตัวอย่าง: A, B, C"
              />
            )}
            <Stack direction="row" spacing={2}>
              <FormControlLabel control={<Switch checked={required} onChange={(e) => setRequired(e.target.checked)} color="error" />} label="จำเป็นต้องกรอก" />
              <FormControlLabel control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} color="success" />} label="เปิดใช้งาน" />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} startIcon={<CloseIcon />}>ยกเลิก</Button>
          <Button type="submit" variant="contained" startIcon={<SaveIcon />} sx={{ fontWeight: 800 }}>
            {data ? "บันทึก" : "เพิ่ม"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
