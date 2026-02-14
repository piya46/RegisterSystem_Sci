import React, { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Typography, Button, Stack, TextField, Switch, FormControlLabel, Snackbar, Alert, Divider, CircularProgress, Tabs, Tab, Chip, IconButton, Grid, Paper, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment, useTheme
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import EditTwoToneIcon from "@mui/icons-material/EditTwoTone";
import DeleteTwoToneIcon from "@mui/icons-material/DeleteTwoTone";
import SettingsSuggestIcon from "@mui/icons-material/SettingsSuggest";
import ListAltIcon from "@mui/icons-material/ListAlt";
import InventoryIcon from "@mui/icons-material/Inventory";
import EventIcon from "@mui/icons-material/Event";
import EmailIcon from "@mui/icons-material/Email";
import BuildIcon from "@mui/icons-material/Build";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import NumbersIcon from "@mui/icons-material/Numbers";
import ArrowDropDownCircleIcon from "@mui/icons-material/ArrowDropDownCircle";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import useAuth from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { getSystemSettings, updateSystemSettings, listParticipantFields, createParticipantField, updateParticipantField, deleteParticipantField, listPackages, createPackage, updatePackage, deletePackage } from "../utils/api";

export default function SystemSettingsPage() {
  const { user, loading } = useAuth();
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  
  const [settings, setSettings] = useState({
    eventName: "", enableRegister: true, maintenanceMode: false, contactEmail: "", welcomeMessage: "",
    preRegStartDate: "", preRegEndDate: "", kioskStartDate: "", kioskEndDate: ""
  });
  
  const [packages, setPackages] = useState([]);
  const [pkgDialog, setPkgDialog] = useState({ open: false, data: null });
  const [fields, setFields] = useState([]);
  const [fieldDialog, setFieldDialog] = useState({ open: false, data: null });
  
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user || (!user.role.includes("admin") && user.role !== "admin")) {
      navigate("/unauthorized");
      return;
    }

    setFetching(true);
    Promise.all([ getSystemSettings(), listParticipantFields(), listPackages() ])
    .then(([resSettings, resFields, resPackages]) => {
      if(resSettings.data?.data) {
        const d = resSettings.data.data;
        setSettings({
            ...d,
            preRegStartDate: d.preRegStartDate ? new Date(d.preRegStartDate).toISOString().slice(0,16) : "",
            preRegEndDate: d.preRegEndDate ? new Date(d.preRegEndDate).toISOString().slice(0,16) : "",
            kioskStartDate: d.kioskStartDate ? new Date(d.kioskStartDate).toISOString().slice(0,16) : "",
            kioskEndDate: d.kioskEndDate ? new Date(d.kioskEndDate).toISOString().slice(0,16) : ""
        });
      }
      setFields(resFields.data || []);
      setPackages(resPackages.data?.data || []);
    })
    .catch(() => setSnackbar({ open: true, message: "เกิดข้อผิดพลาดในการโหลดข้อมูล", severity: "error" }))
    .finally(() => setFetching(false));
  }, [user, loading, navigate]);

  const handleSettingsChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await updateSystemSettings(settings);
      setSnackbar({ open: true, message: "บันทึกการตั้งค่าสำเร็จ", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "บันทึกไม่สำเร็จ", severity: "error" });
    }
    setSaving(false);
  };

  const handleFieldSave = async (field) => {
    try {
      if (field._id) { await updateParticipantField(field._id, field); } 
      else { await createParticipantField(field); }
      const res = await listParticipantFields();
      setFields(res.data);
      setFieldDialog({ open: false, data: null });
      setSnackbar({ open: true, message: "บันทึกฟิลด์สำเร็จ", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "บันทึกฟิลด์ไม่สำเร็จ", severity: "error" });
    }
  };

  const handleFieldDelete = async (id) => {
    if (!window.confirm("คุณแน่ใจหรือไม่ที่จะลบฟิลด์นี้?")) return;
    try {
      await deleteParticipantField(id);
      const res = await listParticipantFields();
      setFields(res.data);
      setSnackbar({ open: true, message: "ลบฟิลด์เรียบร้อย", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "ลบฟิลด์ไม่สำเร็จ", severity: "error" });
    }
  };

  const loadPackages = async () => {
      const res = await listPackages();
      setPackages(res.data?.data || []);
  };

  const handleSavePackage = async (payload) => {
      try {
          if (payload._id) await updatePackage(payload._id, payload);
          else await createPackage(payload);
          setSnackbar({ open: true, message: "บันทึกแพ็กเกจสำเร็จ", severity: "success" });
          setPkgDialog({ open: false, data: null });
          loadPackages();
      } catch {
          setSnackbar({ open: true, message: "บันทึกแพ็กเกจไม่สำเร็จ", severity: "error" });
      }
  };

  const handleDeletePackage = async (id) => {
      if(!window.confirm("ต้องการลบแพ็กเกจนี้ใช่หรือไม่?")) return;
      try {
          await deletePackage(id);
          setSnackbar({ open: true, message: "ลบแพ็กเกจสำเร็จ", severity: "success" });
          loadPackages();
      } catch {
          setSnackbar({ open: true, message: "ลบแพ็กเกจไม่สำเร็จ", severity: "error" });
      }
  };

  if (loading || fetching) return <Box p={5} textAlign="center"><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 1000, mx: "auto", py: 4, px: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight="800" sx={{ color: theme.palette.primary.main }}>System Settings</Typography>
          <Typography variant="body2" color="text.secondary">ตั้งค่าระบบ เวลาเปิด-ปิด และสต๊อกของ</Typography>
        </Box>
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate("/dashboard")} sx={{ mt: { xs: 2, sm: 0 } }}>กลับ Dashboard</Button>
      </Stack>

      <Paper elevation={0} sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, overflow: "hidden" }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
          <Tab icon={<SettingsSuggestIcon />} label="ตั้งค่าทั่วไป" />
          <Tab icon={<ListAltIcon />} label="จัดการฟิลด์" />
          <Tab icon={<InventoryIcon />} label="จัดการแพ็กเกจ" />
        </Tabs>

        {/* Tab 0: General */}
        {tab === 0 && (
          <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: "#fafafa" }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={7}>
                <Card sx={{ height: "100%", borderRadius: 2 }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><EventIcon color="primary" /> ข้อมูลงานอีเวนต์</Typography>
                    <Divider sx={{ mb: 3 }} />
                    <Stack spacing={3}>
                      <TextField label="ชื่องานอีเวนต์" name="eventName" value={settings.eventName} onChange={handleSettingsChange} fullWidth />
                      <TextField label="อีเมลติดต่อ" name="contactEmail" value={settings.contactEmail} onChange={handleSettingsChange} fullWidth InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon /></InputAdornment> }} />
                      
                      <Typography variant="subtitle2" color="text.secondary" mt={2}>เวลาลงทะเบียนล่วงหน้า (Pre-Register)</Typography>
                      <Stack direction="row" spacing={2}>
                        <TextField label="เวลาเปิด" type="datetime-local" name="preRegStartDate" value={settings.preRegStartDate} onChange={handleSettingsChange} fullWidth InputLabelProps={{ shrink: true }} />
                        <TextField label="เวลาปิด" type="datetime-local" name="preRegEndDate" value={settings.preRegEndDate} onChange={handleSettingsChange} fullWidth InputLabelProps={{ shrink: true }} />
                      </Stack>

                      <Typography variant="subtitle2" color="text.secondary" mt={2}>เวลาลงทะเบียนหน้างาน (Kiosk)</Typography>
                      <Stack direction="row" spacing={2}>
                        <TextField label="เวลาเปิด" type="datetime-local" name="kioskStartDate" value={settings.kioskStartDate} onChange={handleSettingsChange} fullWidth InputLabelProps={{ shrink: true }} />
                        <TextField label="เวลาปิด" type="datetime-local" name="kioskEndDate" value={settings.kioskEndDate} onChange={handleSettingsChange} fullWidth InputLabelProps={{ shrink: true }} />
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={5}>
                <Card sx={{ height: "100%", borderRadius: 2 }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><BuildIcon color="secondary" /> สถานะระบบ</Typography>
                    <Divider sx={{ mb: 3 }} />
                    <Box sx={{ mb: 3, p: 2, borderRadius: 2, bgcolor: settings.enableRegister ? "success.lighter" : "grey.100", border: "1px solid", borderColor: settings.enableRegister ? "success.light" : "grey.300" }}>
                      <FormControlLabel control={<Switch checked={settings.enableRegister} onChange={handleSettingsChange} name="enableRegister" color="success" />} label={<Typography fontWeight="bold">เปิดให้ลงทะเบียน</Typography>} />
                    </Box>
                    <Box sx={{ p: 2, borderRadius: 2, bgcolor: settings.maintenanceMode ? "error.lighter" : "grey.100", border: "1px solid", borderColor: settings.maintenanceMode ? "error.light" : "grey.300" }}>
                      <FormControlLabel control={<Switch checked={settings.maintenanceMode} onChange={handleSettingsChange} name="maintenanceMode" color="error" />} label={<Typography fontWeight="bold">โหมดปิดปรับปรุง (Maintenance)</Typography>} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            <Paper sx={{ mt: 3, p: 2, display: 'flex', justifyContent: 'flex-end', gap: 2, borderTop: '1px solid #eee' }}>
                <Button variant="contained" size="large" startIcon={saving ? <CircularProgress size={20}/> : <SaveIcon />} onClick={handleSaveSettings} disabled={saving} sx={{ px: 4, borderRadius: 2 }}>บันทึกการตั้งค่า</Button>
            </Paper>
          </Box>
        )}

        {/* Tab 1: Fields */}
        {tab === 1 && (
          <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: "#fafafa", minHeight: 400 }}>
            <Box mb={3} display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" fontWeight="bold">แบบฟอร์มลงทะเบียน</Typography>
              <Button variant="contained" startIcon={<AddCircleOutlineIcon />} onClick={() => setFieldDialog({ open: true, data: null })}>เพิ่มฟิลด์ใหม่</Button>
            </Box>
            <Grid container spacing={2}>
              {fields.map((field) => (
                <Grid item xs={12} key={field._id}>
                  <Card variant="outlined" sx={{ p: 1, borderRadius: 2, display: 'flex', alignItems: 'center' }}>
                    <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'primary.lighter', color: 'primary.main', mr: 2 }}>
                       {field.type === 'number' ? <NumbersIcon /> : field.type === 'select' ? <ArrowDropDownCircleIcon /> : <TextFieldsIcon />}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <Typography variant="subtitle1" fontWeight="bold">{field.label}</Typography>
                        {field.required && <Chip label="Required" color="error" size="small" sx={{ height: 20 }} />}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">Type: <strong>{field.type}</strong></Typography>
                    </Box>
                    <Stack direction="row">
                      <IconButton onClick={() => setFieldDialog({ open: true, data: field })} color="primary"><EditTwoToneIcon /></IconButton>
                      <IconButton onClick={() => handleFieldDelete(field._id)} color="error"><DeleteTwoToneIcon /></IconButton>
                    </Stack>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {/* Tab 2: Packages */}
        {tab === 2 && (
          <Box sx={{ p: 4, bgcolor: "#fafafa", minHeight: 400 }}>
             <Box mb={3} display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" fontWeight="bold">จัดการแพ็กเกจสนับสนุนและสต๊อก</Typography>
              <Button variant="contained" color="secondary" startIcon={<AddCircleOutlineIcon />} onClick={() => setPkgDialog({ open: true, data: null })}>เพิ่มแพ็กเกจใหม่</Button>
            </Box>
            <Grid container spacing={3}>
                {packages.map((pkg) => (
                    <Grid item xs={12} md={6} key={pkg._id}>
                        <Card variant="outlined" sx={{ borderRadius: 2 }}>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold" color="secondary.main">{pkg.name}</Typography>
                                <Typography variant="body2" color="text.secondary" mb={2}>ราคา: {pkg.price} บาท</Typography>
                                <Typography variant="caption" display="block" mb={2}>{pkg.description}</Typography>
                                <Divider sx={{ mb: 2 }} />
                                <Typography variant="body2" fontWeight="bold" mb={1}>สต๊อกสินค้า (ไซส์เสื้อ):</Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    {pkg.items[0]?.sizes?.map((sz, i) => (
                                        <Chip key={i} label={`${sz.size}: ${sz.stock - sz.sold}/${sz.stock}`} size="small" color={sz.stock - sz.sold > 10 ? "success" : sz.stock - sz.sold > 0 ? "warning" : "error"} sx={{ mb: 1 }} />
                                    ))}
                                </Stack>
                            </CardContent>
                            <Box sx={{ p: 1, display: 'flex', justifyContent: 'flex-end', gap: 1, borderTop: '1px solid #eee', bgcolor: '#f9f9f9' }}>
                                <Button size="small" variant="outlined" onClick={() => setPkgDialog({ open: true, data: pkg })}>แก้ไข</Button>
                                <Button size="small" variant="outlined" color="error" onClick={() => handleDeletePackage(pkg._id)}>ลบ</Button>
                            </Box>
                        </Card>
                    </Grid>
                ))}
            </Grid>
          </Box>
        )}
      </Paper>
      
      <FieldDialog open={fieldDialog.open} data={fieldDialog.data} onClose={() => setFieldDialog({ open: false, data: null })} onSave={handleFieldSave} />
      <PackageDialog open={pkgDialog.open} data={pkgDialog.data} onClose={() => setPkgDialog({ open: false, data: null })} onSave={handleSavePackage} />

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

function FieldDialog({ open, data, onClose, onSave }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [required, setRequired] = useState(false);
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
    if (type === 'select') payload.options = optionsStr.split(",").map(s => s.trim()).filter(Boolean);
    onSave(payload);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'primary.main', color: '#fff' }}><PowerSettingsNewIcon /> {data ? "แก้ไขฟิลด์" : "เพิ่มฟิลด์ใหม่"}</DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Stack spacing={3} mt={1}>
            <TextField label="ชื่อฟิลด์ / คำถาม (Label)" value={label} onChange={e => setLabel(e.target.value)} fullWidth required variant="outlined" />
            <TextField label="รูปแบบข้อมูล (Input Type)" select value={type} onChange={e => setType(e.target.value)} SelectProps={{ native: true }} fullWidth variant="outlined">
              <option value="text">ข้อความ (Text)</option>
              <option value="number">ตัวเลข (Number)</option>
              <option value="email">อีเมล (Email)</option>
              <option value="date">วันที่ (Date)</option>
              <option value="select">ตัวเลือก (Dropdown)</option>
            </TextField>
            {type === 'select' && <TextField label="ตัวเลือก (คั่นด้วยจุลภาค)" value={optionsStr} onChange={e => setOptionsStr(e.target.value)} fullWidth multiline rows={2} />}
            <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2" fontWeight="bold">จำเป็นต้องระบุ</Typography>
                <Switch checked={required} onChange={e => setRequired(e.target.checked)} color="error" />
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}><Button onClick={onClose} color="inherit">ยกเลิก</Button><Button type="submit" variant="contained">บันทึก</Button></DialogActions>
      </form>
    </Dialog>
  );
}

function PackageDialog({ open, data, onClose, onSave }) {
    const [name, setName] = useState("");
    const [price, setPrice] = useState("");
    const [desc, setDesc] = useState("");
    const [sizesStr, setSizesStr] = useState("S=100, M=100, L=100, XL=100");

    useEffect(() => {
        if (open) {
            setName(data?.name || "");
            setPrice(data?.price || "");
            setDesc(data?.description || "");
            if (data?.items?.[0]?.sizes) setSizesStr(data.items[0].sizes.map(s => `${s.size}=${s.stock}`).join(", "));
            else setSizesStr("S=100, M=100, L=100, XL=100");
        }
    }, [data, open]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const sizeArray = sizesStr.split(",").map(str => {
            const [sz, stk] = str.split("=");
            return { size: sz?.trim(), stock: parseInt(stk?.trim()) || 0, sold: 0 };
        }).filter(s => s.size);
        onSave({ ...(data && { _id: data._id }), name, price: Number(price), description: desc, items: [{ itemName: "เสื้อ", sizes: sizeArray }], isActive: true });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <form onSubmit={handleSubmit}>
                <DialogTitle sx={{ bgcolor: 'secondary.main', color: '#fff' }}>{data ? "แก้ไขแพ็กเกจ" : "เพิ่มแพ็กเกจใหม่"}</DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    <Stack spacing={3} mt={1}>
                        <TextField label="ชื่อแพ็กเกจ" required fullWidth value={name} onChange={e => setName(e.target.value)} />
                        <TextField label="ราคา (บาท)" type="number" required fullWidth value={price} onChange={e => setPrice(e.target.value)} />
                        <TextField label="รายละเอียด" multiline rows={2} fullWidth value={desc} onChange={e => setDesc(e.target.value)} />
                        <TextField label="ไซส์และสต๊อก (เช่น S=100, M=150)" required fullWidth value={sizesStr} onChange={e => setSizesStr(e.target.value)} helperText="รูปแบบ: ไซส์=จำนวน คั่นด้วยลูกน้ำ (,)" />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}><Button onClick={onClose}>ยกเลิก</Button><Button type="submit" variant="contained" color="secondary">บันทึกแพ็กเกจ</Button></DialogActions>
            </form>
        </Dialog>
    );
}