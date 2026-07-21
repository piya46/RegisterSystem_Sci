// frontend/src/pages/KioskPage.jsx
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  Box, Container, Paper, Stack, Typography, Avatar, Chip, Divider, TextField, MenuItem, Button, Fab, Tooltip, Alert, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, FormControl, RadioGroup, FormControlLabel, Radio, Collapse, Card, CardContent, InputAdornment, Switch, Backdrop, LinearProgress
} from "@mui/material";

// Icons
import LockOpenIcon from "@mui/icons-material/LockOpen";
import LockIcon from "@mui/icons-material/Lock";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import EventIcon from '@mui/icons-material/Event';
import HomeIcon from '@mui/icons-material/Home';
import SecurityIcon from '@mui/icons-material/Security';
import SchoolIcon from '@mui/icons-material/School';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ContactPhoneIcon from '@mui/icons-material/ContactPhone';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import PersonIcon from '@mui/icons-material/Person';
import BadgeIcon from '@mui/icons-material/Badge';
import ApartmentIcon from '@mui/icons-material/Apartment';
import WarningIcon from "@mui/icons-material/Warning";
import InfoIcon from "@mui/icons-material/Info";
import LocationOnIcon from "@mui/icons-material/LocationOn";

import { motion as Motion } from 'framer-motion';
import Confetti from 'react-confetti';
import { verifyUser, createParticipantByStaff as registerOnsiteByKiosk, listParticipantFields, getSystemSettings, listEnabledRegistrationPoints } from "../utils/api";
import { useSearchParams, useNavigate } from "react-router-dom";
import Turnstile from "../components/Turnstile";
import useAuth from "../hooks/useAuth";
import { eventContextToParams } from "../utils/eventContext";

const DEFAULT_IDLE_TIMEOUT_SECONDS = 60;
const DEFAULT_SUCCESS_RESET_SECONDS = 5;

const MourningRibbon = () => (
  <Box sx={{ position: "absolute", top: 0, left: 0, zIndex: 9999, pointerEvents: "none", width: { xs: 80, md: 120 }, height: { xs: 80, md: 120 } }}>
    <img src="/ribbon.svg" alt="Mourning Ribbon" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(2px 2px 3px rgba(0,0,0,0.5))" }} />
  </Box>
);

export default function KioskPage({ isSelfRegisterMode = false, forcePointId = null }) {
  const { user } = useAuth();
  const [fields, setFields] = useState([]);
  const [form, setForm] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingFields, setFetchingFields] = useState(true);

  const [systemStatus, setSystemStatus] = useState({ isOpen: true, message: "" });
  const [pointName, setPointName] = useState("");
  const [runtimePolicy, setRuntimePolicy] = useState({});
  const [membershipOption, setMembershipOption] = useState(null);
  const [followersCount, setFollowersCount] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [errorDialog, setErrorDialog] = useState({ open: false, title: "", msg: "", type: "error" });

  const [cfToken, setCfToken] = useState("");
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [errors, setErrors] = useState({});
  const turnstileRef = useRef();

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [kioskMode, setKioskMode] = useState(false);
  const eventParams = useMemo(
    () => eventContextToParams({
      eventId: searchParams.get("eventId") || user?.eventId || "",
      eventYear: searchParams.get("eventYear") || user?.eventYear || "",
    }),
    [searchParams, user?.eventId, user?.eventYear]
  );

  const selectedPoint = forcePointId || searchParams.get("point") || (user?.authScope === 'kiosk_device' ? user?.registrationPoint : null);

  const [exitOpen, setExitOpen] = useState(false);
  const [exitUsername, setExitUsername] = useState("");
  const [exitPassword, setExitPassword] = useState("");
  const [exitError, setExitError] = useState("");
  const [verifyingExit, setVerifyingExit] = useState(false);
  const [countdownProgress, setCountdownProgress] = useState(100);

  const lastActivityRef = useRef(Date.now());

  const handleVerify = useCallback((token) => { setCfToken(token); }, []);
  const handleError = useCallback(() => { setCfToken(""); }, []);

  useEffect(() => {
    if (!selectedPoint) { navigate("/select-point"); return; }

    const loadInitData = async () => {
      try {
        const [resSet, resFields, resPoints] = await Promise.all([
            getSystemSettings(),
            listParticipantFields(eventParams),
            listEnabledRegistrationPoints(eventParams)
        ]);

        const set = resSet.data?.data;
        if (set) {
          const now = new Date();
          const start = set.kioskStartDate ? new Date(set.kioskStartDate) : null;
          const end = set.kioskEndDate ? new Date(set.kioskEndDate) : null;

          if (set.maintenanceMode) {
             setSystemStatus({ isOpen: false, message: "ระบบกำลังปิดปรับปรุงชั่วคราว ขออภัยในความไม่สะดวก" });
          } else if (start && now < start) {
             setSystemStatus({ isOpen: false, message: `ระบบลงทะเบียนหน้างาน จะเปิดให้ใช้งานเวลา ${start.toLocaleString('th-TH')}` });
          } else if (end && now > end) {
             setSystemStatus({ isOpen: false, message: "หมดเวลาลงทะเบียนหน้างาน (Kiosk) แล้ว" });
          }
        }

        setFields(resFields.data || []);

        const allPoints = resPoints.data || resPoints || [];
        const currentPoint = allPoints.find(p => p._id === selectedPoint || p.id === selectedPoint);
        setPointName(currentPoint?.name || selectedPoint);
        setRuntimePolicy(currentPoint?.kioskPolicy || {});

      } catch (err) {
        console.error(err);
      } finally {
        setFetchingFields(false);
      }
    };
    loadInitData();
  }, [selectedPoint, navigate, eventParams]);

  useEffect(() => {
    if (isSelfRegisterMode) return;

    const idleTimeoutMs = (Number(runtimePolicy.idleTimeoutSeconds) || DEFAULT_IDLE_TIMEOUT_SECONDS) * 1000;
    const handleActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    const timer = setInterval(() => {
      if (Date.now() - lastActivityRef.current > idleTimeoutMs) {
        if (Object.keys(form).length > 0 || membershipOption !== null || reviewOpen || result || followersCount !== "") {
            handleReset();
        }
        lastActivityRef.current = Date.now();
      }
    }, 1000);
    return () => {
        window.removeEventListener("mousemove", handleActivity);
        window.removeEventListener("keydown", handleActivity);
        window.removeEventListener("touchstart", handleActivity);
        clearInterval(timer);
    };
  }, [form, membershipOption, reviewOpen, result, followersCount, isSelfRegisterMode, runtimePolicy.idleTimeoutSeconds]);

  useEffect(() => {
      if (result && !isSelfRegisterMode) {
          const successResetMs = (Number(runtimePolicy.successResetSeconds) || DEFAULT_SUCCESS_RESET_SECONDS) * 1000;
          const step = 100 / Math.max(1, Math.ceil(successResetMs / 100));
          setCountdownProgress(100);
          const interval = setInterval(() => {
              setCountdownProgress(prev => {
                  if (prev <= 0) {
                      clearInterval(interval);
                      handleReset();
                      return 0;
                  }
                  return Math.max(0, prev - step);
              });
          }, 100);
          return () => clearInterval(interval);
      }
  }, [result, isSelfRegisterMode, runtimePolicy.successResetSeconds]);

  const fieldGroups = useMemo(() => {
    const all = (fields || []).filter(f => f?.enabled !== false).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    const processed = all.map(f => ({ ...f, _options: f.type === "select" ? (Array.isArray(f.options) ? f.options.map(o => { if (typeof o === "string") return { label: o, value: o }; if (o && typeof o === "object") return { label: o.label ?? String(o.value ?? ""), value: o.value ?? o.label ?? "" }; return { label: String(o), value: String(o) }; }) : []) : [] }));
    const personalOrder = ['name', 'nickname', 'dept', 'date_year'];
    const personal = processed.filter(f => personalOrder.includes(f.name)).sort((a, b) => personalOrder.indexOf(a.name) - personalOrder.indexOf(b.name));
    const contact = processed.filter(f => ['phone', 'email'].includes(f.name));
    const address = processed.filter(f => ['usr_add', 'usr_add_post'].includes(f.name));
    const specifiedKeys = [...personalOrder, 'phone', 'email', 'usr_add', 'usr_add_post'];
    const others = processed.filter(f => !specifiedKeys.includes(f.name));
    return { personal, contact, address, others };
  }, [fields]);

  function openFullscreen() { const elem = document.documentElement; if (elem.requestFullscreen) elem.requestFullscreen(); }
  function closeFullscreen() { if (document.exitFullscreen) document.exitFullscreen(); }

  useEffect(() => { if (kioskMode && !isSelfRegisterMode) openFullscreen(); }, [kioskMode, isSelfRegisterMode]);

  const handleReset = () => {
      setForm({}); setMembershipOption(null); setFollowersCount("");
      setResult(null); setReviewOpen(false); setExitOpen(false); setErrors({});
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleInput = useCallback((e) => {
    const { name, value } = e.target;
    if (name === 'date_year') {
      const nums = value.replace(/[^\d]/g, '').slice(0, 4);
      setErrors(prev => {
          if (nums.length === 4) {
              const yearInt = parseInt(nums, 10);
              if (yearInt < 2400) return { ...prev, [name]: "กรุณากรอกปี พ.ศ. (เช่น 2530)" };
              else if (yearInt >= 2565) return { ...prev, [name]: "นิสิตปัจจุบัน (รหัส 65 เป็นต้นไป) ไม่สามารถลงทะเบียนได้" };
          }
          if (prev[name]) { const next = { ...prev }; delete next[name]; return next; }
          return prev;
      });
      setForm((f) => ({ ...f, [name]: nums }));
      return;
    }
    setErrors(prev => { if (prev[name]) { const next = { ...prev }; delete next[name]; return next; } return prev; });
    setForm((f) => ({ ...f, [name]: value }));
  }, []);

  const handleCheckInfo = (e) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) return;

    if (form['date_year']) {
        const yearInt = parseInt(form['date_year'], 10);
        if (yearInt >= 2565) {
            setErrorDialog({ open: true, type: "warning", title: "ไม่อนุญาตให้ลงทะเบียน", msg: "ขออภัย นิสิตปัจจุบัน (เข้าศึกษาตั้งแต่ปี พ.ศ. 2565 เป็นต้นไป) ยังไม่สามารถลงทะเบียนเข้าร่วมงานคืนเหย้าได้" });
            return;
        }
    }

    const missingFields = fields.filter(f => f.required && f.enabled && !['usr_add', 'usr_add_post'].includes(f.name) && !form[f.name]);
    if (missingFields.length > 0) {
        const newErrors = {}; missingFields.forEach(f => { newErrors[f.name] = `กรุณากรอก ${f.label}`; });
        setErrors(prev => ({ ...prev, ...newErrors }));
        setErrorDialog({ open: true, type: "warning", title: "ข้อมูลไม่ครบถ้วน", msg: `กรุณากรอกข้อมูลส่วนตัวให้ครบถ้วน` }); return;
    }
    if (!membershipOption) { setErrorDialog({ open: true, type: "warning", title: "กรุณาระบุข้อมูล", msg: "กรุณาเลือกสถานะสมาชิกสมาคมฯ ของท่าน" }); return; }
    if (membershipOption !== 'none') {
        if (!form['usr_add'] || !form['usr_add_post']) {
             setErrorDialog({ open: true, type: "warning", title: "ข้อมูลไม่ครบถ้วน", msg: "กรุณากรอกที่อยู่และรหัสไปรษณีย์เพื่อประกอบการสมัคร/อัปเดตสมาชิก" }); return;
        }
    }
    setReviewOpen(true);
  };

  const handleConfirmSubmit = () => { setReviewOpen(false); setPendingSubmit(true); turnstileRef.current?.execute(); };

  useEffect(() => {
    const go = async () => {
      if (!pendingSubmit || !cfToken) return;
      setLoading(true); setResult(null);
      try {
        const count = Math.max(0, parseInt(followersCount || 0, 10));
        const finalConsent = (membershipOption === 'existing' || membershipOption === 'new') ? 'agreed' : 'disagreed';
        const finalForm = { ...form };
        if (membershipOption === 'none') { finalForm['usr_add'] = "-"; finalForm['usr_add_post'] = "-"; }

        const res = await registerOnsiteByKiosk({
            ...finalForm,
            followers: count,
            cfToken,
            consent: finalConsent,
            registrationPoint: selectedPoint,
            ...eventParams
        });

        setResult(res.data?.participant || res.data || res);

        if (isSelfRegisterMode) sessionStorage.removeItem('kioskToken');

      } catch (err) {
        const errorMsg = err?.response?.data?.error || "เกิดข้อผิดพลาด";
        const isSecurity = errorMsg.includes("Security") || errorMsg.includes("Turnstile");
        setErrorDialog({ open: true, type: isSecurity ? "security" : "error", title: isSecurity ? "Security Check Failed" : "Registration Failed", msg: isSecurity ? "ระบบไม่สามารถยืนยันตัวตนของคุณได้ กรุณาลองใหม่อีกครั้ง" : errorMsg });
        turnstileRef.current?.reset();
      } finally { setLoading(false); setPendingSubmit(false); setCfToken(""); }
    };
    go();
  }, [cfToken, pendingSubmit, selectedPoint, isSelfRegisterMode, followersCount, form, membershipOption, eventParams]);

  const confirmExitKiosk = async () => {
    setVerifyingExit(true); setExitError("");
    try {
        await verifyUser({ username: exitUsername, password: exitPassword });
        setKioskMode(false); closeFullscreen(); setExitOpen(false); setResult(null);
        localStorage.removeItem('kioskToken');
        sessionStorage.removeItem('kioskToken');
        window.close();
    } catch (err) { setExitError(err.response?.data?.error || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"); }
    finally { setVerifyingExit(false); }
  };

  function pickField(participant, keys) { const f = participant?.fields || {}; for (const k of keys) { if (f[k] != null && String(f[k]).trim() !== "") return f[k]; } return "-"; }

  if (!systemStatus.isOpen && !kioskMode) {
    return (
      <Box sx={{ minHeight: "100vh", background: "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #e3f2fd 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)", display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, position: 'relative' }}>
         <MourningRibbon />
         <Motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.5 }}>
           <Paper elevation={8} sx={{ maxWidth: 480, width: '100%', borderRadius: '28px', textAlign: 'center', p: { xs: 4, sm: 5 }, background: "rgba(255, 255, 255, 0.9)", backdropFilter: "blur(16px)", border: "1px solid rgba(255, 193, 7, 0.3)", boxShadow: "0 16px 40px rgba(255, 193, 7, 0.15)" }}>
              <Box sx={{ width: 88, height: 88, bgcolor: '#FFF8E1', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 3, boxShadow: '0 8px 24px rgba(255, 193, 7, 0.25)', border: '2px solid #FFECB3' }}>
                <LockIcon sx={{ fontSize: 44, color: '#F57F17' }} />
              </Box>
              <Typography variant="h5" fontWeight="900" color="#4E342E" gutterBottom sx={{ lineHeight: 1.3 }}>{systemStatus.message}</Typography>
              <Divider sx={{ my: 2.5, borderColor: 'rgba(255, 193, 7, 0.2)', borderStyle: 'dashed' }} />
              {!isSelfRegisterMode && <Button variant="outlined" onClick={() => navigate('/dashboard')} sx={{ mt: 1, borderRadius: '12px', fontWeight: 700 }}>กลับหน้าหลัก</Button>}
           </Paper>
         </Motion.div>
      </Box>
    );
  }

  if (result) {
     return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f8f9fa", position: 'relative', overflowX: 'hidden' }}>
        <MourningRibbon />
        <Confetti width={window.innerWidth} height={window.innerHeight} recycle={false} numberOfPieces={300} gravity={0.2} />

        {!isSelfRegisterMode && (
          <LinearProgress variant="determinate" value={countdownProgress} color="success" sx={{ height: 8, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999 }} />
        )}

        <Container maxWidth="sm" sx={{ mt: { xs: 6, md: 12 }, position: 'relative', zIndex: 10 }}>
          <Box textAlign="center" mb={4}>
             <Motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
               <CheckCircleIcon color="success" sx={{ fontSize: 80, mb: 1, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }} />
             </Motion.div>
            <Typography variant="h3" gutterBottom fontWeight="900" color="success.main" sx={{ letterSpacing: 0.5 }}>ลงทะเบียนสำเร็จ!</Typography>
            <Typography variant="h6" color="text.secondary">ยินดีต้อนรับเข้าสู่งาน "เสือเหลืองคืนถิ่น"</Typography>
          </Box>

          <Motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
            <Card elevation={8} sx={{ borderRadius: 4, overflow: 'hidden', background: '#fff', border: '1px solid #4caf50' }}>
              <Box sx={{ background: '#4caf50', color: 'white', p: 3, textAlign: 'center' }}>
                 <Typography variant="h5" fontWeight="bold" sx={{ letterSpacing: 1.5 }}>
                     {pickField(result, ["name", "fullName", "fullname"])}
                 </Typography>
              </Box>
              <CardContent sx={{ p: 4 }}>
                <Stack spacing={2} alignItems="center">
                     <Box display="flex" alignItems="center" gap={1}>
                        <BadgeIcon color="action" />
                        <Typography variant="body1" color="text.secondary">รุ่นปีที่เข้าศึกษา:</Typography>
                        <Typography variant="h6" fontWeight="bold">{pickField(result, ["date_year", "year"])}</Typography>
                     </Box>
                     <Divider flexItem />
                     <Box display="flex" alignItems="center" gap={1}>
                        <ApartmentIcon color="action"/>
                        <Typography variant="body1" color="text.secondary">ภาควิชา:</Typography>
                        <Typography variant="h6" fontWeight="bold">{pickField(result, ["dept", "department"])}</Typography>
                     </Box>
                     {/* 🌟 เพิ่มส่วนแสดงผู้ติดตามตรงนี้ */}
                     <Divider flexItem />
                     <Box display="flex" alignItems="center" gap={1}>
                        <GroupAddIcon color="action"/>
                        <Typography variant="body1" color="text.secondary">ผู้ติดตาม:</Typography>
                        <Typography variant="h6" fontWeight="bold">
                           {result.followers > 0 ? `${result.followers} คน` : "ไม่มี"}
                        </Typography>
                     </Box>
                </Stack>
              </CardContent>
            </Card>
          </Motion.div>

          <Box sx={{ textAlign: 'center', mt: 6 }}>
            {isSelfRegisterMode ? (
              <Box>
                <Typography variant="h6" color="success.main" sx={{ fontWeight: 800 }}>กรุณาโชว์หน้าจอนี้ให้เจ้าหน้าที่ดู หรือแคปหน้าจอไว้</Typography>
                <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>ท่านสามารถปิดหน้าต่างเบราว์เซอร์นี้ได้เลย</Typography>
              </Box>
            ) : (
              <Box>
                <Button variant="contained" color="primary" size="large" onClick={handleReset} sx={{ borderRadius: '16px', px: 6, py: 2, fontWeight: '900', fontSize: '1.2rem', boxShadow: '0 8px 24px rgba(25, 118, 210, 0.4)' }}>
                    เสร็จสิ้น / ลงทะเบียนท่านต่อไป
                </Button>
                <Typography variant="body1" color="text.disabled" sx={{ mt: 3, fontWeight: 600 }}>หน้าจอจะเริ่มใหม่โดยอัตโนมัติ...</Typography>
              </Box>
            )}
          </Box>

          {!isSelfRegisterMode && (!kioskMode ?
            <Tooltip title="เปิดโหมด Kiosk (Fullscreen)"><Fab color="primary" onClick={() => { setKioskMode(true); setResult(null); }} sx={{ position: "fixed", right: 24, bottom: 24 }}><LockOpenIcon /></Fab></Tooltip>
            : <Tooltip title="ปลดล็อคเครื่อง"><Fab color="secondary" onClick={() => { setExitUsername(""); setExitPassword(""); setExitError(""); setExitOpen(true); }} sx={{ position: "fixed", right: 24, bottom: 24, opacity: 0.3, '&:hover':{opacity: 1} }}><LockIcon /></Fab></Tooltip>
          )}
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", background: "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #e3f2fd 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)", py: { xs: 3, md: 6 }, position: 'relative' }}>
      <MourningRibbon />
      <Container maxWidth="sm">

        <Motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Paper elevation={4} sx={{ p: { xs: 2.5, md: 3 }, mb: 3, borderRadius: 4, background: "linear-gradient(135deg, rgba(255,243,224,.95) 0%, rgba(227,242,253,.95) 100%)", boxShadow: "0 14px 36px rgba(255,193,7,0.25)", border: "1px solid rgba(255,193,7,.35)", position: 'relative' }}>
            {user && !isSelfRegisterMode && (
              <Chip icon={<BadgeIcon />} label={user.role?.includes('kiosk_device') ? `โหมดใช้งานสาธารณะ (Kiosk)` : `ผู้ดูแล: ${user?.fullName || user?.username}`} size="small" sx={{ position: 'absolute', top: 12, right: 12, bgcolor: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: '0.75rem' }} />
            )}
            <Stack direction="row" spacing={2} alignItems="center" justifyContent="center" mt={1}>
              <Avatar src="/logo.svg" alt="Logo" sx={{ width: 90, height: 90, bgcolor: "#fff", border: "2px solid rgba(255,193,7,.7)", boxShadow: "0 4px 12px rgba(255,193,7,.35)" }} />
              <Box>
                <Typography variant="h6" fontWeight={900} color="primary" sx={{ letterSpacing: .5, lineHeight: 1.3 }}>
                    ลงทะเบียนหน้างาน <br />
                    "เสือเหลืองคืนถิ่น"
                </Typography>
                <Chip icon={<LocationOnIcon sx={{ color: '#fff !important' }} />} label={`จุดลงทะเบียน: ${pointName || "ไม่ระบุ"}`} size="small" sx={{ bgcolor: '#F57F17', color: '#fff', fontWeight: '800', mt: 1, px: 0.5, boxShadow: '0 2px 8px rgba(245, 127, 23, 0.4)' }} />
              </Box>
            </Stack>
          </Paper>
        </Motion.div>

        {fetchingFields ? (
          <Box sx={{ mt: 4, textAlign: 'center' }}><CircularProgress color="warning" /></Box>
        ) : (
          <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.2 }}>
            <Box component="form" onSubmit={handleCheckInfo} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

                <FormSection title="ข้อมูลส่วนตัว / การศึกษา" icon={<AccountCircleIcon />}>
                  {fieldGroups.personal.map(f => <FieldInput key={f.name} field={f} value={form[f.name] ?? ""} onChange={handleInput} errorText={errors[f.name]} />)}
                  {fieldGroups.others.map(f => <FieldInput key={f.name} field={f} value={form[f.name] ?? ""} onChange={handleInput} errorText={errors[f.name]} />)}
                </FormSection>

                <FormSection title="ช่องทางติดต่อ" icon={<ContactPhoneIcon />}>
                  {fieldGroups.contact.map(f => <FieldInput key={f.name} field={f} value={form[f.name] ?? ""} onChange={handleInput} errorText={errors[f.name]} />)}
                </FormSection>

                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fffdf7", border: "1px solid #ffe082" }}>
                  <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
                    <GroupAddIcon color="warning" />
                    <Typography fontWeight={800} fontSize="1.1rem">ผู้ติดตาม</Typography>
                    <Chip label="ไม่บังคับ" size="small" sx={{ ml: "auto", bgcolor: "#fff3e0", color: "#e65100", fontWeight: 600 }} />
                  </Stack>
                  <TextField type="number" label="จำนวนผู้ติดตาม (หากมี)" placeholder="ไม่ต้องกรอกหากไม่มีผู้ติดตาม" value={String(followersCount ?? "")} onChange={(e) => setFollowersCount(e.target.value.replace(/[^\d]/g, ""))} fullWidth InputProps={{ startAdornment: <InputAdornment position="start">คน</InputAdornment> }} sx={{ bgcolor: '#fff', '& .MuiOutlinedInput-root': { borderRadius: 3 } }} />
                </Paper>

                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#e3f2fd", border: "1px solid #90caf9", mb: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                      <SecurityIcon color="primary"/>
                      <Typography fontWeight={800} fontSize="1.1rem" sx={{ color: "#1565c0" }}>สมาชิกสมาคมฯ <span style={{ color: "red" }}>*</span></Typography>
                    </Stack>
                    <FormControl component="fieldset" sx={{ width: '100%' }}>
                      <RadioGroup name="membershipOption" value={membershipOption} onChange={(e) => setMembershipOption(e.target.value)}>
                        <OptionCard value="existing" selected={membershipOption === 'existing'} label={<Box><Typography fontWeight={600} sx={{ lineHeight: 1.4 }}>เป็นสมาชิกสมาคมฯ อยู่แล้ว (อัปเดต)</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.85rem' }}>(กรุณากรอกที่อยู่ให้ครบถ้วนเพื่อปรับปรุงข้อมูล)</Typography></Box>} />
                        <OptionCard value="new" selected={membershipOption === 'new'} label={<Box><Typography fontWeight={600} sx={{ lineHeight: 1.4 }}>สมัครสมาชิกสมาคมฯ (ฟรี)</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.85rem' }}>(กรุณากรอกที่อยู่ให้ครบถ้วนเพื่อประกอบการสมัคร)</Typography></Box>} />
                        <OptionCard value="none" label={<Typography fontWeight={600}>ไม่ประสงค์สมัครสมาชิกสมาคมฯ</Typography>} selected={membershipOption === 'none'} />
                      </RadioGroup>
                    </FormControl>
                    <Collapse in={membershipOption === 'existing' || membershipOption === 'new'}>
                        <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed #90caf9' }}>
                            <Stack direction="row" alignItems="center" spacing={1} mb={2}><HomeIcon color="primary"/><Typography variant="subtitle1" fontWeight={700} color="#1565c0">ข้อมูลการติดต่อ (สำหรับสมาชิก)</Typography></Stack>
                            <Stack spacing={2}>
                              {fieldGroups.address.map(f => <FieldInput key={f.name} field={{...f, required: true}} value={form[f.name] ?? ""} onChange={handleInput} errorText={errors[f.name]} />)}
                            </Stack>
                        </Box>
                    </Collapse>
                </Paper>

                <Turnstile ref={turnstileRef} size="invisible" execution="execute" action="kiosk_register" onVerify={handleVerify} onError={handleError} />

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mt={1}>
                  <Button type="submit" variant="contained" color="warning" size="large" disabled={loading || Object.keys(errors).length > 0} fullWidth sx={{ py: 1.5, borderRadius: 3, fontSize: '1rem', fontWeight: 800, boxShadow: "0 6px 20px rgba(255,193,7,.4)" }} startIcon={loading ? <CircularProgress size={24} color="inherit" /> : <FactCheckIcon fontSize="large" />}>
                    {loading ? "กำลังประมวลผล..." : "ตรวจสอบข้อมูลการลงทะเบียน"}
                  </Button>
                  <Button type="button" variant="text" color="inherit" fullWidth onClick={handleReset} startIcon={<RestartAltIcon />} sx={{ fontWeight: 700 }}>เริ่มใหม่</Button>
                </Stack>
            </Box>
          </Motion.div>
        )}
      </Container>

      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '24px' } }}>
        <DialogTitle sx={{ bgcolor: '#fff3e0', borderBottom: '1px solid #ffe0b2' }}>
          <Stack direction="row" alignItems="center" spacing={1}><FactCheckIcon color="warning" /><Typography variant="h6" fontWeight={800}>ตรวจสอบข้อมูลลงทะเบียน</Typography></Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 3 }}>
            <Stack spacing={2}>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={1}>กรุณาตรวจสอบความถูกต้องก่อนกดยืนยัน</Typography>
                <InfoRow label="ชื่อ-นามสกุล" value={form.name} />
                <InfoRow label="ชื่อเล่น" value={form.nickname} />
                <InfoRow label="ภาควิชา" value={form.dept} />
                <InfoRow label="ปีที่เข้าศึกษา (พ.ศ.)" value={form.date_year} />
                <InfoRow label="เบอร์โทรศัพท์" value={form.phone} />

                {(membershipOption === 'existing' || membershipOption === 'new') && (
                    <Box sx={{ p: 1.5, bgcolor: "#f5f5f5", borderRadius: 2 }}>
                        <Typography variant="caption" fontWeight={800} color="primary">ที่อยู่:</Typography>
                        <Typography variant="body2">{form.usr_add} {form.usr_add_post}</Typography>
                    </Box>
                )}
                <Divider />
                <InfoRow label="สถานะสมาชิก" value={membershipOption === 'existing' ? 'สมาชิกเดิม (อัปเดต)' : membershipOption === 'new' ? 'สมัครสมาชิกใหม่' : 'ไม่ประสงค์สมัคร'} />
                <InfoRow label="ผู้ติดตาม" value={followersCount > 0 ? `${followersCount} คน` : "ไม่มี"} />
            </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 2, justifyContent: 'center', gap: 1 }}>
            <Button onClick={() => setReviewOpen(false)} color="inherit" sx={{ fontWeight: 700, borderRadius: '12px' }}>กลับไปแก้ไข</Button>
            <Button onClick={handleConfirmSubmit} variant="contained" color="success" size="large" sx={{ borderRadius: '14px', px: 4, fontWeight: 800, boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)' }} startIcon={<CheckCircleIcon />}>
              ยืนยันและลงทะเบียน
            </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={errorDialog.open} onClose={() => setErrorDialog({ ...errorDialog, open: false })} PaperProps={{ sx: { borderRadius: 4, p: 1, maxWidth: 360, textAlign: 'center', borderTop: errorDialog.type === 'security' ? '6px solid #FF3B30' : '6px solid #FF9800' } }}>
        <DialogContent>
          <Stack alignItems="center" spacing={2}>
            <Box sx={{ width: 60, height: 60, borderRadius: '50%', bgcolor: errorDialog.type === 'security' ? '#FFEBEE' : '#FFF3E0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {errorDialog.type === 'security' ? <SecurityIcon sx={{ fontSize: 36, color: '#D32F2F' }} /> : <WarningIcon sx={{ fontSize: 36, color: '#EF6C00' }} />}
            </Box>
            <Typography variant="h6" fontWeight={800}>{errorDialog.title}</Typography>
            <Typography variant="body2">{errorDialog.msg}</Typography>
            <Button variant="contained" color={errorDialog.type === 'security' ? 'error' : 'warning'} fullWidth onClick={() => setErrorDialog({ ...errorDialog, open: false })} sx={{ borderRadius: 3, fontWeight: 700 }}>ตกลง</Button>
          </Stack>
        </DialogContent>
      </Dialog>

      {!isSelfRegisterMode && (!kioskMode ?
        <Tooltip title="เปิดโหมด Kiosk (ป้องกันผู้ใช้ออกจากหน้าจอ)">
           <Fab color="primary" onClick={() => { setKioskMode(true); setResult(null); }} sx={{ position: "fixed", right: 24, bottom: 24 }}>
             <LockOpenIcon />
           </Fab>
        </Tooltip>
        :
        <Tooltip title="ปลดล็อคเครื่อง (เจ้าหน้าที่)">
           <Fab color="secondary" onClick={() => { setExitUsername(""); setExitPassword(""); setExitError(""); setExitOpen(true); }} sx={{ position: "fixed", right: 24, bottom: 24, opacity: 0.2, transition: 'opacity 0.3s', '&:hover':{ opacity: 1 } }}>
             <LockIcon />
           </Fab>
        </Tooltip>
      )}

      <Dialog open={exitOpen} onClose={() => setExitOpen(false)} PaperProps={{ sx: { borderRadius: 4 } }}>
          <DialogTitle sx={{display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#FFEBEE', color: '#C62828', fontWeight: 800}}>
            <SupervisorAccountIcon /> Supervisor Unlock
          </DialogTitle>
          <DialogContent sx={{ mt: 2 }}>
              <TextField label="Username" value={exitUsername} onChange={(e) => setExitUsername(e.target.value)} fullWidth margin="dense" sx={{ mb: 2 }} />
              <TextField type="password" label="Password" value={exitPassword} onChange={(e) => setExitPassword(e.target.value)} fullWidth margin="dense" error={!!exitError} helperText={exitError} />
          </DialogContent>
          <DialogActions sx={{ p: 2, justifyContent: 'center' }}>
              <Button onClick={() => setExitOpen(false)} color="inherit" sx={{ fontWeight: 700 }}>ยกเลิก</Button>
              <Button onClick={confirmExitKiosk} variant="contained" color="error" disabled={verifyingExit} sx={{ fontWeight: 800, borderRadius: 2 }}>ปลดล็อคเครื่อง</Button>
          </DialogActions>
      </Dialog>

      <Backdrop sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 9999, flexDirection: 'column', gap: 2 }} open={loading || pendingSubmit}>
        <CircularProgress color="inherit" size={60} thickness={4} />
        <Typography variant="h6" fontWeight="bold" sx={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>กำลังบันทึกข้อมูล...</Typography>
        <Typography variant="body1" sx={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>กรุณารอสักครู่ ห้ามปิดหน้าต่างนี้</Typography>
      </Backdrop>

    </Box>
  );
}

function FormSection({ title, icon, children }) {
    return (
        <Card variant="outlined" sx={{ borderRadius: 4, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            <Box sx={{ bgcolor: '#fff3e0', px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid #ffe0b2' }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>{icon}</Avatar>
                <Typography variant="subtitle1" fontWeight={800} color="#5d4037">{title}</Typography>
            </Box>
            <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                <Stack spacing={2.5}>{children}</Stack>
            </CardContent>
        </Card>
    );
}

const OptionCard = React.memo(({ value, label, selected }) => {
  return (
    <Paper variant="outlined" sx={{ mb: 1.5, p: 0, borderRadius: 3, border: selected ? "2px solid #1976d2" : "1px solid #e0e0e0", bgcolor: selected ? "#f0f7ff" : "#fff", transition: "all 0.2s", "&:hover": { borderColor: "#90caf9" } }}>
      <FormControlLabel value={value} control={<Radio sx={{ ml: 1 }} />} label={<Box sx={{ py: 1.5, pr: 1 }}>{label}</Box>} sx={{ width: '100%', m: 0, alignItems: 'flex-start', '& .MuiFormControlLabel-label': { width: '100%' }, '& .MuiRadio-root': { mt: 0.5 } }} />
    </Paper>
  );
});

const FieldInput = React.memo(({ field, value, onChange, errorText }) => {
  const [innerValue, setInnerValue] = useState(value || "");
  useEffect(() => { setInnerValue(value || ""); }, [value]);
  const handleBlur = () => { if (innerValue !== value) { onChange({ target: { name: field.name, value: innerValue } }); } };

  const commonSx = {
    "& .MuiOutlinedInput-root": { borderRadius: 3, bgcolor: "#fff", fontSize: "1.1rem", transition: "none" },
    "& .MuiInputLabel-root": { fontSize: "1.05rem" }
  };

  if (field.type === "select") {
    return (
      <TextField select name={field.name} label={field.label} value={value || ""} onChange={onChange} required={!!field.required} fullWidth helperText={errorText || (field.required ? "" : "(ไม่บังคับ)")} error={!!errorText} SelectProps={{ displayEmpty: true }} sx={commonSx} InputProps={{ startAdornment: field.name === 'dept' ? <InputAdornment position="start"><SchoolIcon color="action"/></InputAdornment> : null }}>
        <MenuItem value="" disabled><em>— กรุณาเลือก —</em></MenuItem>
        {field._options.map((opt) => (<MenuItem key={`${field.name}-${opt.value}`} value={opt.value} sx={{ py: 1.5, fontSize: '1.1rem' }}>{opt.label}</MenuItem>))}
      </TextField>
    );
  }

  if (field.name === 'date_year') {
    return (
      <TextField name={field.name} label={field.label} value={innerValue} onChange={(e) => setInnerValue(e.target.value.replace(/[^\d]/g, '').slice(0, 4))} onBlur={handleBlur} required={!!field.required} fullWidth placeholder="25XX" error={!!errorText} helperText={errorText || "กรุณากรอกปี พ.ศ. 4 หลัก"} autoComplete="off" InputProps={{ startAdornment: <InputAdornment position="start"><EventIcon color="action" /></InputAdornment>, style: { fontSize: '1.4rem', letterSpacing: '0.25em', fontWeight: 'bold' } }} inputProps={{ inputMode: "numeric" }} sx={commonSx} />
    );
  }

  const inputType = field.type === "email" ? "email" : "text";
  return (
    <TextField name={field.name} type={inputType} label={field.label} value={innerValue} onChange={(e) => setInnerValue(e.target.value)} onBlur={handleBlur} required={!!field.required} fullWidth error={!!errorText} helperText={errorText || (field.required ? "" : "(ไม่บังคับ)")} sx={commonSx} autoComplete="off" inputProps={{ inputMode: field.type === 'number' ? 'numeric' : 'text', spellCheck: "false" }} />
  );
});

function InfoRow({ label, value }) {
    return (
        <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 1, borderBottom: '1px dashed #eee', pb: 1 }}>
            <Typography sx={{ fontWeight: 700, color: 'text.secondary' }}>{label}:</Typography>
            <Typography sx={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value || "-"}</Typography>
        </Stack>
    );
}
