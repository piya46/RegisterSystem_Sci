import React, { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Typography, Button, Stack, TextField, Switch, FormControlLabel,
  Snackbar, Alert, Divider, CircularProgress, Tabs, Tab, Chip, IconButton
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import useAuth from "../hooks/useAuth";
import * as api from "../utils/api";
import { useNavigate } from "react-router-dom";

export default function SystemSettingsPage() {
  const { user, token, loading } = useAuth();
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
  const [fields, setFields] = useState([]);
  const [fieldDialog, setFieldDialog] = useState({ open: false, data: null });
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const navigate = useNavigate();

  // --- Mock API ---
  const getSystemSettings = async () => ({
    data: {
      eventName: "งาน Open House",
      enableRegister: true,
      maintenanceMode: false,
      contactEmail: "contact@event.com",
      welcomeMessage: "ยินดีต้อนรับเข้าสู่ระบบ"
    }
  });
  const updateSystemSettings = async (data) => ({ data });
  // ใช้ API จริงในโปรดักชัน: api.listParticipantFields, api.createParticipantField, ...

  // ---- Auth/Permission ----
  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      navigate("/login", { replace: true });
      return;
    }
    if (!(Array.isArray(user.role) ? user.role.includes("admin") : user.role === "admin")) {
      navigate("/unauthorized", { replace: true });
      return;
    }
    setFetching(true);
    getSystemSettings(token)
      .then(res => setSettings(res.data))
      .finally(() => setFetching(false));
    api.listParticipantFields(token)
      .then(res => setFields(res.data))
      .catch(() => setFields([]));
    // eslint-disable-next-line
  }, [user, token, loading, navigate]);

  // ---- Settings (ทั่วไป) ----
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
      setSnackbar({ open: true, message: "บันทึกสำเร็จ", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "บันทึกไม่สำเร็จ", severity: "error" });
    }
    setSaving(false);
  };

  // ---- Field CRUD ----
  const handleFieldSave = async (field) => {
    if (field._id) {
      await api.updateParticipantField(field._id, field, token);
      setSnackbar({ open: true, message: "แก้ไขฟิลด์สำเร็จ", severity: "success" });
    } else {
      await api.createParticipantField(field, token);
      setSnackbar({ open: true, message: "เพิ่มฟิลด์สำเร็จ", severity: "success" });
    }
    const res = await api.listParticipantFields(token);
    setFields(res.data);
    setFieldDialog({ open: false, data: null });
  };
  const handleFieldDelete = async (id) => {
    if (!window.confirm("ยืนยันการลบฟิลด์นี้?")) return;
    await api.deleteParticipantField(id, token);
    const res = await api.listParticipantFields(token);
    setFields(res.data);
    setSnackbar({ open: true, message: "ลบฟิลด์สำเร็จ", severity: "success" });
  };

  if (loading || fetching)
    return (
      <Box p={4} sx={{ textAlign: "center" }}>
        <CircularProgress color="primary" />
      </Box>
    );

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", mt: 4 }}>
      <Card sx={{ borderRadius: 4, p: 2 }}>
        <CardContent>
          <Typography variant="h5" fontWeight="bold" color="primary" mb={2}>
            ตั้งค่าระบบ
          </Typography>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="ตั้งค่าทั่วไป" />
            <Tab label="ฟิลด์สำหรับลงทะเบียน" />
          </Tabs>
          {tab === 0 && (
            <>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={3}>
                <TextField label="ชื่องานอีเวนต์" name="eventName" value={settings.eventName} onChange={handleChange} fullWidth required />
                <FormControlLabel
                  control={
                    <Switch checked={settings.enableRegister} onChange={handleChange} name="enableRegister" color="primary" />
                  }
                  label="เปิดให้ลงทะเบียน"
                />
                <FormControlLabel
                  control={
                    <Switch checked={settings.maintenanceMode} onChange={handleChange} name="maintenanceMode" color="error" />
                  }
                  label="โหมดปิดปรับปรุง (Maintenance)"
                />
                <TextField label="อีเมลติดต่อ" name="contactEmail" value={settings.contactEmail} onChange={handleChange} fullWidth />
                <TextField label="ข้อความต้อนรับ" name="welcomeMessage" value={settings.welcomeMessage} onChange={handleChange} multiline rows={2} fullWidth />
              </Stack>
              <Stack direction="row" spacing={2} mt={3} justifyContent="flex-end">
                <Button variant="outlined" color="info" startIcon={<RefreshIcon />} onClick={() => window.location.reload()}>
                  รีเฟรช
                </Button>
                <Button variant="contained" color="primary" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving}>
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </Button>
                <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate("/dashboard")}>
                  กลับหน้าหลัก
                </Button>
              </Stack>
            </>
          )}
          {tab === 1 && (
            <>
              <Divider sx={{ mb: 2 }} />
              <Box mb={2} display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight="bold">
                  จัดการฟิลด์สำหรับแบบฟอร์มลงทะเบียน
                </Typography>
                <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setFieldDialog({ open: true, data: null })}>
                  เพิ่มฟิลด์
                </Button>
              </Box>
              <Box>
                {fields.length === 0 ? (
                  <Typography color="text.secondary">ยังไม่มีฟิลด์</Typography>
                ) : (
                  fields.map(field => (
                    <Card key={field._id} sx={{ mb: 1, p: 1.5, borderRadius: 2 }}>
                      <Stack direction="row" alignItems="center" spacing={2}>
                        <Chip label={field.type || "text"} size="small" />
                        <Typography variant="subtitle2" sx={{ flex: 1 }}>
                          {field.label} {field.required && <Chip label="จำเป็น" color="error" size="small" sx={{ ml: 1 }} />}
                        </Typography>
                        <IconButton onClick={() => setFieldDialog({ open: true, data: field })} color="primary" size="small">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton onClick={() => handleFieldDelete(field._id)} color="error" size="small">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Card>
                  ))
                )}
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog เพิ่ม/แก้ไขฟิลด์ */}
      <FieldDialog
        open={fieldDialog.open}
        data={fieldDialog.data}
        onClose={() => setFieldDialog({ open: false, data: null })}
        onSave={handleFieldSave}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={2500}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
      >
        <Alert severity={snackbar.severity} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// -- Dialog เพิ่ม/แก้ไขฟิลด์ --
function FieldDialog({ open, data, onClose, onSave }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [required, setRequired] = useState(false);

  useEffect(() => {
    setLabel(data?.label || "");
    setType(data?.type || "text");
    setRequired(data?.required || false);
  }, [data]);

  const handleSubmit = e => {
    e.preventDefault();
    if (!label) return;
    onSave({ ...data, label, type, required });
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{data ? "แก้ไขฟิลด์" : "เพิ่มฟิลด์"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} minWidth={260}>
            <TextField label="ป้ายกำกับ/ชื่อฟิลด์" value={label} onChange={e => setLabel(e.target.value)} required />
            <TextField
              label="ประเภท"
              select
              value={type}
              onChange={e => setType(e.target.value)}
              SelectProps={{ native: true }}
            >
              <option value="text">ข้อความ</option>
              <option value="number">ตัวเลข</option>
              <option value="select">ตัวเลือก</option>
              <option value="email">Email</option>
              {/* เพิ่ม type ได้ตามต้องการ */}
            </TextField>
            <FormControlLabel
              control={<Switch checked={required} onChange={e => setRequired(e.target.checked)} color="error" />}
              label="จำเป็นต้องกรอก"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" variant="contained">{data ? "บันทึก" : "เพิ่ม"}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
