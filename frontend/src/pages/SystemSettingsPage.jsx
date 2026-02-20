// src/pages/SystemSettingsPage.jsx
import React, { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Typography, Button, Stack, TextField, Switch, 
  FormControlLabel, Snackbar, Alert, Divider, CircularProgress, Tabs, Tab, 
  Chip, IconButton, Grid, Paper, Dialog, DialogTitle, DialogContent, 
  DialogActions, InputAdornment, Fade, Slide
} from "@mui/material";
import { keyframes, styled } from "@mui/material/styles";

// Icons
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
import LocalShippingIcon from '@mui/icons-material/LocalShipping';

import useAuth from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { 
  getSystemSettings, updateSystemSettings, listParticipantFields, 
  createParticipantField, updateParticipantField, deleteParticipantField, 
  listPackages, createPackage, updatePackage, deletePackage 
} from "../utils/api";

const Y = { main: "#FFC107", dark: "#F57F17", light: "#FFF8E1", glass: "rgba(255, 255, 255, 0.85)", glassBorder: "rgba(255, 193, 7, 0.3)", text: "#4E342E", success: "#00C853", error: "#D32F2F" };
const gradientAnimation = keyframes` 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } `;
const GlassPaper = styled(Paper)(({ theme }) => ({ background: Y.glass, backdropFilter: "blur(20px)", borderRadius: "24px", border: `1px solid ${Y.glassBorder}`, boxShadow: "0 12px 40px 0 rgba(255, 193, 7, 0.15)", overflow: "hidden", display: "flex", flexDirection: "column" }));
const PulseButton = styled(Button)(({ theme }) => ({ transition: "transform 0.1s ease-in-out, box-shadow 0.2s", "&:active": { transform: "scale(0.96)" }, borderRadius: "14px", textTransform: "none", fontWeight: 800 }));
const inputStyle = { "& .MuiOutlinedInput-root": { borderRadius: '12px', bgcolor: '#fafafa', "&:hover fieldset": { borderColor: Y.main }, "&.Mui-focused fieldset": { borderColor: Y.dark, borderWidth: '2px' } } };

// 🌟 สร้างฟังก์ชันแปลงเวลา UTC จาก DB ให้กลายเป็นเวลาไทย (Local Time) สำหรับแสดงในช่อง datetime-local
const toLocalDatetimeInput = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function SystemSettingsPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState(0);
  
  const [settings, setSettings] = useState({
    eventName: "", enableRegister: true, maintenanceMode: false, contactEmail: "", welcomeMessage: "",
    preRegStartDate: "", preRegEndDate: "", kioskStartDate: "", kioskEndDate: "",
    enablePickup: true, enableDelivery: true
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
      navigate("/unauthorized"); return;
    }
    setFetching(true);
    Promise.all([ getSystemSettings(), listParticipantFields(), listPackages() ])
    .then(([resSettings, resFields, resPackages]) => {
      if(resSettings.data?.data) {
        const d = resSettings.data.data;
        setSettings({
            ...d,
            // 🌟 เรียกใช้ฟังก์ชันดึงเวลามาแสดงผลเป็นเวลาท้องถิ่น
            preRegStartDate: toLocalDatetimeInput(d.preRegStartDate),
            preRegEndDate: toLocalDatetimeInput(d.preRegEndDate),
            kioskStartDate: toLocalDatetimeInput(d.kioskStartDate),
            kioskEndDate: toLocalDatetimeInput(d.kioskEndDate),
            enablePickup: d.enablePickup ?? true,      
            enableDelivery: d.enableDelivery ?? true   
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
      // 🌟 ก่อนส่งไปบันทึก ต้องแปลงเวลากลับเป็นมาตรฐาน UTC (.toISOString) ป้องกันปัญหา Server Timezone เพี้ยน
      const payload = { ...settings };
      if (payload.preRegStartDate) payload.preRegStartDate = new Date(payload.preRegStartDate).toISOString();
      if (payload.preRegEndDate) payload.preRegEndDate = new Date(payload.preRegEndDate).toISOString();
      if (payload.kioskStartDate) payload.kioskStartDate = new Date(payload.kioskStartDate).toISOString();
      if (payload.kioskEndDate) payload.kioskEndDate = new Date(payload.kioskEndDate).toISOString();

      await updateSystemSettings(payload);
      setSnackbar({ open: true, message: "บันทึกการตั้งค่าระบบสำเร็จ", severity: "success" });
    } catch {
      setSnackbar({ open: true, message: "บันทึกไม่สำเร็จ กรุณาลองใหม่", severity: "error" });
    }
    setSaving(false);
  };

  const handleFieldSave = async (field) => { try { if (field._id) { await updateParticipantField(field._id, field); } else { await createParticipantField(field); } const res = await listParticipantFields(); setFields(res.data); setFieldDialog({ open: false, data: null }); setSnackbar({ open: true, message: "บันทึกฟิลด์สำเร็จ", severity: "success" }); } catch { setSnackbar({ open: true, message: "บันทึกฟิลด์ไม่สำเร็จ", severity: "error" }); } };
  const handleFieldDelete = async (id) => { if (!window.confirm("คุณแน่ใจหรือไม่ที่จะลบฟิลด์นี้? ข้อมูลของผู้ใช้อาจได้รับผลกระทบ")) return; try { await deleteParticipantField(id); const res = await listParticipantFields(); setFields(res.data); setSnackbar({ open: true, message: "ลบฟิลด์เรียบร้อย", severity: "success" }); } catch { setSnackbar({ open: true, message: "ลบฟิลด์ไม่สำเร็จ", severity: "error" }); } };
  const loadPackages = async () => { const res = await listPackages(); setPackages(res.data?.data || []); };
  const handleSavePackage = async (payload) => { try { if (payload._id) await updatePackage(payload._id, payload); else await createPackage(payload); setSnackbar({ open: true, message: "บันทึกแพ็กเกจสำเร็จ", severity: "success" }); setPkgDialog({ open: false, data: null }); loadPackages(); } catch { setSnackbar({ open: true, message: "บันทึกแพ็กเกจไม่สำเร็จ", severity: "error" }); } };
  const handleDeletePackage = async (id) => { if(!window.confirm("ต้องการลบแพ็กเกจนี้ใช่หรือไม่?")) return; try { await deletePackage(id); setSnackbar({ open: true, message: "ลบแพ็กเกจสำเร็จ", severity: "success" }); loadPackages(); } catch { setSnackbar({ open: true, message: "ลบแพ็กเกจไม่สำเร็จ", severity: "error" }); } };

  if (loading || fetching) return ( <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: Y.light }}><Stack spacing={2} alignItems="center"><CircularProgress sx={{ color: Y.main }} /><Typography color="text.secondary" fontWeight={600}>กำลังโหลดการตั้งค่าระบบ...</Typography></Stack></Box> );

  return (
    <Box sx={{ minHeight: "100vh", background: "linear-gradient(-45deg, #FFECB3, #FFF8E1, #FFD54F, #FFF3E0)", backgroundSize: "400% 400%", animation: `${gradientAnimation} 15s ease infinite`, p: { xs: 2, sm: 3, md: 4, lg: 5 }, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ width: "100%", maxWidth: 1800, mx: "auto", flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: "center" }} mb={4} gap={2}>
          <Box><Typography variant="h4" fontWeight="900" sx={{ color: Y.text, mb: 0.5 }}>System Settings</Typography><Typography variant="body1" color="text.secondary" fontWeight={500}>จัดการการตั้งค่าระบบ แบบฟอร์ม และสต๊อกสินค้า</Typography></Box>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate("/dashboard")} sx={{ borderRadius: '12px', color: Y.text, borderColor: Y.text, fontWeight: 700, ":hover": { bgcolor: 'rgba(0,0,0,0.05)' } }}>กลับแผงควบคุม</Button>
        </Stack>

        <Fade in={true} timeout={800}>
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <GlassPaper sx={{ flexGrow: 1 }}>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ pt: 1, px: 3, borderBottom: '1px solid rgba(0,0,0,0.05)', bgcolor: 'rgba(255,255,255,0.5)', "& .MuiTabs-indicator": { backgroundColor: Y.main, height: 4, borderRadius: "4px 4px 0 0" }, "& .MuiTab-root": { fontWeight: 700, color: "text.secondary", fontSize: "1rem", minHeight: 64 }, "& .Mui-selected": { color: `${Y.text} !important` } }}>
                <Tab icon={<SettingsSuggestIcon />} iconPosition="start" label="ตั้งค่าทั่วไป" />
                <Tab icon={<ListAltIcon />} iconPosition="start" label="จัดการฟิลด์ลงทะเบียน" />
                <Tab icon={<InventoryIcon />} iconPosition="start" label="สต๊อก & แพ็กเกจ" />
              </Tabs>

              <Box sx={{ p: { xs: 2, sm: 3, md: 4, lg: 5 }, flexGrow: 1, overflowY: 'auto' }}>
                {/* Tab 0: General */}
                {tab === 0 && (
                  <Grid container spacing={4}>
                    <Grid item xs={12} md={7} lg={8}>
                      <Card sx={{ height: "100%", borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', border: 'none' }}>
                        <CardContent sx={{ p: { xs: 3, lg: 4 } }}>
                          <Typography variant="h6" fontWeight="800" color={Y.text} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><EventIcon sx={{ color: Y.dark }} /> ข้อมูลงานอีเวนต์</Typography>
                          <Divider sx={{ mb: 4 }} />
                          <Stack spacing={4}>
                            <TextField label="ชื่องานอีเวนต์" name="eventName" value={settings.eventName} onChange={handleSettingsChange} fullWidth sx={inputStyle} />
                            <TextField label="อีเมลติดต่อ (สำหรับให้ผู้เข้าร่วมติดต่อ)" name="contactEmail" value={settings.contactEmail} onChange={handleSettingsChange} fullWidth InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon color="action"/></InputAdornment> }} sx={inputStyle} />
                            
                            <Box pt={1}>
                              <Typography variant="subtitle1" fontWeight="800" color={Y.dark} mb={2}>เวลาลงทะเบียนล่วงหน้า (Pre-Register)</Typography>
                              <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
                                <TextField label="เวลาเปิด" type="datetime-local" name="preRegStartDate" value={settings.preRegStartDate} onChange={handleSettingsChange} fullWidth InputLabelProps={{ shrink: true }} sx={inputStyle} />
                                <TextField label="เวลาปิด" type="datetime-local" name="preRegEndDate" value={settings.preRegEndDate} onChange={handleSettingsChange} fullWidth InputLabelProps={{ shrink: true }} sx={inputStyle} />
                              </Stack>
                            </Box>
                            <Box pt={1}>
                              <Typography variant="subtitle1" fontWeight="800" color={Y.dark} mb={2}>เวลาลงทะเบียนหน้างาน (Kiosk)</Typography>
                              <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
                                <TextField label="เวลาเปิด" type="datetime-local" name="kioskStartDate" value={settings.kioskStartDate} onChange={handleSettingsChange} fullWidth InputLabelProps={{ shrink: true }} sx={inputStyle} />
                                <TextField label="เวลาปิด" type="datetime-local" name="kioskEndDate" value={settings.kioskEndDate} onChange={handleSettingsChange} fullWidth InputLabelProps={{ shrink: true }} sx={inputStyle} />
                              </Stack>
                            </Box>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>

                    <Grid item xs={12} md={5} lg={4}>
                      <Stack spacing={4} sx={{ height: '100%' }}>
                        <Card sx={{ borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', border: 'none' }}>
                          <CardContent sx={{ p: { xs: 3, lg: 4 } }}>
                            <Typography variant="h6" fontWeight="800" color={Y.text} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><BuildIcon sx={{ color: Y.dark }} /> สถานะระบบ</Typography>
                            <Divider sx={{ mb: 4 }} />
                            
                            <Box sx={{ mb: 3, p: 2.5, borderRadius: '16px', bgcolor: settings.enableRegister ? '#E8F5E9' : '#f5f5f5', border: "1px solid", borderColor: settings.enableRegister ? '#A5D6A7' : '#e0e0e0', transition: 'all 0.3s' }}>
                              <FormControlLabel control={<Switch checked={settings.enableRegister} onChange={handleSettingsChange} name="enableRegister" color="success" size="large" />} label={<Box><Typography fontWeight="800" fontSize="1.1rem" color={settings.enableRegister ? '#2E7D32' : 'text.secondary'}>เปิดให้ลงทะเบียน</Typography><Typography variant="body2" color="text.secondary">อนุญาตให้ผู้ใช้ส่งข้อมูลเข้ามาได้</Typography></Box>} />
                            </Box>

                            <Box sx={{ p: 2.5, borderRadius: '16px', bgcolor: settings.maintenanceMode ? '#FFEBEE' : '#f5f5f5', border: "1px solid", borderColor: settings.maintenanceMode ? '#EF9A9A' : '#e0e0e0', transition: 'all 0.3s' }}>
                              <FormControlLabel control={<Switch checked={settings.maintenanceMode} onChange={handleSettingsChange} name="maintenanceMode" color="error" size="large" />} label={<Box><Typography fontWeight="800" fontSize="1.1rem" color={settings.maintenanceMode ? '#C62828' : 'text.secondary'}>โหมดปิดปรับปรุง (Maintenance)</Typography><Typography variant="body2" color="text.secondary">ปิดระบบชั่วคราวเพื่อแก้ไขข้อมูล</Typography></Box>} />
                            </Box>
                          </CardContent>
                        </Card>

                        <Card sx={{ borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', border: 'none', flexGrow: 1 }}>
                          <CardContent sx={{ p: { xs: 3, lg: 4 } }}>
                            <Typography variant="h6" fontWeight="800" color={Y.text} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><LocalShippingIcon sx={{ color: Y.dark }} /> ตัวเลือกรับของที่ระลึก</Typography>
                            <Divider sx={{ mb: 4 }} />
                            
                            <Box sx={{ mb: 2, p: 2, borderRadius: '12px', bgcolor: '#fafafa', border: "1px solid #eee" }}>
                              <FormControlLabel control={<Switch checked={settings.enablePickup} onChange={handleSettingsChange} name="enablePickup" color="secondary" />} label={<Typography fontWeight="700" color={settings.enablePickup ? '#7B1FA2' : 'text.secondary'}>เปิดให้รับสินค้าหน้างาน</Typography>} />
                            </Box>

                            <Box sx={{ p: 2, borderRadius: '12px', bgcolor: '#fafafa', border: "1px solid #eee" }}>
                              <FormControlLabel control={<Switch checked={settings.enableDelivery} onChange={handleSettingsChange} name="enableDelivery" color="secondary" />} label={<Typography fontWeight="700" color={settings.enableDelivery ? '#7B1FA2' : 'text.secondary'}>เปิดให้จัดส่งตามที่อยู่</Typography>} />
                            </Box>
                          </CardContent>
                        </Card>

                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <PulseButton variant="contained" size="large" startIcon={saving ? <CircularProgress size={24} color="inherit"/> : <SaveIcon />} onClick={handleSaveSettings} disabled={saving} sx={{ px: 5, py: 2, fontSize: '1.1rem', bgcolor: Y.main, color: '#000', boxShadow: `0 8px 30px ${Y.glassBorder}`, ":hover": { bgcolor: Y.dark, color: '#fff' } }}>
                              บันทึกการตั้งค่า
                            </PulseButton>
                        </Box>
                      </Stack>
                    </Grid>
                  </Grid>
                )}

                {/* Tab 1: Fields */}
                {tab === 1 && (
                  <Box>
                    <Box mb={4} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}><Box><Typography variant="h5" fontWeight="800" color={Y.text}>แบบฟอร์มลงทะเบียน</Typography><Typography variant="body1" color="text.secondary">กำหนดช่องกรอกข้อมูลที่ผู้เข้าร่วมต้องระบุ</Typography></Box><PulseButton variant="contained" size="large" startIcon={<AddCircleOutlineIcon />} onClick={() => setFieldDialog({ open: true, data: null })} sx={{ bgcolor: Y.dark, color: '#fff', px: 3, ":hover": { bgcolor: '#000' } }}>เพิ่มฟิลด์ใหม่</PulseButton></Box>
                    <Grid container spacing={3}>
                      {fields.map((field) => (
                        <Grid item xs={12} sm={6} md={4} lg={3} xl={2.4} key={field._id}>
                          <Card variant="outlined" sx={{ p: 1.5, borderRadius: '16px', display: 'flex', alignItems: 'center', borderColor: '#eee', transition: 'transform 0.2s', ":hover": { transform: 'translateY(-4px)', borderColor: Y.main, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' } }}>
                            <Box sx={{ p: 2, borderRadius: '12px', bgcolor: '#FFF8E1', color: Y.dark, mr: 2 }}>{field.type === 'number' ? <NumbersIcon /> : field.type === 'select' ? <ArrowDropDownCircleIcon /> : <TextFieldsIcon />}</Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}><Stack direction="row" alignItems="center" gap={1}><Typography variant="subtitle1" fontWeight="800" color={Y.text} noWrap>{field.label}</Typography></Stack><Stack direction="row" alignItems="center" gap={1} mt={0.5}><Typography variant="caption" color="text.secondary">Type: <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{field.type}</span></Typography>{field.required && <Chip label="Required" size="small" sx={{ height: 18, bgcolor: '#FFEBEE', color: '#D32F2F', fontWeight: 800, fontSize: '10px' }} />}</Stack></Box>
                            <Stack direction="column" gap={0.5}><IconButton size="small" onClick={() => setFieldDialog({ open: true, data: field })} sx={{ color: '#1976D2', bgcolor: '#E3F2FD', ":hover": { bgcolor: '#BBDEFB' } }}><EditTwoToneIcon fontSize="small"/></IconButton><IconButton size="small" onClick={() => handleFieldDelete(field._id)} sx={{ color: '#D32F2F', bgcolor: '#FFEBEE', ":hover": { bgcolor: '#FFCDD2' } }}><DeleteTwoToneIcon fontSize="small"/></IconButton></Stack>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}

                {/* Tab 2: Packages */}
                {tab === 2 && (
                  <Box>
                     <Box mb={4} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}><Box><Typography variant="h5" fontWeight="800" color={Y.text}>แพ็กเกจสนับสนุนและสต๊อก</Typography><Typography variant="body1" color="text.secondary">จัดการแพ็กเกจ ราคา และจำนวนไซส์เสื้อที่รองรับ</Typography></Box><PulseButton variant="contained" size="large" startIcon={<AddCircleOutlineIcon />} onClick={() => setPkgDialog({ open: true, data: null })} sx={{ bgcolor: Y.dark, color: '#fff', px: 3, ":hover": { bgcolor: '#000' } }}>เพิ่มแพ็กเกจใหม่</PulseButton></Box>
                    <Grid container spacing={3}>
                        {packages.map((pkg) => (
                            <Grid item xs={12} sm={6} md={4} lg={3} xl={3} key={pkg._id}>
                                <Card sx={{ borderRadius: '24px', boxShadow: '0 6px 24px rgba(0,0,0,0.06)', border: '1px solid #eee', display: 'flex', flexDirection: 'column', height: '100%', transition: 'transform 0.2s', ":hover": { transform: 'translateY(-4px)' } }}>
                                    <CardContent sx={{ flex: 1, p: 3 }}>
                                        <Typography variant="h5" fontWeight="900" color={Y.dark} mb={0.5}>{pkg.name}</Typography><Typography variant="h6" fontWeight="800" color={Y.text} mb={1}>฿{pkg.price.toLocaleString()}</Typography><Typography variant="body2" color="text.secondary" mb={3} sx={{ minHeight: 48 }}>{pkg.description || "ไม่มีรายละเอียด"}</Typography>
                                        <Box sx={{ bgcolor: '#fafafa', p: 2, borderRadius: '16px', border: '1px solid #f0f0f0' }}>
                                          <Typography variant="caption" fontWeight="800" color="text.secondary" display="block" mb={1.5}>จำนวนสต๊อก (คงเหลือ / ทั้งหมด)</Typography>
                                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                              {pkg.items[0]?.sizes?.map((sz, i) => { const remain = sz.stock - sz.sold; const isLow = remain <= 10 && remain > 0; const isOut = remain <= 0; return ( <Chip key={i} label={`${sz.size}: ${remain}/${sz.stock}`} size="small" sx={{ mb: 1, fontWeight: 800, fontSize: '0.85rem', py: 1.5, bgcolor: isOut ? '#FFEBEE' : isLow ? '#FFF8E1' : '#E8F5E9', color: isOut ? '#D32F2F' : isLow ? '#F57F17' : '#2E7D32' }} /> ) })}
                                          </Stack>
                                        </Box>
                                    </CardContent>
                                    <Box sx={{ p: 2, pt: 0, display: 'flex', gap: 1.5 }}><Button fullWidth variant="outlined" onClick={() => setPkgDialog({ open: true, data: pkg })} sx={{ borderRadius: '12px', fontWeight: 800, borderColor: '#ccc', color: Y.text, py: 1 }}>แก้ไข</Button><Button fullWidth variant="contained" color="error" onClick={() => handleDeletePackage(pkg._id)} sx={{ borderRadius: '12px', fontWeight: 800, boxShadow: 'none', py: 1 }}>ลบ</Button></Box>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                  </Box>
                )}
              </Box>
            </GlassPaper>
          </Box>
        </Fade>
      </Box>
      <FieldDialog open={fieldDialog.open} data={fieldDialog.data} onClose={() => setFieldDialog({ open: false, data: null })} onSave={handleFieldSave} />
      <PackageDialog open={pkgDialog.open} data={pkgDialog.data} onClose={() => setPkgDialog({ open: false, data: null })} onSave={handleSavePackage} />
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={snackbar.severity} variant="filled" sx={{ borderRadius: '12px', fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>{snackbar.message}</Alert></Snackbar>
    </Box>
  );
}

function FieldDialog({ open, data, onClose, onSave }) {
  const [label, setLabel] = useState(""); const [type, setType] = useState("text"); const [required, setRequired] = useState(false); const [optionsStr, setOptionsStr] = useState(""); 
  useEffect(() => { if (open) { setLabel(data?.label || ""); setType(data?.type || "text"); setRequired(data?.required || false); setOptionsStr(data?.options ? data.options.join(", ") : ""); } }, [data, open]);
  const handleSubmit = (e) => { e.preventDefault(); if (!label.trim()) return; const payload = { ...data, label, type, required }; if (type === 'select') payload.options = optionsStr.split(",").map(s => s.trim()).filter(Boolean); onSave(payload); };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '28px', p: 1 } }} TransitionComponent={Slide} TransitionProps={{ direction: "up" }}>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ textAlign: 'center', pt: 4, pb: 1 }}><Box sx={{ width: 72, height: 72, bgcolor: '#FFF8E1', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}><TextFieldsIcon sx={{ fontSize: 36, color: Y.dark }} /></Box><Typography variant="h5" fontWeight="900" color={Y.text}>{data ? "แก้ไขรายละเอียดฟิลด์" : "สร้างฟิลด์ลงทะเบียนใหม่"}</Typography></DialogTitle>
        <DialogContent sx={{ px: { xs: 3, sm: 5 }, pb: 3 }}>
          <Stack spacing={3} mt={1}>
            <TextField label="ชื่อฟิลด์ / คำถาม (Label)" value={label} onChange={e => setLabel(e.target.value)} fullWidth required variant="outlined" sx={inputStyle} />
            <TextField label="รูปแบบข้อมูล (Input Type)" select value={type} onChange={e => setType(e.target.value)} SelectProps={{ native: true }} fullWidth variant="outlined" sx={inputStyle}>
              <option value="text">ข้อความ (Text)</option><option value="number">ตัวเลข (Number)</option><option value="email">อีเมล (Email)</option><option value="date">วันที่ (Date)</option><option value="select">ตัวเลือก (Dropdown)</option>
            </TextField>
            {type === 'select' && <TextField label="ตัวเลือก (คั่นด้วยลูกน้ำ , )" value={optionsStr} onChange={e => setOptionsStr(e.target.value)} fullWidth multiline rows={3} sx={inputStyle} placeholder="เช่น: ปริญญาตรี, ปริญญาโท, ปริญญาเอก" />}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: required ? '#FFEBEE' : '#fafafa', borderColor: required ? '#EF9A9A' : '#eee', transition: 'all 0.3s' }}><Box><Typography variant="body1" fontWeight="800" color={required ? '#C62828' : 'text.secondary'}>จำเป็นต้องระบุ (Required)</Typography><Typography variant="body2" color="text.secondary">บังคับให้ผู้ใช้ต้องกรอกข้อมูลช่องนี้</Typography></Box><Switch checked={required} onChange={e => setRequired(e.target.checked)} color="error" size="large" /></Paper>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1, justifyContent: 'center', gap: 2 }}><Button onClick={onClose} size="large" sx={{ borderRadius: '14px', fontWeight: 800, color: 'text.secondary', px: 4 }}>ยกเลิก</Button><PulseButton type="submit" size="large" variant="contained" sx={{ px: 5, bgcolor: Y.main, color: '#000', ":hover": { bgcolor: Y.dark, color: '#fff' } }}>บันทึกข้อมูลฟิลด์</PulseButton></DialogActions>
      </form>
    </Dialog>
  );
}

function PackageDialog({ open, data, onClose, onSave }) {
    const [name, setName] = useState(""); const [price, setPrice] = useState(""); const [desc, setDesc] = useState(""); const [sizesStr, setSizesStr] = useState("S=100, M=100, L=100, XL=100");
    useEffect(() => { if (open) { setName(data?.name || ""); setPrice(data?.price || ""); setDesc(data?.description || ""); if (data?.items?.[0]?.sizes) setSizesStr(data.items[0].sizes.map(s => `${s.size}=${s.stock}`).join(", ")); else setSizesStr("S=100, M=100, L=100, XL=100"); } }, [data, open]);
    const handleSubmit = (e) => { e.preventDefault(); const sizeArray = sizesStr.split(",").map(str => { const [sz, stk] = str.split("="); return { size: sz?.trim(), stock: parseInt(stk?.trim()) || 0, sold: 0 }; }).filter(s => s.size); onSave({ ...(data && { _id: data._id }), name, price: Number(price), description: desc, items: [{ itemName: "เสื้อ", sizes: sizeArray }], isActive: true }); };
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '28px', p: 1 } }} TransitionComponent={Slide} TransitionProps={{ direction: "up" }}>
            <form onSubmit={handleSubmit}>
                <DialogTitle sx={{ textAlign: 'center', pt: 4, pb: 1 }}><Box sx={{ width: 72, height: 72, bgcolor: '#E8F5E9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}><InventoryIcon sx={{ fontSize: 36, color: '#2E7D32' }} /></Box><Typography variant="h5" fontWeight="900" color={Y.text}>{data ? "แก้ไขแพ็กเกจสนับสนุน" : "สร้างแพ็กเกจสนับสนุนใหม่"}</Typography></DialogTitle>
                <DialogContent sx={{ px: { xs: 3, sm: 5 }, pb: 3 }}>
                    <Stack spacing={3} mt={1}>
                        <TextField label="ชื่อแพ็กเกจ" required fullWidth value={name} onChange={e => setName(e.target.value)} sx={inputStyle} />
                        <TextField label="ราคา (บาท)" type="number" required fullWidth value={price} onChange={e => setPrice(e.target.value)} sx={inputStyle} InputProps={{ startAdornment: <InputAdornment position="start">฿</InputAdornment> }} />
                        <TextField label="รายละเอียดแพ็กเกจ" multiline rows={3} fullWidth value={desc} onChange={e => setDesc(e.target.value)} sx={inputStyle} />
                        <TextField label="ไซส์และจำนวนสต๊อก" required fullWidth value={sizesStr} onChange={e => setSizesStr(e.target.value)} sx={inputStyle} helperText="รูปแบบการพิมพ์: ไซส์=จำนวน คั่นด้วยลูกน้ำ (เช่น S=100, M=150, L=50)" />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3, pt: 1, justifyContent: 'center', gap: 2 }}><Button onClick={onClose} size="large" sx={{ borderRadius: '14px', fontWeight: 800, color: 'text.secondary', px: 4 }}>ยกเลิก</Button><PulseButton type="submit" size="large" variant="contained" sx={{ px: 5, bgcolor: '#2E7D32', color: '#fff', ":hover": { bgcolor: '#1B5E20' } }}>บันทึกแพ็กเกจ</PulseButton></DialogActions>
            </form>
        </Dialog>
    );
}