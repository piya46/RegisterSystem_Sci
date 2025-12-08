// src/pages/KioskPage.jsx
import React, { useEffect, useState, useMemo } from "react";
import {
  Box, Container, Paper, Stack, Typography, Avatar, Chip, Divider,
  TextField, MenuItem, Button, Fab, Tooltip, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, FormControl, RadioGroup,
  FormControlLabel, Radio, Collapse, Card, CardContent, InputAdornment
} from "@mui/material";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import LockIcon from "@mui/icons-material/Lock";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import EventIcon from '@mui/icons-material/Event';
import HomeIcon from '@mui/icons-material/Home';
import SecurityIcon from '@mui/icons-material/Security';
import SchoolIcon from '@mui/icons-material/School';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import InfoIcon from "@mui/icons-material/Info";
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ContactPhoneIcon from '@mui/icons-material/ContactPhone';

import {
  getMe,
  createParticipantByStaff as registerOnsiteByKiosk,
  listParticipantFields,
} from "../utils/api";
import { useSearchParams, useNavigate } from "react-router-dom";
import FollowersDialog from "../components/FollowersDialog";

// --- Component โบว์สีดำ ---
const MourningRibbon = () => (
    <Box sx={{ position: "absolute", top: 0, left: 0, zIndex: 9999, pointerEvents: "none", width: { xs: 80, md: 120 }, height: { xs: 80, md: 120 }, filter: "drop-shadow(2px 2px 4px rgba(0,0,0,0.4))" }}>
      <img src="/ribbon.svg" alt="Mourning Ribbon" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </Box>
);

// --- Helper Components (เหมือน PreRegister) ---
function FormSection({ title, icon, children }) {
  return (
      <Card variant="outlined" sx={{ borderRadius: 3, border: '1px solid #e0e0e0', overflow: 'hidden', mb: 2.5 }}>
          <Box sx={{ bgcolor: '#fff3e0', px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid #ffe0b2' }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>{icon}</Avatar>
              <Typography variant="subtitle1" fontWeight={800} color="#5d4037">{title}</Typography>
          </Box>
          <CardContent sx={{ p: 2.5 }}>
              <Stack spacing={2.5}>{children}</Stack>
          </CardContent>
      </Card>
  );
}

function OptionCard({ value, label, selected }) {
  return (
    <Paper variant="outlined" sx={{ mb: 1.5, p: 0, borderRadius: 2, border: selected ? "2px solid #1976d2" : "1px solid #e0e0e0", bgcolor: selected ? "#f0f7ff" : "#fff", transition: "all 0.2s", "&:hover": { borderColor: "#90caf9" } }}>
      <FormControlLabel value={value} control={<Radio sx={{ ml: 1 }} />} label={<Box sx={{ py: 1.5, pr: 1 }}>{label}</Box>} sx={{ width: '100%', m: 0, alignItems: 'flex-start', '& .MuiFormControlLabel-label': { width: '100%' }, '& .MuiRadio-root': { mt: 0.5 } }} />
    </Paper>
  );
}

function KioskPage() {
  const [me, setMe] = useState(null);
  const [fields, setFields] = useState([]);
  const [form, setForm] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [membershipOption, setMembershipOption] = useState(null);
  const [followersDialogOpen, setFollowersDialogOpen] = useState(false);
  const [pendingSubmitForm, setPendingSubmitForm] = useState(null);
  
  // Review Dialog
  const [reviewOpen, setReviewOpen] = useState(false);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [kioskMode, setKioskMode] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState("");
  const [exitError, setExitError] = useState("");
  const selectedPoint = searchParams.get("point");

  useEffect(() => {
    if (!selectedPoint) { navigate("/select-point"); return; }
    getMe(token).then((res) => setMe(res.data || res)).catch(() => {});
    listParticipantFields(token).then((res) => setFields(res.data || res)).catch(() => {});
  }, [token, selectedPoint, navigate]);

  // จัดกลุ่มฟิลด์เหมือน PreRegister
  const fieldGroups = useMemo(() => {
    const all = (fields || []).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    
    // แยกตามชื่อฟิลด์
    const personalFields = all.filter(f => ['name', 'nickname', 'dept', 'date_year'].includes(f.name));
    const contactFields = all.filter(f => ['phone', 'email'].includes(f.name));
    const addressFields = all.filter(f => ['usr_add', 'usr_add_post'].includes(f.name));
    const otherFields = all.filter(f => 
        !['name', 'nickname', 'dept', 'date_year', 'phone', 'email', 'usr_add', 'usr_add_post'].includes(f.name)
    );

    return { personal: personalFields, contact: contactFields, address: addressFields, others: otherFields };
  }, [fields]);

  function openFullscreen() { const elem = document.documentElement; if (elem.requestFullscreen) elem.requestFullscreen(); }
  function closeFullscreen() { if (document.exitFullscreen) document.exitFullscreen(); }
  useEffect(() => { if (kioskMode) openFullscreen(); else closeFullscreen(); }, [kioskMode]);

  const handleInput = (e) => {
    const { name, value } = e.target;
    if (name === 'date_year') {
        const nums = value.replace(/[^\d]/g, '').slice(0, 4);
        setForm((f) => ({ ...f, [name]: nums }));
        return;
    }
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleCheckInfo = (e) => {
    e.preventDefault();
    if (!membershipOption) { alert("กรุณาเลือกสถานะสมาชิก"); return; }
    if (membershipOption !== 'none') {
        if (!form['usr_add'] || !form['usr_add_post']) { alert("กรุณากรอกที่อยู่และรหัสไปรษณีย์"); return; }
    }
    setResult(null);
    setReviewOpen(true);
  };

  const handleProceedToFollowers = () => {
    setReviewOpen(false);
    setPendingSubmitForm({ ...form });
    setFollowersDialogOpen(true);
  };

  const handleConfirmFollowers = async (followers) => {
    setFollowersDialogOpen(false);
    setLoading(true);
    try {
      const finalForm = { ...pendingSubmitForm };
      if (membershipOption === 'none') {
        finalForm['usr_add'] = "-";
        finalForm['usr_add_post'] = "-";
      }
      const finalConsent = (membershipOption === 'existing' || membershipOption === 'new') ? 'agreed' : 'disagreed';
      finalForm['consent'] = finalConsent;

      const res = await registerOnsiteByKiosk({ ...finalForm, registrationPoint: selectedPoint, followers }, token);
      setResult({ success: true, message: `ลงทะเบียนสำเร็จ: ${res.data?.fields?.name || res.fields?.name || ""}` });
      setForm({});
      setMembershipOption(null);
    } catch (err) {
      setResult({ success: false, message: err.response?.data?.error || "เกิดข้อผิดพลาด" });
    }
    setLoading(false);
    setPendingSubmitForm(null);
  };

  const handleEnterKiosk = () => { setKioskMode(true); setResult(null); };
  const openExitDialog = () => { setExitOpen(true); };
  const closeExitDialog = () => { setExitOpen(false); };
  const confirmExitKiosk = () => {
    if (exitPassword === me?.username) { setKioskMode(false); closeExitDialog(); setResult(null); }
    else { setExitError("รหัสผ่านไม่ถูกต้อง"); }
  };

  // Render Field Input (เหมือน PreRegister)
  const renderField = (f, requiredOverride = null) => {
    const isRequired = requiredOverride !== null ? requiredOverride : f.required;
    const commonSx = { "& .MuiOutlinedInput-root": { borderRadius: 2.5, bgcolor: "#fff", fontSize: "1.1rem" }, "& .MuiInputLabel-root": { fontSize: "1.05rem" } };

    if (f.name === 'date_year') {
        return <TextField key={f.name} name={f.name} label={f.label} value={form[f.name] || ""} onChange={handleInput} required={!!isRequired} fullWidth placeholder="25XX" InputProps={{ startAdornment: <InputAdornment position="start"><EventIcon color="action"/></InputAdornment>, style: { fontSize: '1.4rem', letterSpacing: '0.25em', textAlign: 'center', fontWeight: 'bold' } }} inputProps={{ maxLength: 4, inputMode: "numeric" }} sx={commonSx} />;
    }

    if (f.type === "select") {
        const options = Array.isArray(f.options) ? f.options.map((o) => typeof o === "string" ? { label: o, value: o } : { label: o.label, value: o.value }) : [];
        return (
            <TextField key={f.name} select name={f.name} label={f.label} value={form[f.name] || ""} onChange={handleInput} required={!!isRequired} fullWidth SelectProps={{ displayEmpty: true }} helperText={isRequired ? "" : "(ไม่บังคับ)"} sx={commonSx} InputProps={{ startAdornment: f.name === 'dept' ? <InputAdornment position="start"><SchoolIcon/></InputAdornment> : null }}>
                <MenuItem value=""><em>— เลือก —</em></MenuItem>
                {options.map((opt) => (<MenuItem key={`${f.name}-${opt.value}`} value={opt.value} sx={{ fontSize: '1.1rem', py: 1.5 }}>{opt.label}</MenuItem>))}
            </TextField>
        );
    }
    const inputType = f.type === "email" ? "email" : f.type === "number" ? "number" : "text";
    return (
        <TextField key={f.name} name={f.name} type={inputType} label={f.label} value={form[f.name] || ""} onChange={handleInput} required={!!isRequired} fullWidth helperText={isRequired ? "" : "(ไม่บังคับ)"} sx={commonSx} InputLabelProps={inputType === "date" ? { shrink: true } : undefined} autoComplete="off" inputProps={inputType === "number" ? { inputMode: "numeric", pattern: "[0-9]*" } : undefined} />
    );
  };

  return (
    <Box sx={{ minHeight: "100vh", background: "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #e3f2fd 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)", py: { xs: 3, md: 6 }, position: 'relative' }}>
      
      <MourningRibbon />

      <Container maxWidth="sm">
        {/* Header */}
        <Paper elevation={4} sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 4, background: "linear-gradient(135deg, rgba(255,243,224,.95) 0%, rgba(227,242,253,.95) 100%)", boxShadow: "0 14px 36px rgba(255,193,7,0.25)", border: "1px solid rgba(255,193,7,.35)", position: "relative", overflow: "hidden", mb: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
            <Avatar src="/logo.svg" alt="Logo" sx={{ width: 64, height: 64, bgcolor: "#fff", border: "2px solid rgba(255,193,7,.7)", boxShadow: "0 6px 18px rgba(255,193,7,.35)" }} />
            <Box textAlign="center">
              <Typography variant="h5" fontWeight={900} color="primary" sx={{ letterSpacing: 0.6 }}>ลงทะเบียนหน้างาน (Kiosk)</Typography>
              <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 0.5 }}>
                <Chip label={`จุด: ${selectedPoint || "-"}`} size="small" color="warning" sx={{fontWeight: 'bold'}} />
              </Stack>
            </Box>
          </Stack>
          
          {/* Staff Info (Compact) */}
          <Paper variant="outlined" sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: "rgba(255,255,255,0.6)", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <Stack direction="row" spacing={1} alignItems="center">
               <Avatar sx={{ width: 24, height: 24, bgcolor: 'primary.main' }}><PersonOutlineIcon sx={{ fontSize: 16 }} /></Avatar>
               <Typography variant="body2" fontWeight={600}>{me?.fullName || "Staff"}</Typography>
             </Stack>
             <Chip label={kioskMode ? "Kiosk Mode ON" : "Normal Mode"} size="small" color={kioskMode ? "success" : "default"} variant="outlined" />
          </Paper>
        </Paper>

        <Box component="form" onSubmit={handleCheckInfo} noValidate>
            
            {/* 1. ข้อมูลส่วนตัว / การศึกษา */}
            <FormSection title="ข้อมูลส่วนตัว / การศึกษา" icon={<AccountCircleIcon />}>
                {fieldGroups.personal.map(f => renderField(f))}
                {fieldGroups.others.map(f => renderField(f))}
            </FormSection>

            {/* 2. ข้อมูลติดต่อ */}
            <FormSection title="ช่องทางติดต่อ" icon={<ContactPhoneIcon />}>
                {fieldGroups.contact.map(f => renderField(f))}
            </FormSection>

            {/* 3. สมาชิกสมาคม */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#e3f2fd", border: "1px solid #90caf9", mb: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                    <SecurityIcon color="primary"/>
                    <Typography fontWeight={800} fontSize="1.1rem" sx={{ color: "#1565c0" }}>สมาชิกสมาคมฯ <span style={{ color: "red" }}>*</span></Typography>
                </Stack>
                
                <FormControl component="fieldset" sx={{ width: '100%' }}>
                  <RadioGroup name="membershipOption" value={membershipOption} onChange={(e) => setMembershipOption(e.target.value)}>
                    <OptionCard 
                        value="existing" 
                        selected={membershipOption === 'existing'}
                        label={
                            <Box>
                                <Typography fontWeight={600}>เป็นสมาชิกสมาคมฯ อยู่แล้ว (อัปเดต)</Typography>
                                <Typography variant="caption" color="text.secondary">กรอกที่อยู่เพื่ออัปเดตข้อมูล</Typography>
                            </Box>
                        } 
                    />
                    <OptionCard 
                        value="new" 
                        selected={membershipOption === 'new'}
                        label={
                            <Box>
                                <Typography fontWeight={600}>สมัครสมาชิกสมาคมฯ (ฟรี)</Typography>
                                <Typography variant="caption" color="text.secondary">กรอกที่อยู่เพื่อประกอบการสมัคร</Typography>
                            </Box>
                        } 
                    />
                    <OptionCard 
                        value="none" 
                        selected={membershipOption === 'none'}
                        label="ไม่ประสงค์สมัครสมาชิกสมาคมฯ" 
                    />
                  </RadioGroup>
                </FormControl>
                
                <Collapse in={membershipOption === 'existing' || membershipOption === 'new'}>
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed #90caf9' }}>
                        <Stack direction="row" alignItems="center" spacing={1} mb={2}><HomeIcon color="primary"/><Typography variant="subtitle2" fontWeight={700} color="#1565c0">ข้อมูลการติดต่อ (สำหรับสมาชิก)</Typography></Stack>
                        <Stack spacing={2}>{fieldGroups.address.map(f => renderField(f, true))}</Stack>
                    </Box>
                </Collapse>
            </Paper>

            {/* PDPA Note */}
            <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 3, bgcolor: "#e1f5fe", color: "#01579b", borderRadius: 2, "& .MuiAlert-icon": { color: "#0288d1" } }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    <strong>หมายเหตุ:</strong> ภายในงานจะมีการบันทึกภาพและวิดีโอ เพื่อใช้ในการประชาสัมพันธ์กิจกรรม
                </Typography>
            </Alert>

            {result && <Alert severity={result.success ? "success" : "error"} icon={<CheckCircleIcon />} sx={{ mb: 2, fontWeight: 600, borderRadius: 2 }}>{result.message}</Alert>}

            {/* Action Buttons */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mb={4}>
                <Button
                  type="submit"
                  variant="contained"
                  color="warning"
                  size="large"
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} color="inherit"/> : <FactCheckIcon />}
                  fullWidth
                  sx={{
                    borderRadius: 3,
                    fontWeight: 800,
                    boxShadow: "0 6px 20px rgba(255,193,7,.35)",
                    py: 1.5,
                    fontSize: '1.1rem',
                    color: '#3e2723'
                  }}
                >
                  {loading ? "กำลังบันทึก..." : "ตรวจสอบและลงทะเบียน"}
                </Button>
                <Button 
                    type="button" 
                    variant="outlined" 
                    color="inherit" 
                    startIcon={<GroupAddIcon />} 
                    onClick={() => { 
                        if (!membershipOption) { alert("กรุณาเลือกสถานะสมาชิก"); return; } 
                        setPendingSubmitForm({ ...form }); 
                        setFollowersDialogOpen(true); 
                    }} 
                    fullWidth 
                    sx={{ borderRadius: 3, fontWeight: 600 }}
                >
                  ระบุผู้ติดตามทันที
                </Button>
            </Stack>
        </Box>
      </Container>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ bgcolor: '#fff3e0', borderBottom: '1px solid #ffe0b2' }}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <FactCheckIcon color="warning" />
                <Typography variant="h6" fontWeight={700}>ตรวจสอบข้อมูล (Kiosk)</Typography>
            </Stack>
        </DialogTitle>
        <DialogContent dividers>
            <Stack spacing={1}>
                <Typography variant="body1"><strong>ชื่อ:</strong> {form.name}</Typography>
                <Typography variant="body1"><strong>ชื่อเล่น:</strong> {form.nickname}</Typography>
                <Typography variant="body1"><strong>ภาควิชา:</strong> {form.dept}</Typography>
                <Typography variant="body1"><strong>สถานะสมาชิก:</strong> {membershipOption === 'existing' ? 'สมาชิกเดิม' : membershipOption === 'new' ? 'สมัครใหม่' : 'ไม่สมัคร'}</Typography>
                {membershipOption !== 'none' && <Typography variant="body2" color="text.secondary">ที่อยู่: {form.usr_add} {form.usr_add_post}</Typography>}
            </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setReviewOpen(false)} color="inherit">แก้ไข</Button>
            <Button onClick={handleProceedToFollowers} variant="contained" color="success" size="large" sx={{borderRadius: 2, fontWeight: 700}}>ยืนยันและระบุผู้ติดตาม</Button>
        </DialogActions>
      </Dialog>

      {!kioskMode ? <Tooltip title="เปิดโหมด Kiosk"><Fab color="primary" onClick={handleEnterKiosk} sx={{ position: "fixed", right: 24, bottom: 24 }}><LockOpenIcon /></Fab></Tooltip> : <Tooltip title="ออกจากโหมด Kiosk"><Fab color="secondary" onClick={openExitDialog} sx={{ position: "fixed", right: 24, bottom: 24 }}><LockIcon /></Fab></Tooltip>}
      
      <FollowersDialog open={followersDialogOpen} onClose={() => { setFollowersDialogOpen(false); setPendingSubmitForm(null); }} onConfirm={handleConfirmFollowers} />
      
      <Dialog open={exitOpen} onClose={closeExitDialog}>
          <DialogTitle>ยืนยันออก Kiosk</DialogTitle>
          <DialogContent>
              <TextField type="password" label="รหัสผ่าน Staff" value={exitPassword} onChange={(e) => setExitPassword(e.target.value)} fullWidth autoFocus error={!!exitError} helperText={exitError} margin="dense" />
          </DialogContent>
          <DialogActions>
              <Button onClick={closeExitDialog}>ยกเลิก</Button>
              <Button onClick={confirmExitKiosk} variant="contained" color="error">ออก</Button>
          </DialogActions>
      </Dialog>
    </Box>
  );
}

export default KioskPage;