// src/pages/CheckinStaffPage.jsx
import React, { useEffect, useState, useRef } from "react";
import {
  Box, Paper, Typography, Stack, TextField, Button,
  CircularProgress, Snackbar, Alert, Stepper, Step, StepLabel,
  Dialog, DialogContent,
  Avatar, Chip, IconButton, Fade, Tooltip, Zoom, Grow, Slide
} from "@mui/material";
import { keyframes, styled } from "@mui/material/styles";

// Icons
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import SearchIcon from "@mui/icons-material/Search";
import PersonIcon from "@mui/icons-material/Person";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import BadgeIcon from "@mui/icons-material/Badge";

// Utils & Hooks
import getAvatarUrl from "../utils/getAvatarUrl";
import { searchParticipants, checkinByQr, listEnabledRegistrationPoints } from "../utils/api";
import useAuth from "../hooks/useAuth";
import QrScanner from "../components/QrScanner";
import FollowersDialog from "../components/FollowersDialog";
import { useNavigate, useLocation } from "react-router-dom";

/* ===================== Config & Translation ===================== */
const FIELD_LABELS = {
  name: "ชื่อ-นามสกุล",
  phone: "เบอร์โทร",
  dept: "ภาควิชา",
  date_year: "ปีการศึกษา",
  email: "อีเมล",
  studentId: "รหัสนิสิต",
};

/* ===================== Modern Gold Theme ===================== */
const Y = {
  main: "#FFC107",      
  dark: "#F57F17",      
  light: "#FFF8E1",     
  glass: "rgba(255, 255, 255, 0.85)", 
  glassBorder: "rgba(255, 193, 7, 0.4)",
  text: "#4E342E",      
  success: "#00C853",   
  error: "#D32F2F"      
};

/* ===================== Animations & Styles ===================== */
const gradientAnimation = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

const scanLineAnimation = keyframes`
  0% { top: 0%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
`;

const PulseButton = styled(Button)(() => ({
  transition: "transform 0.1s ease-in-out, box-shadow 0.2s",
  "&:active": { transform: "scale(0.96)" },
  borderRadius: "14px",
  textTransform: "none",
  fontFamily: "inherit",
}));

const GlassPaper = styled(Paper)(() => ({
  background: Y.glass,
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderRadius: "24px",
  border: `1px solid ${Y.glassBorder}`,
  boxShadow: "0 12px 40px 0 rgba(255, 193, 7, 0.15)",
}));

/* ===================== Main Component ===================== */

export default function CheckinStaffPage() {
  // ✅ ใช้แค่ user ไม่ต้องดึง token แล้ว (เพราะใช้ Cookie)
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // State
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [showQR, setShowQR] = useState(false);
  const [checkingIn, setCheckingIn] = useState("");
  const [snackbar, setSnackbar] = useState({ open: false, msg: "", success: true });
  const [lastQr, setLastQr] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  
  // Dialogs
  const [openResult, setOpenResult] = useState(false);
  const [openNotFound, setOpenNotFound] = useState(false);
  const [notFoundText, setNotFoundText] = useState("");
  
  // Refs
  const qrLock = useRef(false);

  // Registration points
  const [registrationPoint, setRegistrationPoint] = useState("");
  const [registrationPointName, setRegistrationPointName] = useState("");
  const [pointList, setPointList] = useState([]);

  // Followers dialog logic
  const [askFollowersFor, setAskFollowersFor] = useState(null);
  const [showFollowersDialog, setShowFollowersDialog] = useState(false);

  useEffect(() => {
    listEnabledRegistrationPoints()
      .then(res => setPointList(res.data || res))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const pointId = params.get("point") || localStorage.getItem("selectedPointId") || "";
    if (!pointId) {
      navigate("/staff/select-point");
      return;
    }
    setRegistrationPoint(pointId);
    const found = pointList.find(p => p._id === pointId || p.id === pointId);
    setRegistrationPointName(found?.name || pointId);
  }, [location, pointList, navigate]);

  // ฟังก์ชันนี้ถูกเรียกเมื่อกดปุ่มย้อนกลับ (ปิดกล้อง)
  const resetAll = () => {
    setOpenResult(false);
    setOpenNotFound(false);
    setParticipants([]);
    setSearch("");
    setActiveStep(0);
    setLastQr("");
    setShowQR(false); 
    qrLock.current = false;
  };

  // 🌟 ฟังก์ชันเคลียร์หน้าจอหลังจากการเช็คอินหรือปิดหน้าต่างผลลัพธ์ แต่ยังคงให้กล้องทำงานต่อ
  const clearResultKeepCamera = () => {
    setOpenResult(false);
    setOpenNotFound(false);
    setParticipants([]);
    setSearch("");
    setActiveStep(0);
    // เว้นระยะเวลาสักนิดก่อนที่จะปลดล็อคให้สแกนใหม่ เพื่อป้องกันการสแกนซ้ำทันทีที่ปิดหน้าต่าง
    setTimeout(() => {
        setLastQr("");
        qrLock.current = false;
    }, 1500); 
  };

  /* ===================== Logic Handlers ===================== */
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setActiveStep(1);
    setLoading(true);
    setParticipants([]);
    try {
      const res = await searchParticipants({ q: search });
      const enriched = (res.data || []).map(p => ({
        ...p,
        registeredPointName: pointList.find(pt => pt._id === p.registeredPoint)?.name || p.registeredPoint
      }));
      if (enriched.length) {
        setParticipants(enriched);
        setActiveStep(2);
        setOpenResult(true);
      } else {
        setNotFoundText(`ไม่พบข้อมูลผู้เข้าร่วมงานสำหรับ "${search}"`);
        setOpenNotFound(true);
        setActiveStep(0);
      }
    } catch {
      setNotFoundText("เกิดข้อผิดพลาดขณะค้นหาข้อมูล");
      setOpenNotFound(true);
      setActiveStep(0);
    }
    setLoading(false);
  };

  const handleScanQr = async (qrText) => {
    if (!qrText || qrLock.current || qrText === lastQr) return;
    qrLock.current = true;
    setLastQr(qrText);
    setActiveStep(1);
    setLoading(true);

    try {
      const res = await searchParticipants({ q: qrText });
      const enriched = (res.data || []).map(p => ({
        ...p,
        registeredPointName: pointList.find(pt => pt._id === p.registeredPoint)?.name || p.registeredPoint
      }));

      if (enriched.length) {
        setParticipants(enriched);
        setSnackbar({ open: true, msg: "พบข้อมูลผู้เข้าร่วมงานแล้ว", success: true });
        setActiveStep(2);
        setOpenResult(true);

        if (enriched.length === 1 && enriched[0].status !== "checkedIn") {
          setAskFollowersFor({ id: enriched[0]._id, qrCode: enriched[0].qrCode });
          setTimeout(() => { setShowFollowersDialog(true); }, 500);
        }
      } else {
        setNotFoundText(`ไม่พบ QR Code นี้ในระบบ หรือข้อมูลไม่ถูกต้อง`);
        setOpenNotFound(true);
        setActiveStep(0);
        setTimeout(() => { 
            qrLock.current = false; 
            setLastQr(""); 
        }, 2000);
      }
    } catch {
      setNotFoundText("เกิดข้อผิดพลาดในการอ่านข้อมูล QR Code");
      setOpenNotFound(true);
      setActiveStep(0);
      setTimeout(() => { 
          qrLock.current = false;
          setLastQr(""); 
      }, 2000);
    }
    setLoading(false);
  };

  const handleCheckin = async (id, qrCode, followers = 0) => {
    setCheckingIn(id);
    try {
      const res = await checkinByQr({ participantId: id, qrCode, registrationPoint, followers });
      setSnackbar({ open: true, msg: "เช็คอินเข้างานสำเร็จ!", success: true });
      
      setParticipants(prev =>
        prev.map(p =>
          p._id === id
            ? { ...p, status: "checkedIn", checkedInAt: new Date().toISOString(), followers, tags: res.data?.participant?.tags || p.tags }
            : p
        )
      );
      
      setTimeout(() => {
        setCheckingIn("");
        if (showQR) {
           clearResultKeepCamera(); 
        } else {
           resetAll();
        }
      }, 1200); 
    } catch {
      setSnackbar({ open: true, msg: "เช็คอินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", success: false });
      setCheckingIn("");
    }
  };

  const confirmWithFollowers = (followers) => {
    setShowFollowersDialog(false);
    if (!askFollowersFor) return;
    handleCheckin(askFollowersFor.id, askFollowersFor.qrCode, followers);
    setAskFollowersFor(null);
  };

  /* ===================== UI Components ===================== */
  
  const ColorlibStepIcon = (props) => {
    const { active, completed, icon } = props;
    return (
      <Box sx={{
        zIndex: 1, color: '#fff', width: { xs: 36, sm: 44 }, height: { xs: 36, sm: 44 }, 
        display: 'flex', borderRadius: '50%', justifyContent: 'center', alignItems: 'center',
        background: active || completed ? `linear-gradient(136deg, ${Y.main} 0%, ${Y.dark} 100%)` : '#E0E0E0',
        boxShadow: active ? `0 4px 12px ${Y.glassBorder}` : 'none',
        transition: 'all 0.3s',
        transform: active ? 'scale(1.1)' : 'scale(1)'
      }}>
        {icon}
      </Box>
    );
  };

  const steps = [
    { label: 'รอรับข้อมูล', icon: <QrCodeScannerIcon fontSize="small"/> },
    { label: 'ตรวจสอบรายชื่อ', icon: <SearchIcon fontSize="small"/> },
    { label: 'ยืนยันเช็คอิน', icon: <CheckCircleIcon fontSize="small"/> },
  ];

  return (
    <Box sx={{
      minHeight: "100vh",
      background: "linear-gradient(-45deg, #FFECB3, #FFF8E1, #FFD54F, #FFF3E0)",
      backgroundSize: "400% 400%",
      animation: `${gradientAnimation} 15s ease infinite`,
      pt: { xs: 2, sm: 4, md: 6 }, pb: { xs: 4, md: 6 }, px: { xs: 1.5, sm: 2 },
      display: 'flex', flexDirection: 'column', alignItems: 'center'
    }}>

      {/* Main Glass Card */}
      <Fade in={true} timeout={800}>
        <GlassPaper sx={{
          width: "100%", maxWidth: { xs: '100%', sm: 550 },
          p: { xs: 2.5, sm: 4 },
          position: "relative", overflow: "hidden"
        }}>
          
          {/* 🌟 1. ส่วนหัว และ ข้อมูลผู้ปฏิบัติงาน */}
          <Box mb={3}>
             <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
               {/* โลโก้ และ ชื่อระบบ */}
               <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Avatar src="/logo.svg" sx={{ width: { xs: 44, sm: 52 }, height: { xs: 44, sm: 52 }, bgcolor: "#fff", border: `2px solid ${Y.main}`, boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }} />
                  <Box>
                    <Typography variant="h6" fontWeight={900} color={Y.text} lineHeight={1.1} fontSize={{ xs: '1.2rem', sm: '1.4rem' }}>
                      Event Check-in
                    </Typography>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      ระบบเช็คอินผู้เข้าร่วมงาน
                    </Typography>
                  </Box>
               </Stack>

               {/* ปุ่มกลับหน้าหลัก (Dashboard) */}
               <Tooltip title="กลับหน้าแผงควบคุมหลัก">
                 <IconButton onClick={() => navigate("/dashboard")} sx={{ bgcolor: 'rgba(0,0,0,0.04)' }}>
                    <ArrowBackIcon />
                 </IconButton>
               </Tooltip>
             </Stack>

             {/* ข้อมูล Staff และจุดลงทะเบียน */}
             <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" mt={2.5} p={1.5} sx={{ bgcolor: 'rgba(255,255,255,0.6)', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.05)' }} gap={1.5}>
                {/* ข้อมูล Staff */}
                <Stack direction="row" alignItems="center" spacing={1}>
                  <BadgeIcon sx={{ color: Y.dark, fontSize: 20 }} />
                  <Typography variant="body2" color="text.secondary" fontWeight={600}>
                    เจ้าหน้าที่: <Typography component="span" fontWeight={800} color={Y.text}>{user?.fullName || user?.username || "เจ้าหน้าที่จุดเช็คอิน"}</Typography>
                  </Typography>
                </Stack>
                {/* จุดลงทะเบียน */}
                <Chip
                  icon={<LocationOnIcon style={{ color: '#fff' }} />}
                  label={registrationPointName}
                  sx={{
                    bgcolor: Y.dark, color: '#fff', fontWeight: 700,
                    boxShadow: `0 4px 12px ${Y.glassBorder}`,
                    maxWidth: '100%',
                    "& .MuiChip-label": { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
                  }}
               />
             </Stack>
          </Box>

          {/* 🌟 2. สถานะขั้นตอน (Stepper) */}
          <Stepper alternativeLabel activeStep={activeStep} connector={null} sx={{ mb: { xs: 3, sm: 4 } }}>
            {steps.map((s, index) => (
              <Step key={s.label}>
                <StepLabel StepIconComponent={(p) => <ColorlibStepIcon {...p} icon={s.icon} />}>
                  <Typography fontSize={{ xs: '0.75rem', sm: '0.85rem' }} fontWeight={activeStep === index ? 800 : 600} color={activeStep === index ? Y.dark : 'text.disabled'}>
                    {s.label}
                  </Typography>
                </StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* Action Area */}
          <Box sx={{ position: "relative", minHeight: { xs: 220, sm: 250 } }}>
            {!showQR ? (
              <Grow in={!showQR}>
                <Stack spacing={3}>
                   <Typography align="center" variant="h5" fontWeight={900} fontSize={{ xs: '1.35rem', sm: '1.5rem' }} sx={{
                     background: `linear-gradient(45deg, ${Y.text} 30%, ${Y.dark} 90%)`,
                     WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
                   }}>
                     เริ่มต้นการเช็คอินเข้างาน
                   </Typography>

                   <PulseButton
                     fullWidth variant="contained" size="large"
                     onClick={() => {
                        setShowQR(true);
                        setActiveStep(0);
                        qrLock.current = false;
                        setParticipants([]);
                     }}
                     startIcon={<QrCodeScannerIcon />}
                     sx={{
                       bgcolor: Y.main, color: '#000', fontSize: { xs: '1.1rem', sm: '1.2rem' }, fontWeight: 800, py: { xs: 1.5, sm: 2 },
                       boxShadow: "0 8px 24px rgba(255,193,7, 0.4)",
                       ":hover": { bgcolor: Y.dark, color: '#fff' }
                     }}
                   >
                     สแกน QR Code ผู้เข้าร่วมงาน
                   </PulseButton>

                   <Typography variant="body2" align="center" color="text.secondary" fontWeight={600}>
                      &mdash; หรือ ค้นหาจากข้อมูลรายชื่อ &mdash;
                   </Typography>

                   <form onSubmit={handleSearch}>
                     <Stack direction="row" spacing={1}>
                       <TextField
                         fullWidth
                         placeholder="พิมพ์ชื่อ, เบอร์โทร, อีเมล..."
                         value={search}
                         onChange={e => setSearch(e.target.value)}
                         variant="outlined"
                         size="medium"
                         InputProps={{
                            sx: { borderRadius: '14px', bgcolor: 'rgba(255,255,255,0.7)', fontWeight: 600 },
                            startAdornment: <SearchIcon sx={{ color: 'text.disabled', mr: 1 }} />
                         }}
                       />
                       <PulseButton
                         type="submit"
                         variant="outlined"
                         disabled={loading || !search}
                         sx={{
                           borderRadius: '14px', minWidth: { xs: 70, sm: 80 },
                           borderColor: Y.dark, color: Y.dark, fontWeight: 800,
                           borderWidth: 2,
                           ":hover": { borderWidth: 2, bgcolor: Y.light, borderColor: Y.dark }
                         }}
                       >
                         ค้นหา
                       </PulseButton>
                     </Stack>
                   </form>
                </Stack>
              </Grow>
            ) : (
              <Zoom in={showQR}>
                <Box>
                  <Stack direction="row" alignItems="center" mb={1.5} justifyContent="space-between">
                    <Stack direction="row" alignItems="center">
                      <IconButton onClick={resetAll} size="small" sx={{ mr: 1, bgcolor: 'rgba(0,0,0,0.05)' }}>
                         <ArrowBackIcon />
                      </IconButton>
                      <Typography variant="subtitle1" fontWeight={800} color={Y.text}>กำลังเปิดใช้งานกล้อง...</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>หันกล้องไปที่ QR Code ของผู้เข้าร่วม</Typography>
                  </Stack>

                  {/* 🌟 3. กล้องสแกน QR แบบ Responsive อัจฉริยะ */}
                  <Box sx={{
                    position: 'relative', 
                    width: '100%', 
                    height: { xs: '60vh', sm: 400 },
                    minHeight: 300,
                    borderRadius: '24px', 
                    overflow: 'hidden', 
                    bgcolor: '#000',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
                  }}>
                    <QrScanner
                      once={false}
                      onScan={handleScanQr}
                      onError={() => setSnackbar({ open: true, msg: "ไม่สามารถเข้าถึงกล้องได้ โปรดตรวจสอบการอนุญาตใช้งาน", success: false })}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    
                    {/* 🎯 กรอบเล็ง QR (ตรงกลางจอ + เป็นจัตุรัสเสมอ) */}
                    <Box sx={{
                      position: 'absolute', 
                      top: '50%', left: '50%', 
                      transform: 'translate(-50%, -50%)',
                      width: { xs: 240, sm: 280 },  
                      height: { xs: 240, sm: 280 },
                      border: '2px solid rgba(255,255,255,0.1)', 
                      borderRadius: '24px',
                      zIndex: 2, 
                      pointerEvents: 'none',
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)'
                    }}>
                        <Box sx={{ position: 'absolute', top: -2, left: -2, width: 32, height: 32, borderTop: `4px solid ${Y.main}`, borderLeft: `4px solid ${Y.main}`, borderRadius: '24px 0 0 0' }} />
                        <Box sx={{ position: 'absolute', top: -2, right: -2, width: 32, height: 32, borderTop: `4px solid ${Y.main}`, borderRight: `4px solid ${Y.main}`, borderRadius: '0 24px 0 0' }} />
                        <Box sx={{ position: 'absolute', bottom: -2, left: -2, width: 32, height: 32, borderBottom: `4px solid ${Y.main}`, borderLeft: `4px solid ${Y.main}`, borderRadius: '0 0 0 24px' }} />
                        <Box sx={{ position: 'absolute', bottom: -2, right: -2, width: 32, height: 32, borderBottom: `4px solid ${Y.main}`, borderRight: `4px solid ${Y.main}`, borderRadius: '0 0 24px 0' }} />
                        
                        <Box sx={{
                          position: 'absolute', top: 0, left: 10, right: 10, height: '3px',
                          bgcolor: Y.main, boxShadow: `0 0 15px ${Y.main}`,
                          zIndex: 3, animation: `${scanLineAnimation} 2.5s infinite linear`
                        }} />
                    </Box>

                    {loading && (
                      <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 4 }}>
                         <CircularProgress sx={{ color: Y.main, mb: 2 }} />
                         <Typography color="#fff" fontWeight={700}>กำลังประมวลผลข้อมูลผู้เข้าร่วมงาน...</Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Zoom>
            )}
          </Box>
        </GlassPaper>
      </Fade>

      {/* Result Dialog (Ticket Style) */}
      <Dialog
        open={openResult}
        onClose={showQR ? clearResultKeepCamera : resetAll}
        fullWidth
        maxWidth="xs"
        PaperProps={{ style: { borderRadius: 24, padding: 0, background: 'transparent', boxShadow: 'none', margin: 16 } }}
        TransitionComponent={Slide}
        TransitionProps={{ direction: "up" }}
      >
        <DialogContent sx={{ p: 0 }}>
          <Stack spacing={2}>
            {participants.map((p) => {
               const isCheckedIn = p.status === "checkedIn";
               return (
                <Paper key={p._id} sx={{
                  position: 'relative', overflow: 'hidden',
                  bgcolor: '#fff',
                  borderRadius: '24px',
                  p: { xs: 2.5, sm: 3 },
                  maskImage: 'radial-gradient(circle at center bottom, transparent 0, black 0)',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.25)'
                }}>
                  {/* Decorative Header Bar */}
                  <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, bgcolor: isCheckedIn ? Y.success : Y.main }} />

                  {/* Header: Avatar + Name + Tags */}
                  <Stack direction="row" spacing={2} alignItems="center" mb={2} mt={1}>
                    <Avatar src={getAvatarUrl(p)} sx={{ width: { xs: 56, sm: 64 }, height: { xs: 56, sm: 64 }, border: `3px solid ${isCheckedIn ? Y.success : Y.main}` }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                       <Typography variant="h6" fontWeight={800} noWrap sx={{ color: Y.text, fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                         {p.fields?.name || "ไม่ระบุชื่อ"}
                       </Typography>
                       
                       {/* จัดกลุ่ม Chip สถานะ และ Tags ให้อยู่ในบรรทัดเดียวกันแบบ Wrap */}
                       <Stack direction="row" spacing={1} mt={0.5} flexWrap="wrap" useFlexGap>
                           <Chip
                              size="small"
                              label={isCheckedIn ? "เช็คอินเข้างานแล้ว" : "รอยืนยันการเช็คอิน"}
                              sx={{ bgcolor: isCheckedIn ? '#E8F5E9' : '#FFF8E1', color: isCheckedIn ? Y.success : Y.dark, fontWeight: 800 }}
                           />
                           
                           {/* ✅ ลูปแสดง Tags ทั้งหมดที่มี */}
                           {p.tags && p.tags.length > 0 && p.tags.map((tag, index) => (
                              <Chip
                                 key={index}
                                 size="small"
                                 label={tag}
                                 sx={{ 
                                    bgcolor: '#E3F2FD', // สีฟ้าอ่อนสบายตา
                                    color: '#1565C0',   // สีตัวอักษรฟ้าเข้ม
                                    fontWeight: 700 
                                 }}
                              />
                           ))}
                       </Stack>
                    </Box>
                  </Stack>

                  <Box sx={{ my: 2, py: 2, borderTop: '2px dashed #eee', borderBottom: '2px dashed #eee' }}>
                     {Object.entries(p.fields || {}).map(([key, val]) => {
                        if (key === "name") return null; 
                        const label = FIELD_LABELS[key] || key;
                        return (
                          <Stack direction="row" justifyContent="space-between" key={key} mb={0.5} flexWrap="nowrap" gap={1}>
                             <Typography variant="body2" color="text.secondary" noWrap>{label}</Typography>
                             <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ textAlign: 'right', wordBreak: 'break-word' }}>{val || "-"}</Typography>
                          </Stack>
                        );
                     })}
                     
                     {isCheckedIn && (
                       <Box mt={1.5} pt={1.5} borderTop="1px solid #f0f0f0">
                         <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2" color="success.main" fontWeight={600}>เวลาที่เช็คอินเข้างาน</Typography>
                            <Typography variant="body2" fontWeight={800} color="success.main">
                              {new Date(p.checkedInAt).toLocaleTimeString("th-TH", {hour: '2-digit', minute:'2-digit'})} น.
                            </Typography>
                         </Stack>
                         <Stack direction="row" justifyContent="space-between" mt={0.5}>
                            <Typography variant="body2" color="text.secondary" fontWeight={600}>จำนวนผู้ติดตาม</Typography>
                            <Typography variant="body2" fontWeight={800}>{p.followers ?? 0} คน</Typography>
                         </Stack>
                       </Box>
                     )}
                  </Box>

                  {/* Action Button */}
                  {isCheckedIn ? (
                    <Button
                      fullWidth variant="contained" color="success"
                      startIcon={<CheckCircleIcon />}
                      onClick={showQR ? clearResultKeepCamera : resetAll}
                      sx={{ borderRadius: '12px', fontWeight: 800, py: 1.5, boxShadow: 'none' }}
                    >
                      เช็คอินเรียบร้อย (ปิดหน้าต่างเพื่อสแกนต่อ)
                    </Button>
                  ) : (
                    <PulseButton
                      fullWidth
                      variant="contained"
                      onClick={() => {
                        setAskFollowersFor({ id: p._id, qrCode: p.qrCode });
                        setShowFollowersDialog(true);
                      }}
                      disabled={checkingIn === p._id}
                      sx={{
                        bgcolor: Y.main, color: '#3E2723', fontWeight: 900, fontSize: { xs: '1.1rem', sm: '1.2rem' }, py: 1.5,
                        boxShadow: `0 8px 24px ${Y.glassBorder}`,
                        ":hover": { bgcolor: Y.dark, color: '#fff' }
                      }}
                    >
                      {checkingIn === p._id ? <CircularProgress size={26} color="inherit"/> : "ยืนยันการเช็คอินเข้างาน"}
                    </PulseButton>
                  )}
                </Paper>
               );
            })}
          </Stack>
          
          <Box sx={{ mt: 2, textAlign: 'center' }}>
             <IconButton onClick={showQR ? clearResultKeepCamera : resetAll} sx={{ bgcolor: 'rgba(255,255,255,0.9)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', ":hover": { bgcolor: '#fff' } }}>
                <CloseIcon />
             </IconButton>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Not Found Dialog */}
      <Dialog open={openNotFound} onClose={showQR ? clearResultKeepCamera : resetAll} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '24px', m: 2 } }}>
        <DialogContent sx={{ textAlign: 'center', py: { xs: 3, sm: 4 } }}>
           <Box sx={{ width: 72, height: 72, bgcolor: '#FFEBEE', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
              <SearchIcon sx={{ fontSize: 36, color: Y.error }} />
           </Box>
           <Typography variant="h6" fontWeight={800} color={Y.error} gutterBottom>
              ไม่พบข้อมูลผู้เข้าร่วมงานในระบบ
           </Typography>
           <Typography color="text.secondary" mb={3} fontSize="0.95rem" fontWeight={500}>
              {notFoundText}
           </Typography>
           <Button variant="outlined" onClick={showQR ? clearResultKeepCamera : resetAll} color="error" sx={{ borderRadius: '12px', px: 4, py: 1, fontWeight: 800, borderWidth: 2, ":hover": { borderWidth: 2 } }}>
             สแกนใหม่อีกครั้ง / ค้นหาใหม่
           </Button>
        </DialogContent>
      </Dialog>

      {/* Followers Dialog */}
      <FollowersDialog open={showFollowersDialog} onClose={() => setShowFollowersDialog(false)} onConfirm={confirmWithFollowers} />

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} sx={{ bottom: { xs: 20, sm: 24 } }}>
        <Alert severity={snackbar.success ? "success" : "error"} variant="filled" onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%', borderRadius: '14px', fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
          {snackbar.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
