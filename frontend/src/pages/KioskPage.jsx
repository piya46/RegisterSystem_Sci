import React, { useEffect, useState, useMemo } from "react";
import {
  Box, Container, Paper, Stack, Typography, Avatar, Chip, Divider,
  TextField, MenuItem, Button, Fab, Tooltip, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, FormControl, RadioGroup, FormControlLabel, Radio, Collapse, Card, CardContent, InputAdornment
} from "@mui/material";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import LockIcon from "@mui/icons-material/Lock";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import LoginIcon from "@mui/icons-material/Login";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import EventIcon from '@mui/icons-material/Event';
import HomeIcon from '@mui/icons-material/Home';
import SecurityIcon from '@mui/icons-material/Security';
import SchoolIcon from '@mui/icons-material/School';

import {
  getMe,
  createParticipantByStaff as registerOnsiteByKiosk,
  listParticipantFields,
} from "../utils/api";
import { useSearchParams, useNavigate } from "react-router-dom";
import FollowersDialog from "../components/FollowersDialog";

// --- Component โบว์สีดำ (SVG) มุมซ้ายบน ---
const MourningRibbon = () => (
  <Box
    sx={{
      position: "absolute",
      top: 0,
      left: 0,
      zIndex: 9999,
      pointerEvents: "none",
      filter: "drop-shadow(2px 2px 3px rgba(0,0,0,0.5))",
      width: { xs: 60, md: 100 },
      height: { xs: 60, md: 100 }
    }}
  >
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
      <path d="M0 0 L50 0 L0 50 Z" fill="black" />
      <path d="M0 0 L0 50 L20 30 L40 50 L50 0 Z" fill="#1a1a1a" />
    </svg>
  </Box>
);

function KioskPage() {
  const [me, setMe] = useState(null);
  const [fields, setFields] = useState([]);
  const [form, setForm] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [membershipOption, setMembershipOption] = useState(null);
  const [followersDialogOpen, setFollowersDialogOpen] = useState(false);
  const [pendingSubmitForm, setPendingSubmitForm] = useState(null);

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

  // --- Logic แยกกลุ่มฟิลด์ ---
  const fieldGroups = useMemo(() => {
    const all = (fields || []);
    return {
      general: all.filter(f => !['usr_add', 'usr_add_post'].includes(f.name)),
      address: all.filter(f => ['usr_add', 'usr_add_post'].includes(f.name))
    };
  }, [fields]);

  // Kiosk Mode Logic
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

  const handleOnsiteSubmit = (e) => {
    e.preventDefault();
    if (!membershipOption) { alert("กรุณาเลือกสถานะสมาชิก"); return; }
    if (membershipOption !== 'none') {
        if (!form['usr_add'] || !form['usr_add_post']) { alert("กรุณากรอกที่อยู่"); return; }
    }
    setResult(null);
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

  // Helper Render Field
  const renderField = (f, requiredOverride = null) => {
    const isRequired = requiredOverride !== null ? requiredOverride : f.required;
    const commonSx = { "& .MuiOutlinedInput-root": { borderRadius: 2.5, bgcolor: "#fff", fontSize: "1.1rem" }, "& .MuiInputLabel-root": { fontSize: "1.05rem" } };

    if (f.name === 'date_year') {
        return <TextField key={f.name} name={f.name} label={f.label} value={form[f.name] || ""} onChange={handleInput} required={!!isRequired} fullWidth placeholder="25XX" InputProps={{ startAdornment: <InputAdornment position="start"><EventIcon color="action"/></InputAdornment>, style: { fontSize: '1.4rem', letterSpacing: '0.25em', textAlign: 'center', fontWeight: 'bold' } }} inputProps={{ maxLength: 4, inputMode: "numeric" }} sx={commonSx} />;
    }

    if (f.type === "select") {
        const options = Array.isArray(f.options) ? f.options.map((o) => typeof o === "string" ? { label: o, value: o } : { label: o.label, value: o.value }) : [];
        return (
            <TextField key={f.name} select name={f.name} label={f.label} value={form[f.name] || ""} onChange={handleInput} required={!!isRequired} fullWidth SelectProps={{ displayEmpty: true }} helperText={isRequired ? "" : "(ไม่บังคับ)"} sx={commonSx} InputProps={{ startAdornment: f.name === 'dept' ? <InputAdornment position="start"><SchoolIcon color="action"/></InputAdornment> : null }}>
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
      
      {/* ✅ 1. เพิ่มโบว์ไว้อาลัยตรงนี้ */}
      <MourningRibbon />

      <Container maxWidth="sm">
        {/* Header */}
        <Paper elevation={4} sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 4, background: "linear-gradient(135deg, rgba(255,243,224,.95) 0%, rgba(227,242,253,.95) 100%)", boxShadow: "0 14px 36px rgba(255,193,7,0.25)", border: "1px solid rgba(255,193,7,.35)", position: "relative", overflow: "hidden" }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
            <Avatar src="/logo.svg" alt="Logo" sx={{ width: 56, height: 56, bgcolor: "#fff", border: "2px solid rgba(255,193,7,.7)", boxShadow: "0 6px 18px rgba(255,193,7,.35)" }} />
            <Box textAlign="center">
              <Typography variant="h5" fontWeight={900} color="primary" sx={{ letterSpacing: 0.6 }}>ลงทะเบียนหน้างาน</Typography>
              <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 0.5 }}><Chip label={`Point: ${selectedPoint ? selectedPoint : "-"}`} size="small" color="warning" variant="outlined" /></Stack>
            </Box>
          </Stack>
          
          {/* Staff Profile */}
          <Paper variant="outlined" sx={{ mt: 2.5, p: 2, borderRadius: 3, bgcolor: "#fff" }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: "primary.main", width: 40, height: 40 }}><PersonOutlineIcon /></Avatar>
              <Box sx={{ minWidth: 0 }}><Typography sx={{ color: "text.secondary", fontSize: 13 }}>เจ้าหน้าที่ผู้ปฏิบัติงาน</Typography><Typography sx={{ fontWeight: 700 }}>{me?.fullName || me?.username || "ไม่พบข้อมูล"}</Typography></Box>
              <Box sx={{ flex: 1 }} />
              <Chip label={kioskMode ? "Kiosk Mode" : "Normal"} size="small" color={kioskMode ? "success" : "default"} />
            </Stack>
          </Paper>
          <Divider sx={{ my: 3 }} />

          <Box component="form" onSubmit={handleOnsiteSubmit}>
            <Stack spacing={2.5}>
              
              {/* ✅ 2. แสดงฟิลด์ข้อมูลทั่วไป */}
              {fieldGroups.general.map(f => renderField(f))}

              {/* ✅ 3. ส่วนสมาชิก (ย้ายมาไว้ท้ายสุด) */}
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#f4f9ff", borderColor: membershipOption ? "#cce0ff" : "#ef9a9a" }}>
                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                    <SecurityIcon color="primary"/>
                    <Typography fontWeight={700} sx={{ color: "#1565c0" }}>สถานะสมาชิกสมาคมฯ <span style={{ color: "red" }}>*</span></Typography>
                </Stack>
                <FormControl component="fieldset" sx={{ width: '100%' }}>
                  <RadioGroup name="membershipOption" value={membershipOption} onChange={(e) => setMembershipOption(e.target.value)}>
                    <FormControlLabel value="existing" control={<Radio sx={{mt:-4}}/>} label="1. เป็นสมาชิกสมาคมฯ อยู่แล้ว (ยินยอมอัปเดตข้อมูล)" sx={{ mb: 1, alignItems: 'flex-start', bgcolor:'#fff', p:1, borderRadius:2, border:'1px solid #e0e0e0' }} />
                    <FormControlLabel value="new" control={<Radio sx={{mt:-4}}/>} label={<span>2. สมัครสมาชิกสมาคมฯ <br/><span style={{ fontSize: '0.85em', color: '#666' }}>(ฟรี กรอกที่อยู่ให้ครบถ้วน)</span></span>} sx={{ mb: 1, alignItems: 'flex-start', bgcolor:'#fff', p:1, borderRadius:2, border:'1px solid #e0e0e0' }} />
                    <FormControlLabel value="none" control={<Radio sx={{mt:-4}}/>} label="3. ไม่ประสงค์สมัครสมาชิก" sx={{ alignItems: 'flex-start', bgcolor:'#fff', p:1, borderRadius:2, border:'1px solid #e0e0e0' }} />
                  </RadioGroup>
                </FormControl>
                
                {/* ✅ 4. แสดงฟิลด์ที่อยู่เมื่อจำเป็น */}
                <Collapse in={membershipOption === 'existing' || membershipOption === 'new'}>
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed #90caf9' }}>
                        <Stack direction="row" alignItems="center" spacing={1} mb={2}><HomeIcon color="primary"/><Typography variant="subtitle2" fontWeight={700} color="#1565c0">ที่อยู่สำหรับจัดส่ง (สมาชิก)</Typography></Stack>
                        <Stack spacing={2}>{fieldGroups.address.map(f => renderField(f, true))}</Stack>
                    </Box>
                </Collapse>
              </Paper>

              {result && <Alert severity={result.success ? "success" : "error"} icon={<CheckCircleIcon />} sx={{ fontWeight: 600 }}>{result.message}</Alert>}

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button type="submit" variant="contained" size="large" disabled={loading} startIcon={loading ? <CircularProgress size={18} /> : <LoginIcon />} fullWidth sx={{ borderRadius: 3, fontWeight: 800, boxShadow: loading ? "none" : "0 8px 20px rgba(33,150,243,.35)", py: 1.5, fontSize: '1.1rem' }}>
                  {loading ? "กำลังบันทึก..." : "ลงทะเบียนหน้างาน"}
                </Button>
                <Button type="button" variant="outlined" color="inherit" startIcon={<GroupAddIcon />} onClick={() => { if (!membershipOption) { alert("กรุณาเลือกสถานะสมาชิก"); return; } setPendingSubmitForm({ ...form }); setFollowersDialogOpen(true); }} fullWidth sx={{ borderRadius: 3 }}>ระบุผู้ติดตาม</Button>
              </Stack>
            </Stack>
          </Box>
        </Paper>
      </Container>

      {!kioskMode ? <Tooltip title="เปิดโหมด Kiosk"><Fab color="primary" onClick={handleEnterKiosk} sx={{ position: "fixed", right: 24, bottom: 24 }}><LockOpenIcon /></Fab></Tooltip> : <Tooltip title="ออกจากโหมด Kiosk"><Fab color="secondary" onClick={openExitDialog} sx={{ position: "fixed", right: 24, bottom: 24 }}><LockIcon /></Fab></Tooltip>}
      <FollowersDialog open={followersDialogOpen} onClose={() => { setFollowersDialogOpen(false); setPendingSubmitForm(null); }} onConfirm={handleConfirmFollowers} />
      <Dialog open={exitOpen} onClose={closeExitDialog}><DialogTitle>ยืนยันออก Kiosk</DialogTitle><DialogContent><TextField type="password" label="รหัสผ่าน" value={exitPassword} onChange={(e) => setExitPassword(e.target.value)} fullWidth autoFocus error={!!exitError} helperText={exitError} /></DialogContent><DialogActions><Button onClick={closeExitDialog}>ยกเลิก</Button><Button onClick={confirmExitKiosk} variant="contained" color="warning">ออก</Button></DialogActions></Dialog>
    </Box>
  );
}
export default KioskPage;