import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Card, CardContent, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Switch, Chip, Stack, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, FormControlLabel, CircularProgress, Snackbar, Alert,
  InputAdornment, LinearProgress, Divider, Avatar, Select, FormControl, InputLabel, Grid, useTheme,
  FormHelperText
} from "@mui/material";

// Icons
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
import AddIcon from "@mui/icons-material/Add";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";

import useAuth from "../hooks/useAuth";
import * as api from "../utils/api";
import { useNavigate } from "react-router-dom";

export default function ParticipantFieldManager() {
  const { user, token, loading } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();

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
        setSnackbar({ open: true, message: "บันทึกข้อมูลเรียบร้อย", severity: "success" });
      } else {
        await api.createParticipantField(data, token);
        setSnackbar({ open: true, message: "เพิ่มฟิลด์สำเร็จ", severity: "success" });
      }
      setDialogOpen(false);
      fetchData();
    } catch {
      setSnackbar({ open: true, message: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", severity: "error" });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("ยืนยันการลบฟิลด์นี้? ข้อมูลของผู้ใช้ที่กรอกในฟิลด์นี้อาจสูญหายได้")) return;
    setBusyId(id);
    try {
      await api.deleteParticipantField(id, token);
      setSnackbar({ open: true, message: "ลบฟิลด์เรียบร้อย", severity: "success" });
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
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="800" gutterBottom sx={{ background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`, backgroundClip: "text", textFillColor: "transparent", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            จัดการฟิลด์ลงทะเบียน
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ปรับแต่งแบบฟอร์มข้อมูลผู้เข้าร่วมงาน (Custom Fields)
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} sx={{ mt: { xs: 2, sm: 0 } }}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate("/settings")} sx={{ borderRadius: 2, textTransform: "none" }}>
            กลับสู่ตั้งค่า
          </Button>
          <Button 
            variant="contained" 
            startIcon={<AddCircleOutlineIcon />} 
            onClick={() => { setEditData(null); setDialogOpen(true); }}
            sx={{ borderRadius: 2, textTransform: "none", boxShadow: 3, fontWeight: 'bold' }}
          >
            เพิ่มฟิลด์ใหม่
          </Button>
        </Stack>
      </Stack>

      <Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: 3, border: `1px solid ${theme.palette.divider}`, bgcolor: "#fafafa" }}>
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
          <Grid item xs={12} md={4} display="flex" justifyContent={{ xs: 'flex-start', md: 'flex-end' }} alignItems="center" gap={1}>
             <Chip label={`ทั้งหมด ${filtered.length} รายการ`} variant="outlined" />
             <Tooltip title="รีโหลดข้อมูล">
                <IconButton onClick={fetchData} disabled={fetching || busyReorder}>
                    <RefreshIcon />
                </IconButton>
             </Tooltip>
          </Grid>
        </Grid>
      </Paper>

      {/* Content Area */}
      <Card elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {fetching && <LinearProgress color="primary" />}
        
        {/* Table View */}
        <TableContainer sx={{ maxHeight: '65vh' }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell width={80} align="center" sx={{ fontWeight: 'bold', bgcolor: '#f0f7ff', color: 'primary.main' }}>ลำดับ</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f0f7ff', color: 'primary.main' }}>ชื่อฟิลด์ (Label)</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f0f7ff', color: 'primary.main' }}>รหัส (API Name)</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f0f7ff', color: 'primary.main' }}>ประเภท</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f0f7ff', color: 'primary.main' }}>จำเป็น</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f0f7ff', color: 'primary.main' }}>สถานะ</TableCell>
                <TableCell align="center" width={160} sx={{ fontWeight: 'bold', bgcolor: '#f0f7ff', color: 'primary.main' }}>จัดการ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!fetching && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                    <ListAltIcon sx={{ fontSize: 60, color: 'text.disabled', mb: 2, opacity: 0.5 }} />
                    <Typography variant="h6" color="text.secondary" gutterBottom>ไม่พบข้อมูลฟิลด์</Typography>
                    <Typography variant="body2" color="text.secondary">ลองเปลี่ยนคำค้นหา หรือกดปุ่มเพิ่มฟิลด์ใหม่</Typography>
                  </TableCell>
                </TableRow>
              )}

              {filtered.map((f, idx) => (
                <TableRow key={f._id} hover sx={{ '&:hover': { bgcolor: '#f9fcff' } }}>
                  <TableCell align="center">
                    <Stack direction="column" alignItems="center" spacing={0}>
                        <IconButton size="small" onClick={() => moveField(findIndexById(filtered, f._id, fields), -1)} disabled={isFirst(filtered, f, fields) || busyReorder}>
                            <ArrowUpwardIcon fontSize="inherit" />
                        </IconButton>
                        <Typography variant="caption" fontWeight="bold" color="text.secondary">{f.order ?? idx + 1}</Typography>
                        <IconButton size="small" onClick={() => moveField(findIndexById(filtered, f._id, fields), 1)} disabled={isLast(filtered, f, fields) || busyReorder}>
                            <ArrowDownwardIcon fontSize="inherit" />
                        </IconButton>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ fontSize: '0.95rem' }}>{f.label}</Typography>
                    {f.type === 'select' && f.options?.length > 0 && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, bgcolor: '#eee', px: 1, borderRadius: 1, display: 'inline-block' }}>
                            Options: {f.options.slice(0, 3).join(", ")}{f.options.length > 3 ? "..." : ""}
                        </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip label={f.name} size="small" variant="outlined" sx={{ fontFamily: 'monospace', bgcolor: 'grey.50' }} />
                  </TableCell>
                  <TableCell>
                    <Chip 
                        icon={getIconByType(f.type)} 
                        label={f.type.charAt(0).toUpperCase() + f.type.slice(1)} 
                        size="small" 
                        color={getColorByType(f.type)}
                        sx={{ fontWeight: 500 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    {f.required ? 
                        <Chip label="Required" color="error" size="small" sx={{ height: 24, fontSize: '0.7rem', fontWeight: 'bold' }} /> 
                        : <Typography variant="caption" color="text.disabled">-</Typography>
                    }
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                        checked={!!f.enabled}
                        onChange={() => toggleEnabled(f)}
                        color="success"
                        disabled={busyId === f._id}
                        size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" justifyContent="center" spacing={1}>
                        <Tooltip title="แก้ไข">
                            <IconButton onClick={() => { setEditData(f); setDialogOpen(true); }} color="primary" size="small" sx={{ bgcolor: 'primary.lighter' }}>
                                <EditTwoToneIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="ลบ">
                            <IconButton onClick={() => handleDelete(f._id)} color="error" disabled={busyId === f._id} size="small" sx={{ bgcolor: 'error.lighter' }}>
                                <DeleteTwoToneIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
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
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} sx={{ boxShadow: 4 }}>
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

// ========= Enhanced Dialog =========
function FieldDialog({ open, data, onClose, onSave }) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [required, setRequired] = useState(false);
  const [enabled, setEnabled] = useState(true);
  
  // Options management
  const [optionsList, setOptionsList] = useState([]);
  const [currentOption, setCurrentOption] = useState("");
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);

  useEffect(() => {
    if (open) {
      setName(data?.name || "");
      setLabel(data?.label || "");
      setType(data?.type || "text");
      setRequired(!!data?.required);
      setEnabled(data?.enabled ?? true);
      setOptionsList(Array.isArray(data?.options) ? data.options : []);
      setIsNameManuallyEdited(!!data); // If editing, assume manual to prevent overwrite
    }
  }, [data, open]);

  // Smart Auto-fill Name from Label
  const handleLabelChange = (e) => {
    const val = e.target.value;
    setLabel(val);
    if (!isNameManuallyEdited && !data) {
        // Simple slugify: เปลี่ยนภาษาไทยหรือ space เป็น _ (ตัวอย่างคร่าวๆ)
        // ถ้าต้องการภาษาไทยเป็นอังกฤษ ต้องใช้ library เสริม แต่ทำแบบง่ายๆ ให้ตัดคำพิเศษออก
        const slug = val
            .toLowerCase()
            .replace(/ /g, '_')
            .replace(/[^\w-]/g, ''); // Remove non-word chars
        setName(slug);
    }
  };

  const handleNameChange = (e) => {
      setName(e.target.value);
      setIsNameManuallyEdited(true);
  }

  // Option Handling
  const handleAddOption = () => {
      if (currentOption.trim()) {
          if (!optionsList.includes(currentOption.trim())) {
              setOptionsList([...optionsList, currentOption.trim()]);
          }
          setCurrentOption("");
      }
  };

  const handleRemoveOption = (optToRemove) => {
      setOptionsList(optionsList.filter(o => o !== optToRemove));
  };

  const handleKeyDownOption = (e) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          handleAddOption();
      }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ name, label, type, required, enabled, options: optionsList });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: 'primary.main', color: '#fff', py: 2 }}>
          <PowerSettingsNewIcon />
          <Typography variant="h6">{data ? "แก้ไขฟิลด์ (Edit Field)" : "เพิ่มฟิลด์ใหม่ (New Field)"}</Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={3} sx={{ mt: 2 }}>
            
            {/* --- Section 1: Basic Info --- */}
            <Box>
                <Typography variant="caption" color="text.secondary" fontWeight="bold">ข้อมูลพื้นฐาน</Typography>
                <Divider sx={{ mb: 2, mt: 0.5 }} />
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                        <TextField
                        label="ชื่อฟิลด์ที่แสดง (Label)"
                        placeholder="เช่น เบอร์โทรศัพท์"
                        value={label}
                        onChange={handleLabelChange}
                        required
                        fullWidth
                        autoFocus
                        InputProps={{
                            startAdornment: <InputAdornment position="start" sx={{ color: 'text.disabled' }}>UI:</InputAdornment>,
                        }}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <TextField
                        label="รหัสอ้างอิง (API Name)"
                        value={name}
                        onChange={handleNameChange}
                        required
                        fullWidth
                        helperText="ภาษาอังกฤษ (Auto-fill)"
                        InputProps={{
                            startAdornment: <InputAdornment position="start" sx={{ color: 'text.disabled' }}>Key:</InputAdornment>,
                            endAdornment: !isNameManuallyEdited && name ? <InputAdornment position="end"><AutoFixHighIcon fontSize="small" color="action"/></InputAdornment> : null
                        }}
                        />
                    </Grid>
                </Grid>
            </Box>

            {/* --- Section 2: Data Type & Options --- */}
            <Box>
                <Typography variant="caption" color="text.secondary" fontWeight="bold">รูปแบบข้อมูล</Typography>
                <Divider sx={{ mb: 2, mt: 0.5 }} />
                
                <TextField
                    label="ประเภทข้อมูล (Data Type)"
                    select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    fullWidth
                    sx={{ mb: 2 }}
                >
                    <MenuItem value="text"><Stack direction="row" alignItems="center" gap={1}><TextFieldsIcon fontSize="small" color="action"/> ข้อความ (Text)</Stack></MenuItem>
                    <MenuItem value="number"><Stack direction="row" alignItems="center" gap={1}><NumbersIcon fontSize="small" color="info"/> ตัวเลข (Number)</Stack></MenuItem>
                    <MenuItem value="email"><Stack direction="row" alignItems="center" gap={1}><EmailIcon fontSize="small" color="secondary"/> อีเมล (Email)</Stack></MenuItem>
                    <MenuItem value="date"><Stack direction="row" alignItems="center" gap={1}><EventIcon fontSize="small" color="success"/> วันที่ (Date)</Stack></MenuItem>
                    <MenuItem value="select"><Stack direction="row" alignItems="center" gap={1}><ArrowDropDownCircleIcon fontSize="small" color="warning"/> ตัวเลือก (Select/Dropdown)</Stack></MenuItem>
                </TextField>

                {/* Option Management (Only for Select) */}
                {type === "select" && (
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f9f9f9', borderRadius: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>กำหนดตัวเลือก (Options)</Typography>
                        <Stack direction="row" spacing={1} mb={1}>
                            <TextField 
                                size="small" 
                                fullWidth 
                                placeholder="พิมพ์ตัวเลือก แล้วกด Enter หรือปุ่ม +" 
                                value={currentOption}
                                onChange={(e) => setCurrentOption(e.target.value)}
                                onKeyDown={handleKeyDownOption}
                            />
                            <Button variant="contained" onClick={handleAddOption} sx={{ minWidth: 40 }}><AddIcon /></Button>
                        </Stack>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, minHeight: 40 }}>
                            {optionsList.length === 0 && <Typography variant="caption" color="text.disabled" sx={{ py: 1 }}>ยังไม่มีตัวเลือก</Typography>}
                            {optionsList.map((opt, index) => (
                                <Chip 
                                    key={index} 
                                    label={opt} 
                                    onDelete={() => handleRemoveOption(opt)} 
                                    color="primary" 
                                    variant="outlined" 
                                    size="small"
                                />
                            ))}
                        </Box>
                    </Paper>
                )}
            </Box>

            {/* --- Section 3: Settings --- */}
            <Box>
                <Typography variant="caption" color="text.secondary" fontWeight="bold">การตั้งค่าเพิ่มเติม</Typography>
                <Divider sx={{ mb: 1, mt: 0.5 }} />
                <Stack direction="row" spacing={2}>
                    <Card variant="outlined" sx={{ flex: 1, p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setRequired(!required)}>
                        <Box>
                            <Typography variant="body2" fontWeight="bold">Required</Typography>
                            <Typography variant="caption" color="text.secondary">บังคับกรอก</Typography>
                        </Box>
                        <Switch checked={required} color="error" />
                    </Card>
                    <Card variant="outlined" sx={{ flex: 1, p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setEnabled(!enabled)}>
                        <Box>
                            <Typography variant="body2" fontWeight="bold">Enabled</Typography>
                            <Typography variant="caption" color="text.secondary">เปิดใช้งาน</Typography>
                        </Box>
                        <Switch checked={enabled} color="success" />
                    </Card>
                </Stack>
            </Box>

          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 1 }}>
          <Button onClick={onClose} color="inherit" sx={{ borderRadius: 2 }}>ยกเลิก</Button>
          <Button type="submit" variant="contained" startIcon={<SaveIcon />} sx={{ px: 3, borderRadius: 2 }}>
            {data ? "บันทึกการแก้ไข" : "สร้างฟิลด์"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}