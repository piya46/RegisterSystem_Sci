// src/pages/ParticipantFieldManager.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box, Card, CardContent, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Switch, Chip, Stack, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, FormControlLabel, CircularProgress, Snackbar, Alert,
  InputAdornment, LinearProgress, Divider, Avatar, Select, FormControl, InputLabel,
  useTheme, Grid
} from "@mui/material";
import EditTwoToneIcon from "@mui/icons-material/EditTwoTone";
import DeleteTwoToneIcon from "@mui/icons-material/DeleteTwoTone";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import ListAltIcon from "@mui/icons-material/ListAlt";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import NumbersIcon from "@mui/icons-material/Numbers";
import EmailIcon from "@mui/icons-material/Email";
import EventIcon from "@mui/icons-material/Event";
import ArrowDropDownCircleIcon from "@mui/icons-material/ArrowDropDownCircle";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";

import useAuth from "../hooks/useAuth";
import * as api from "../utils/api";
import { useLocation, useNavigate, useParams } from "react-router";
import { eventContextFromRouteAndSearch, eventContextToParams } from "../utils/eventContext";

function canManageEventSetup(user) {
  const roles = Array.isArray(user?.role) ? user.role : [user?.role].filter(Boolean);
  return roles.includes("superadmin") || roles.some((role) => ["admin", "org_admin", "event_admin", "event_manager"].includes(role));
}

export default function ParticipantFieldManager() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { eventId: routeEventId, eventSlug: routeEventSlug, eventYear: routeEventYear } = useParams();
  const theme = useTheme();
  const eventContext = useMemo(
    () => eventContextFromRouteAndSearch(
      { eventId: routeEventId, eventSlug: routeEventSlug, eventYear: routeEventYear },
      location.search
    ),
    [routeEventId, routeEventSlug, routeEventYear, location.search]
  );
  const eventParams = useMemo(() => eventContextToParams(eventContext), [eventContext]);
  const hasEventScope = Boolean(eventParams.eventId || eventParams.eventSlug);
  const backPath = eventParams.eventId ? `/admin/events/${eventParams.eventId}/dashboard` : "/dashboard";

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

  // ===== Fetch =====
  const fetchData = useCallback(() => {
    setFetching(true);
    api
      .listParticipantFields(eventParams)
      .then((res) => {
        const rows = (res.data || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setFields(rows);
      })
      .catch(() => setFields([]))
      .finally(() => setFetching(false));
  }, [eventParams]);

  // ===== Permission Guard =====
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (!canManageEventSetup(user)) {
      navigate("/unauthorized", { replace: true });
      return;
    }
    fetchData();
  }, [user, loading, navigate, fetchData]);

  // ===== CRUD =====
  const handleSave = async (data) => {
    try {
      if (editData?._id) {
        await api.updateParticipantField(editData._id, { ...data, ...eventParams });
        setSnackbar({ open: true, message: "บันทึกสำเร็จ", severity: "success" });
      } else {
        await api.createParticipantField({ ...data, ...eventParams });
        setSnackbar({ open: true, message: "เพิ่มสำเร็จ", severity: "success" });
      }
      setDialogOpen(false);
      fetchData();
    } catch {
      setSnackbar({ open: true, message: "บันทึกไม่สำเร็จ", severity: "error" });
    }
  };

  const handleDelete = async (field) => {
    if (field?.inherited && hasEventScope) return;
    if (!window.confirm("ลบฟิลด์นี้ถาวร? ข้อมูลที่เกี่ยวข้องอาจสูญหาย")) return;
    setBusyId(field._id);
    try {
      await api.deleteParticipantField(field._id, eventParams);
      setSnackbar({ open: true, message: "ลบสำเร็จ", severity: "success" });
      fetchData();
    } catch {
      setSnackbar({ open: true, message: "ลบไม่สำเร็จ", severity: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const toggleEnabled = async (field) => {
    if (field?.inherited && hasEventScope) return;
    setBusyId(field._id);
    try {
      await api.updateParticipantField(field._id, { enabled: !field.enabled, ...eventParams });
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
    if (hasEventScope && (a.inherited || b.inherited)) return;

    setBusyReorder(true);
    try {
      await api.updateParticipantField(a._id, { order: b.order, ...eventParams });
      await api.updateParticipantField(b._id, { order: a.order, ...eventParams });
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
      <Box height="80vh" display="flex" flexDirection="column" justifyContent="center" alignItems="center">
        <CircularProgress size={60} thickness={4} />
        <Typography variant="body1" sx={{ mt: 2, color: "text.secondary" }}>กำลังโหลดข้อมูล...</Typography>
      </Box>
    );
  }

  // ===== Render =====
  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", py: 4, px: 2 }}>
      {/* Header Section */}
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight="800" gutterBottom sx={{ background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`, backgroundClip: "text", textFillColor: "transparent", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            จัดการฟิลด์ลงทะเบียน
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Custom Fields Management
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} sx={{ mt: { xs: 2, sm: 0 } }}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(backPath)} sx={{ borderRadius: 2, textTransform: "none" }}>
            กลับหน้าหลัก
          </Button>
          <Button 
            variant="contained" 
            startIcon={<AddCircleOutlineIcon />} 
            onClick={() => { setEditData(null); setDialogOpen(true); }}
            sx={{ borderRadius: 2, textTransform: "none", boxShadow: 3 }}
          >
            เพิ่มฟิลด์ใหม่
          </Button>
        </Stack>
      </Stack>

      <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 3, border: `1px solid ${theme.palette.divider}`, bgcolor: "#fafafa" }}>
        {/* Filters & Actions */}
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              placeholder="ค้นหา: ชื่อ / ป้ายกำกับ"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                sx: { borderRadius: 2, bgcolor: "#fff" }
              }}
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <FormControl size="small" fullWidth sx={{ bgcolor: "#fff", borderRadius: 2 }}>
              <InputLabel>ประเภท</InputLabel>
              <Select value={typeFilter} label="ประเภท" onChange={(e) => setTypeFilter(e.target.value)}>
                <MenuItem value="all">ทั้งหมด</MenuItem>
                <MenuItem value="text">ข้อความ</MenuItem>
                <MenuItem value="number">ตัวเลข</MenuItem>
                <MenuItem value="email">อีเมล</MenuItem>
                <MenuItem value="date">วันที่</MenuItem>
                <MenuItem value="select">ตัวเลือก</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={2}>
            <FormControl size="small" fullWidth sx={{ bgcolor: "#fff", borderRadius: 2 }}>
              <InputLabel>สถานะ</InputLabel>
              <Select value={enabledFilter} label="สถานะ" onChange={(e) => setEnabledFilter(e.target.value)}>
                <MenuItem value="all">ทั้งหมด</MenuItem>
                <MenuItem value="enabled">เปิดใช้งาน</MenuItem>
                <MenuItem value="disabled">ปิดใช้งาน</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4} display="flex" justifyContent={{ xs: 'flex-start', md: 'flex-end' }} gap={1}>
             <Button 
                variant="text" 
                startIcon={<RefreshIcon />} 
                onClick={fetchData} 
                disabled={fetching || busyReorder}
                size="small"
             >
               รีเฟรช
             </Button>
             <Chip label={`ทั้งหมด ${filtered.length} รายการ`} />
          </Grid>
        </Grid>
      </Paper>

      {/* Content Area */}
      <Card elevation={2} sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {fetching && <LinearProgress />}
        
        {/* Table View */}
        <TableContainer sx={{ maxHeight: '65vh' }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell width={60} align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>ลำดับ</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Label (ชื่อที่แสดง)</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Field Name (API)</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>ประเภท</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>จำเป็น</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>สถานะ</TableCell>
                <TableCell align="center" width={160} sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>จัดการ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!fetching && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                    <ListAltIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                    <Typography color="text.secondary">ไม่พบข้อมูลฟิลด์</Typography>
                  </TableCell>
                </TableRow>
              )}

              {filtered.map((f, idx) => {
                const readOnlyInherited = hasEventScope && f.inherited;
                return (
                <TableRow key={f._id} hover>
                  <TableCell align="center">
                    <Stack direction="column" alignItems="center">
                        <IconButton size="small" onClick={() => moveField(findIndexById(filtered, f._id, fields), -1)} disabled={readOnlyInherited || isFirst(filtered, f, fields) || busyReorder}>
                            <ArrowUpwardIcon fontSize="inherit" />
                        </IconButton>
                        <Typography variant="caption" fontWeight="bold">{f.order ?? idx + 1}</Typography>
                        <IconButton size="small" onClick={() => moveField(findIndexById(filtered, f._id, fields), 1)} disabled={readOnlyInherited || isLast(filtered, f, fields) || busyReorder}>
                            <ArrowDownwardIcon fontSize="inherit" />
                        </IconButton>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="subtitle2" fontWeight="bold">{f.label}</Typography>
                      {readOnlyInherited && <Chip label="Global" size="small" variant="outlined" />}
                    </Stack>
                    {f.type === 'select' && f.options?.length > 0 && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                            ตัวเลือก: {f.options.slice(0, 3).join(", ")}{f.options.length > 3 ? "..." : ""}
                        </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" sx={{ bgcolor: 'grey.100', px: 1, py: 0.5, borderRadius: 1, display: 'inline-block' }}>
                        {f.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                        icon={getIconByType(f.type)} 
                        label={f.type} 
                        size="small" 
                        variant="outlined" 
                        color={getColorByType(f.type)}
                    />
                  </TableCell>
                  <TableCell align="center">
                    {f.required ? <Chip label="Required" color="error" size="small" variant="filled" /> : <Typography variant="caption" color="text.secondary">-</Typography>}
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                        checked={!!f.enabled}
                        onChange={() => toggleEnabled(f)}
                        color="success"
                        disabled={readOnlyInherited || busyId === f._id}
                        size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={readOnlyInherited ? "ฟิลด์กลาง แก้ไขได้จาก global settings" : "แก้ไข"}>
                        <span>
                        <IconButton onClick={() => { setEditData(f); setDialogOpen(true); }} color="primary" disabled={readOnlyInherited}>
                            <EditTwoToneIcon />
                        </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title={readOnlyInherited ? "ฟิลด์กลาง แก้ไขได้จาก global settings" : "ลบ"}>
                        <span>
                        <IconButton onClick={() => handleDelete(f)} color="error" disabled={readOnlyInherited || busyId === f._id}>
                            <DeleteTwoToneIcon />
                        </IconButton>
                        </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Field Dialog */}
      <FieldDialog
        open={dialogOpen}
        data={editData}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ========= Helpers =========
function getColorByType(t) {
  switch (t) {
    case "text": return "default";
    case "number": return "info";
    case "email": return "secondary";
    case "date": return "success";
    case "select": return "warning";
    default: return "default";
  }
}

function getIconByType(t) {
    switch (t) {
        case "text": return <TextFieldsIcon fontSize="small" />;
        case "number": return <NumbersIcon fontSize="small" />;
        case "email": return <EmailIcon fontSize="small" />;
        case "date": return <EventIcon fontSize="small" />;
        case "select": return <ArrowDropDownCircleIcon fontSize="small" />;
        default: return <ListAltIcon fontSize="small" />;
    }
}

function findIndexById(filtered, id, all) {
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

  // auto-generate name from label (only for new fields)
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: 'primary.main', color: '#fff' }}>
          <PowerSettingsNewIcon />
          {data ? "แก้ไขฟิลด์ (Edit Field)" : "เพิ่มฟิลด์ใหม่ (New Field)"}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={3} sx={{ mt: 2 }}>
            <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                    <TextField
                    label="ชื่อฟิลด์ที่แสดง (Label)"
                    placeholder="เช่น เบอร์โทรศัพท์"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    required
                    fullWidth
                    InputProps={{
                        startAdornment: <InputAdornment position="start">UI:</InputAdornment>,
                    }}
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <TextField
                    label="ชื่ออ้างอิงในระบบ (API Name)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    fullWidth
                    helperText="ภาษาอังกฤษเท่านั้น เช่น phone_number"
                    InputProps={{
                        startAdornment: <InputAdornment position="start">key:</InputAdornment>,
                    }}
                    />
                </Grid>
            </Grid>
            
            <TextField
                label="ประเภทข้อมูล (Data Type)"
                select
                value={type}
                onChange={(e) => setType(e.target.value)}
                fullWidth
            >
              <MenuItem value="text"><Box display="flex" alignItems="center" gap={1}><TextFieldsIcon fontSize="small"/> ข้อความ (Text)</Box></MenuItem>
              <MenuItem value="number"><Box display="flex" alignItems="center" gap={1}><NumbersIcon fontSize="small"/> ตัวเลข (Number)</Box></MenuItem>
              <MenuItem value="email"><Box display="flex" alignItems="center" gap={1}><EmailIcon fontSize="small"/> อีเมล (Email)</Box></MenuItem>
              <MenuItem value="date"><Box display="flex" alignItems="center" gap={1}><EventIcon fontSize="small"/> วันที่ (Date)</Box></MenuItem>
              <MenuItem value="select"><Box display="flex" alignItems="center" gap={1}><ArrowDropDownCircleIcon fontSize="small"/> ตัวเลือก (Select/Dropdown)</Box></MenuItem>
            </TextField>

            {type === "select" && (
              <TextField
                label="ตัวเลือก (คั่นด้วยเครื่องหมายจุลภาค ,)"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="เช่น ชาย, หญิง, ไม่ระบุ"
                helperText="ระบุตัวเลือกที่ต้องการให้ผู้ใช้เลือก"
                multiline
                rows={2}
                fullWidth
              />
            )}

            <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <FormControlLabel 
                    control={<Switch checked={required} onChange={(e) => setRequired(e.target.checked)} color="error" />} 
                    label={<Typography fontWeight="bold">จำเป็นต้องกรอก (Required)</Typography>} 
                />
                <FormControlLabel 
                    control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} color="success" />} 
                    label={<Typography fontWeight="bold">เปิดใช้งาน (Enabled)</Typography>} 
                />
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit">ยกเลิก</Button>
          <Button type="submit" variant="contained" startIcon={<SaveIcon />} sx={{ px: 3, borderRadius: 2 }}>
            {data ? "บันทึกการแก้ไข" : "สร้างฟิลด์"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
