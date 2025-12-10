import React, { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  TextField,
  Switch,
  FormControlLabel,
  Snackbar,
  Alert,
  Divider,
  CircularProgress,
  Tabs,
  Tab,
  Chip,
  IconButton,
  Grid,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  Tooltip,
  useTheme
} from "@mui/material";

// Icons
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import EditTwoToneIcon from "@mui/icons-material/EditTwoTone";
import DeleteTwoToneIcon from "@mui/icons-material/DeleteTwoTone";
import SettingsSuggestIcon from "@mui/icons-material/SettingsSuggest";
import ListAltIcon from "@mui/icons-material/ListAlt";
import EventIcon from "@mui/icons-material/Event";
import EmailIcon from "@mui/icons-material/Email";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import NumbersIcon from "@mui/icons-material/Numbers";
import ArrowDropDownCircleIcon from "@mui/icons-material/ArrowDropDownCircle";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import BuildIcon from "@mui/icons-material/Build";

import useAuth from "../hooks/useAuth";
import * as api from "../utils/api";
import { useNavigate } from "react-router-dom";

export default function SystemSettingsPage() {
  const { user, token, loading } = useAuth();
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const [settings, setSettings] = useState({
    eventName: "",
    enableRegister: true,
    maintenanceMode: false,
    contactEmail: "",
    welcomeMessage: ""
  });
  
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Field States
  const [fields, setFields] = useState([]);
  const [fieldDialog, setFieldDialog] = useState({ open: false, data: null });
  
  // Feedback
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  
  const navigate = useNavigate();

  // --- Mock API Wrapper for Demo ---
  const getSystemSettings = async () => ({
    data: {
      eventName: "Open House 2024",
      enableRegister: true,
      maintenanceMode: false,
      contactEmail: "admin@university.ac.th",
      welcomeMessage: "ยินดีต้อนรับน้องๆ ทุกคนเข้าสู่ระบบลงทะเบียน"
    }
  });
  const updateSystemSettings = async (data) => ({ data });

  // ---- Auth/Permission ----
  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      navigate("/login", { replace: true });
      return;
    }
    // Check Role (ปรับตาม logic จริงของคุณ)
    const isAdmin = Array.isArray(user.role) ? user.role.includes("admin") : user.role === "admin";
    if (!isAdmin) {
      navigate("/unauthorized", { replace: true });
      return;
    }

    setFetching(true);
    // Fetch Settings
    getSystemSettings(token)
      .then(res => setSettings(res.data))
      .catch(err => console.error(err))
      .finally(() => setFetching(false));

    // Fetch Fields
    api.listParticipantFields(token)
      .then(res => setFields(res.data))
      .catch(() => setFields([]));
      
    // eslint-disable-next-line
  }, [user, token, loading, navigate]);

  // ---- Handlers ----
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSystemSettings(settings, token);
      setSnackbar({ open: true, message: "บันทึกการตั้งค่าระบบเรียบร้อยแล้ว", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "เกิดข้อผิดพลาดในการบันทึก", severity: "error" });
    }
    setSaving(false);
  };

  const handleFieldSave = async (field) => {
    try {
      if (field._id) {
        await api.updateParticipantField(field._id, field, token);
        setSnackbar({ open: true, message: "อัปเดตข้อมูลฟิลด์สำเร็จ", severity: "success" });
      } else {
        await api.createParticipantField(field, token);
        setSnackbar({ open: true, message: "สร้างฟิลด์ใหม่สำเร็จ", severity: "success" });
      }
      const res = await api.listParticipantFields(token);
      setFields(res.data);
      setFieldDialog({ open: false, data: null });
    } catch (error) {
      setSnackbar({ open: true, message: "ไม่สามารถบันทึกฟิลด์ได้", severity: "error" });
    }
  };

  const handleFieldDelete = async (id) => {
    if (!window.confirm("คุณแน่ใจหรือไม่ที่จะลบฟิลด์นี้? ข้อมูลที่ผู้ใช้เคยกรอกในฟิลด์นี้อาจสูญหาย")) return;
    try {
      await api.deleteParticipantField(id, token);
      const res = await api.listParticipantFields(token);
      setFields(res.data);
      setSnackbar({ open: true, message: "ลบฟิลด์เรียบร้อยแล้ว", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "ลบฟิลด์ไม่สำเร็จ", severity: "error" });
    }
  };

  if (loading || fetching)
    return (
      <Box height="80vh" display="flex" flexDirection="column" justifyContent="center" alignItems="center">
        <CircularProgress size={60} thickness={4} />
        <Typography variant="body1" sx={{ mt: 2, color: "text.secondary" }}>กำลังโหลดข้อมูลระบบ...</Typography>
      </Box>
    );

  return (
    <Box sx={{ maxWidth: 1000, mx: "auto", py: 4, px: 2 }}>
      {/* Header Section */}
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight="800" gutterBottom sx={{ background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`, backgroundClip: "text", textFillColor: "transparent", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            System Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ตั้งค่าระบบงานและจัดการแบบฟอร์มลงทะเบียน
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate("/dashboard")} sx={{ borderRadius: 2, textTransform: "none", mt: { xs: 2, sm: 0 } }}>
          กลับสู่ Dashboard
        </Button>
      </Stack>

      <Paper elevation={0} sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, overflow: "hidden" }}>
        <Tabs 
          value={tab} 
          onChange={(_, v) => setTab(v)} 
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}
        >
          <Tab icon={<SettingsSuggestIcon />} iconPosition="start" label="ตั้งค่าทั่วไป (General)" sx={{ py: 3, fontSize: '1rem' }} />
          <Tab icon={<ListAltIcon />} iconPosition="start" label="จัดการฟิลด์ (Form Fields)" sx={{ py: 3, fontSize: '1rem' }} />
        </Tabs>

        {/* Tab 0: General Settings */}
        {tab === 0 && (
          <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: "#fafafa" }}>
            <Grid container spacing={3}>
              {/* Event Information Card */}
              <Grid item xs={12} md={7}>
                <Card sx={{ height: "100%", borderRadius: 2, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EventIcon color="primary" /> ข้อมูลงานอีเวนต์
                    </Typography>
                    <Divider sx={{ mb: 3 }} />
                    <Stack spacing={3}>
                      <TextField 
                        label="ชื่องานอีเวนต์" 
                        name="eventName" 
                        value={settings.eventName} 
                        onChange={handleChange} 
                        fullWidth 
                        required 
                        variant="outlined"
                        InputProps={{ sx: { borderRadius: 2 } }}
                        helperText="ชื่อที่จะแสดงในหน้าลงทะเบียนและอีเมล"
                      />
                      <TextField 
                        label="อีเมลติดต่อ (Support Email)" 
                        name="contactEmail" 
                        value={settings.contactEmail} 
                        onChange={handleChange} 
                        fullWidth
                        InputProps={{ 
                          startAdornment: <InputAdornment position="start"><EmailIcon color="action" /></InputAdornment>,
                          sx: { borderRadius: 2 } 
                        }}
                      />
                      <TextField 
                        label="ข้อความต้อนรับ (Welcome Message)" 
                        name="welcomeMessage" 
                        value={settings.welcomeMessage} 
                        onChange={handleChange} 
                        multiline 
                        rows={3} 
                        fullWidth 
                        InputProps={{ sx: { borderRadius: 2 } }}
                        placeholder="เช่น ยินดีต้อนรับเข้าสู่..."
                      />
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              {/* System Status Card */}
              <Grid item xs={12} md={5}>
                <Card sx={{ height: "100%", borderRadius: 2, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <BuildIcon color="secondary" /> สถานะระบบ
                    </Typography>
                    <Divider sx={{ mb: 3 }} />
                    
                    <Box sx={{ mb: 3, p: 2, borderRadius: 2, bgcolor: settings.enableRegister ? "success.lighter" : "grey.100", border: "1px solid", borderColor: settings.enableRegister ? "success.light" : "grey.300" }}>
                      <FormControlLabel
                        control={<Switch checked={settings.enableRegister} onChange={handleChange} name="enableRegister" color="success" />}
                        label={<Typography fontWeight="bold">เปิดระบบลงทะเบียน</Typography>}
                      />
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5, ml: 4 }}>
                        {settings.enableRegister ? "ผู้ใช้ทั่วไปสามารถเข้าถึงและลงทะเบียนได้" : "ปิดรับการลงทะเบียนชั่วคราว"}
                      </Typography>
                    </Box>

                    <Box sx={{ p: 2, borderRadius: 2, bgcolor: settings.maintenanceMode ? "error.lighter" : "grey.100", border: "1px solid", borderColor: settings.maintenanceMode ? "error.light" : "grey.300" }}>
                      <FormControlLabel
                        control={<Switch checked={settings.maintenanceMode} onChange={handleChange} name="maintenanceMode" color="error" />}
                        label={<Typography fontWeight="bold" color={settings.maintenanceMode ? "error" : "textPrimary"}>โหมดปิดปรับปรุง (Maintenance)</Typography>}
                      />
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5, ml: 4 }}>
                        เมื่อเปิดใช้งาน ผู้ใช้จะไม่สามารถเข้าใช้งานระบบได้ทุกส่วน
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Actions */}
            <Paper sx={{ position: 'sticky', bottom: 0, mt: 3, p: 2, zIndex: 10, display: 'flex', justifyContent: 'flex-end', gap: 2, borderTop: '1px solid #eee' }}>
               <Button variant="text" color="inherit" startIcon={<RefreshIcon />} onClick={() => window.location.reload()}>
                  ยกเลิก/รีโหลด
                </Button>
                <Button 
                  variant="contained" 
                  size="large"
                  startIcon={saving ? <CircularProgress size={20} color="inherit"/> : <SaveIcon />} 
                  onClick={handleSave} 
                  disabled={saving}
                  sx={{ px: 4, borderRadius: 2, boxShadow: 4 }}
                >
                  {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
                </Button>
            </Paper>
          </Box>
        )}

        {/* Tab 1: Field Management */}
        {tab === 1 && (
          <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: "#fafafa", minHeight: 400 }}>
            <Box mb={3} display="flex" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="h6" fontWeight="bold">แบบฟอร์มลงทะเบียน</Typography>
                <Typography variant="body2" color="text.secondary">กำหนดข้อมูลที่ต้องการเก็บจากผู้เข้าร่วมงาน</Typography>
              </Box>
              <Button 
                variant="contained" 
                startIcon={<AddCircleOutlineIcon />} 
                onClick={() => setFieldDialog({ open: true, data: null })}
                sx={{ borderRadius: 2, textTransform: "none" }}
              >
                เพิ่มฟิลด์ใหม่
              </Button>
            </Box>

            <Grid container spacing={2}>
              {fields.length === 0 ? (
                <Grid item xs={12}>
                  <Box sx={{ textAlign: "center", py: 8, bgcolor: "#fff", borderRadius: 2, border: "1px dashed #ccc" }}>
                    <ListAltIcon sx={{ fontSize: 60, color: "text.disabled", mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">ยังไม่มีการกำหนดฟิลด์</Typography>
                    <Typography variant="body2" color="text.secondary">กดปุ่ม "เพิ่มฟิลด์ใหม่" เพื่อเริ่มสร้างแบบฟอร์ม</Typography>
                  </Box>
                </Grid>
              ) : (
                fields.map((field, index) => (
                  <Grid item xs={12} key={field._id || index}>
                    <Card 
                      variant="outlined" 
                      sx={{ 
                        p: 1, 
                        borderRadius: 2, 
                        display: 'flex', 
                        alignItems: 'center',
                        transition: '0.2s',
                        '&:hover': { borderColor: 'primary.main', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }
                      }}
                    >
                      {/* Icon based on type */}
                      <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'primary.lighter', color: 'primary.main', mr: 2, display: 'flex' }}>
                         {field.type === 'number' ? <NumbersIcon /> : field.type === 'select' ? <ArrowDropDownCircleIcon /> : <TextFieldsIcon />}
                      </Box>
                      
                      <Box sx={{ flex: 1 }}>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Typography variant="subtitle1" fontWeight="bold">{field.label}</Typography>
                          {field.required && <Chip label="Required" color="error" size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 'bold' }} />}
                        </Stack>
                        <Stack direction="row" gap={2} mt={0.5}>
                          <Typography variant="caption" color="text.secondary">Type: <strong>{field.type}</strong></Typography>
                          {/* Mock show options if select */}
                          {field.type === 'select' && <Typography variant="caption" color="text.secondary">Options: {field.options?.length || 0}</Typography>}
                        </Stack>
                      </Box>

                      <Stack direction="row">
                        <Tooltip title="แก้ไข">
                          <IconButton onClick={() => setFieldDialog({ open: true, data: field })} color="primary">
                            <EditTwoToneIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="ลบ">
                          <IconButton onClick={() => handleFieldDelete(field._id)} color="error">
                            <DeleteTwoToneIcon />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Card>
                  </Grid>
                ))
              )}
            </Grid>
          </Box>
        )}
      </Paper>

      {/* Field Dialog */}
      <FieldDialog
        open={fieldDialog.open}
        data={fieldDialog.data}
        onClose={() => setFieldDialog({ open: false, data: null })}
        onSave={handleFieldSave}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// -- Sub Component: Field Dialog --
function FieldDialog({ open, data, onClose, onSave }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [required, setRequired] = useState(false);
  // Optional: Add logic for 'options' if type is select
  const [optionsStr, setOptionsStr] = useState(""); 

  useEffect(() => {
    if (open) {
        setLabel(data?.label || "");
        setType(data?.type || "text");
        setRequired(data?.required || false);
        setOptionsStr(data?.options ? data.options.join(",") : "");
    }
  }, [data, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    
    const payload = { ...data, label, type, required };
    if (type === 'select') {
        payload.options = optionsStr.split(",").map(s => s.trim()).filter(Boolean);
    }
    onSave(payload);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'primary.main', color: '#fff' }}>
            <PowerSettingsNewIcon /> {data ? "แก้ไขฟิลด์ (Edit Field)" : "เพิ่มฟิลด์ใหม่ (Add Field)"}
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Stack spacing={3} mt={1}>
            <TextField 
                label="ชื่อฟิลด์ / คำถาม (Label)" 
                placeholder="เช่น ชื่อ-นามสกุล, เบอร์โทรศัพท์"
                value={label} 
                onChange={e => setLabel(e.target.value)} 
                fullWidth 
                required 
                variant="outlined"
            />
            
            <TextField
              label="รูปแบบข้อมูล (Input Type)"
              select
              value={type}
              onChange={e => setType(e.target.value)}
              SelectProps={{ native: true }}
              fullWidth
              variant="outlined"
            >
              <option value="text">ข้อความ (Text)</option>
              <option value="number">ตัวเลข (Number)</option>
              <option value="email">อีเมล (Email)</option>
              <option value="date">วันที่ (Date)</option>
              <option value="select">ตัวเลือก (Dropdown)</option>
            </TextField>

            {type === 'select' && (
                 <TextField 
                 label="ตัวเลือก (คั่นด้วยจุลภาค)" 
                 placeholder="เช่น ชาย, หญิง, ไม่ระบุ"
                 value={optionsStr} 
                 onChange={e => setOptionsStr(e.target.value)} 
                 fullWidth 
                 helperText="ใส่ตัวเลือกที่ต้องการให้ผู้ใช้เลือก คั่นด้วยเครื่องหมาย ,"
                 multiline
                 rows={2}
             />
            )}

            <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                    <Typography variant="body2" fontWeight="bold">จำเป็นต้องระบุ</Typography>
                    <Typography variant="caption" color="text.secondary">ผู้ใช้ข้ามฟิลด์นี้ไม่ได้</Typography>
                </Box>
                <Switch checked={required} onChange={e => setRequired(e.target.checked)} color="error" />
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={onClose} color="inherit">ยกเลิก</Button>
          <Button type="submit" variant="contained" sx={{ px: 3, borderRadius: 2 }}>
              {data ? "บันทึกการแก้ไข" : "สร้างฟิลด์"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}