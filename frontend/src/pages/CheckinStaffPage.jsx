// src/pages/CheckinStaffPage.jsx
import React, { useEffect, useState, useRef } from "react";
import {
  Box, Paper, Typography, Stack, TextField, Button,
  CircularProgress, Snackbar, Alert, Stepper, Step, StepLabel,
  Dialog, DialogContent,
  Avatar, Chip, IconButton, Fade, Tooltip, useMediaQuery, 
  Grow, Zoom, Slide
} from "@mui/material";
import { keyframes, styled, useTheme } from "@mui/material/styles";

// Icons
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import SearchIcon from "@mui/icons-material/Search";
import PersonIcon from "@mui/icons-material/Person";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

// Utils & Hooks
import getAvatarUrl from "../utils/getAvatarUrl";
import { searchParticipants, checkinByQr, listRegistrationPoints } from "../utils/api";
import useAuth from "../hooks/useAuth";
import QrScanner from "../components/QrScanner";
import FollowersDialog from "../components/FollowersDialog";
import { useNavigate, useLocation } from "react-router-dom";

/* ===================== Config & Translation ===================== */
// แปลงชื่อ Field เป็นภาษาไทย
const FIELD_LABELS = {
  name: "ชื่อ-นามสกุล",
  phone: "เบอร์โทร",
  dept: "ภาควิชา",
  date_year: "ปีการศึกษา",
  email: "อีเมล",
  studentId: "รหัสนิสิต",
  // เพิ่ม field อื่นๆ ที่ต้องการแปลตรงนี้ได้เลยครับ
};

/* ===================== Modern Gold Theme ===================== */
const Y = {
  main: "#FFC107",      // Primary Gold
  dark: "#F57F17",      // Deep Gold/Orange
  light: "#FFF8E1",     // Light Cream
  glass: "rgba(255, 255, 255, 0.75)", // Glass effect
  glassBorder: "rgba(255, 193, 7, 0.3)",
  text: "#4E342E",      // Dark Brown Text
  success: "#00C853",   // Vivid Green
  error: "#D32F2F"      // Red
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

const PulseButton = styled(Button)(({ theme }) => ({
  transition: "transform 0.1s ease-in-out, box-shadow 0.2s",
  "&:active": { transform: "scale(0.96)" },
  borderRadius: "12px",
  textTransform: "none",
  fontFamily: "inherit",
}));

const GlassPaper = styled(Paper)(({ theme }) => ({
  background: Y.glass,
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderRadius: "24px",
  border: `1px solid ${Y.glassBorder}`,
  boxShadow: "0 8px 32px 0 rgba(255, 193, 7, 0.15)",
}));

/* ===================== Main Component ===================== */

export default function CheckinStaffPage() {
  const theme = useTheme();
  const { token } = useAuth();
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

  // Load registration points
  useEffect(() => {
    listRegistrationPoints(token)
      .then(res => setPointList(res.data || res))
      .catch(() => {});
  }, [token]);

  // Determine selected point
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

  /* ===================== Logic Handlers ===================== */
  const handleSearch = async (e) => {
    e.preventDefault();
    setActiveStep(1);
    setLoading(true);
    setParticipants([]);
    try {
      const res = await searchParticipants({ q: search }, token);
      const enriched = (res.data || []).map(p => ({
        ...p,
        registeredPointName: pointList.find(pt => pt._id === p.registeredPoint)?.name || p.registeredPoint
      }));
      if (enriched.length) {
        setParticipants(enriched);
        setActiveStep(2);
        setOpenResult(true);
        setShowQR(false);
      } else {
        setNotFoundText(`ไม่พบข้อมูลสำหรับ "${search}"`);
        setOpenNotFound(true);
        setActiveStep(0);
      }
    } catch {
      setNotFoundText("เกิดข้อผิดพลาดขณะค้นหา");
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
      const res = await searchParticipants({ q: qrText }, token);
      const enriched = (res.data || []).map(p => ({
        ...p,
        registeredPointName: pointList.find(pt => pt._id === p.registeredPoint)?.name || p.registeredPoint
      }));

      if (enriched.length) {
        setParticipants(enriched);
        setSnackbar({ open: true, msg: "สแกนสำเร็จ!", success: true });
        setActiveStep(2);
        setOpenResult(true);
        setShowQR(false);
        setTimeout(() => { qrLock.current = false; }, 200);

        if (enriched.length === 1 && enriched[0].status !== "checkedIn") {
          setAskFollowersFor({ id: enriched[0]._id, qrCode: enriched[0].qrCode });
          setTimeout(() => {
             setShowFollowersDialog(true);
          }, 500);
        }
      } else {
        setNotFoundText(`ไม่พบข้อมูล QR Code นี้`);
        setOpenNotFound(true);
        setActiveStep(0);
        setTimeout(() => { qrLock.current = false; }, 1500);
      }
    } catch {
      setNotFoundText("เกิดข้อผิดพลาดในการอ่านข้อมูล");
      setOpenNotFound(true);
      setActiveStep(0);
      setTimeout(() => { qrLock.current = false; }, 1500);
    }
    setLoading(false);
  };

  const handleCheckin = async (id, qrCode, auto = false, followers = 0) => {
    setCheckingIn(id);
    try {
      await checkinByQr({ participantId: id, qrCode, registrationPoint, followers }, token);
      setSnackbar({ open: true, msg: "เช็คอินสำเร็จ!", success: true });
      
      setParticipants(prev =>
        prev.map(p =>
          p._id === id
            ? {
                ...p,
                status: "checkedIn",
                checkedInAt: new Date().toISOString(),
                registeredPoint: p.registeredPoint,
                registeredPointName: p.registeredPointName,
                followers
              }
            : p
        )
      );
      
      setTimeout(() => {
        setCheckingIn("");
        if (auto) resetAll();
      }, 900);
    } catch {
      setSnackbar({ open: true, msg: "เช็คอินไม่สำเร็จ", success: false });
      setCheckingIn("");
    }
  };

  const confirmWithFollowers = (followers) => {
    setShowFollowersDialog(false);
    if (!askFollowersFor) return;
    handleCheckin(askFollowersFor.id, askFollowersFor.qrCode, false, followers);
    setAskFollowersFor(null);
  };

  /* ===================== UI Components ===================== */
  
  const ColorlibStepIcon = (props) => {
    const { active, completed } = props;
    return (
      <Box sx={{
        zIndex: 1, color: '#fff', width: 40, height: 40, display: 'flex', borderRadius: '50%',
        justifyContent: 'center', alignItems: 'center',
        background: active || completed ? `linear-gradient(136deg, ${Y.main} 0%, ${Y.dark} 100%)` : '#E0E0E0',
        boxShadow: active ? `0 4px 10px ${Y.glassBorder}` : 'none',
        transition: 'all 0.3s'
      }}>
        {props.icon}
      </Box>
    );
  };

  const steps = [
    { label: 'รอสแกน', icon: <QrCodeScannerIcon fontSize="small"/> },
    { label: 'กำลังหา', icon: <SearchIcon fontSize="small"/> },
    { label: 'ผลลัพธ์', icon: <PersonIcon fontSize="small"/> },
  ];

  return (
    <Box sx={{
      minHeight: "100vh",
      background: "linear-gradient(-45deg, #FFECB3, #FFF8E1, #FFD54F, #FFF3E0)",
      backgroundSize: "400% 400%",
      animation: `${gradientAnimation} 15s ease infinite`,
      pt: { xs: 2, md: 6 }, pb: 4, px: 2,
      display: 'flex', flexDirection: 'column', alignItems: 'center'
    }}>

      {/* Main Glass Card */}
      <Fade in={true} timeout={800}>
        <GlassPaper sx={{
          width: "100%", maxWidth: 550,
          p: { xs: 3, md: 4 },
          position: "relative", overflow: "hidden"
        }}>
          {/* Header Row */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
             <Stack direction="row" alignItems="center" spacing={1.5}>
                <Avatar src="/logo.svg" sx={{ width: 48, height: 48, bgcolor: "#fff", border: `2px solid ${Y.main}` }} />
                <Box>
                  <Typography variant="h6" fontWeight={800} color={Y.text} lineHeight={1.1}>
                    Check-in Staff
                  </Typography>
                  <Typography variant="caption" color="text.secondary" fontWeight={500}>
                    ระบบเช็คอินเจ้าหน้าที่
                  </Typography>
                </Box>
             </Stack>
             <Chip
                icon={<LocationOnIcon style={{ color: '#fff' }} />}
                label={registrationPointName}
                sx={{
                  bgcolor: Y.dark, color: '#fff', fontWeight: 700,
                  boxShadow: `0 4px 12px ${Y.glassBorder}`
                }}
             />
          </Stack>

          {/* Stepper */}
          <Stepper alternativeLabel activeStep={activeStep} connector={null} sx={{ mb: 4 }}>
            {steps.map((s, index) => (
              <Step key={s.label}>
                <StepLabel StepIconComponent={(p) => <ColorlibStepIcon {...p} icon={s.icon} />}>
                  <Typography fontWeight={activeStep === index ? 700 : 500} color={activeStep === index ? Y.dark : 'text.disabled'}>
                    {s.label}
                  </Typography>
                </StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* Action Area */}
          <Box sx={{ position: "relative", minHeight: 250 }}>
            {!showQR ? (
              <Grow in={!showQR}>
                <Stack spacing={3}>
                   <Typography align="center" variant="h5" fontWeight={900} sx={{
                     background: `linear-gradient(45deg, ${Y.text} 30%, ${Y.dark} 90%)`,
                     WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
                   }}>
                     พร้อมเช็คอินไหม?
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
                       bgcolor: Y.main, color: '#000', fontSize: '1.2rem', fontWeight: 800, py: 2,
                       boxShadow: "0 8px 20px rgba(255,193,7, 0.4)",
                       ":hover": { bgcolor: Y.dark, color: '#fff' }
                     }}
                   >
                     เปิดกล้องสแกน QR
                   </PulseButton>

                   <Typography variant="body2" align="center" color="text.secondary">
                      &mdash; หรือ &mdash;
                   </Typography>

                   <form onSubmit={handleSearch}>
                     <Stack direction="row" spacing={1}>
                       <TextField
                         fullWidth
                         placeholder="พิมพ์ชื่อ / เบอร์ / อีเมล..."
                         value={search}
                         onChange={e => setSearch(e.target.value)}
                         variant="outlined"
                         size="medium"
                         InputProps={{
                            sx: { borderRadius: '12px', bgcolor: 'rgba(255,255,255,0.6)' },
                            startAdornment: <SearchIcon sx={{ color: 'text.disabled', mr: 1 }} />
                         }}
                       />
                       <PulseButton
                         type="submit"
                         variant="outlined"
                         disabled={loading || !search}
                         sx={{
                           borderRadius: '12px', minWidth: 80,
                           borderColor: Y.dark, color: Y.dark, fontWeight: 700,
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
                  <Stack direction="row" alignItems="center" mb={2}>
                    <IconButton onClick={() => setShowQR(false)}>
                       <ArrowBackIcon />
                    </IconButton>
                    <Typography variant="h6" fontWeight={700} ml={1}>Scan QR Code</Typography>
                  </Stack>

                  <Box sx={{
                    position: 'relative', width: '100%', height: 300,
                    borderRadius: '20px', overflow: 'hidden', bgcolor: '#000',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
                  }}>
                    <QrScanner
                      onScan={handleScanQr}
                      onError={() => setSnackbar({ open: true, msg: "กล้องมีปัญหา", success: false })}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    
                    <Box sx={{
                      position: 'absolute', top: 20, left: 20, right: 20, bottom: 20,
                      border: '2px solid rgba(255,255,255,0.3)', borderRadius: '12px',
                      zIndex: 2, pointerEvents: 'none'
                    }}>
                        <Box sx={{ position: 'absolute', top: -2, left: -2, width: 20, height: 20, borderTop: `4px solid ${Y.main}`, borderLeft: `4px solid ${Y.main}` }} />
                        <Box sx={{ position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderTop: `4px solid ${Y.main}`, borderRight: `4px solid ${Y.main}` }} />
                        <Box sx={{ position: 'absolute', bottom: -2, left: -2, width: 20, height: 20, borderBottom: `4px solid ${Y.main}`, borderLeft: `4px solid ${Y.main}` }} />
                        <Box sx={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderBottom: `4px solid ${Y.main}`, borderRight: `4px solid ${Y.main}` }} />
                    </Box>
                    
                    <Box sx={{
                      position: 'absolute', top: 0, left: 10, right: 10, height: '2px',
                      bgcolor: 'red', boxShadow: '0 0 10px red',
                      zIndex: 3, animation: `${scanLineAnimation} 2s infinite linear`
                    }} />

                    {loading && (
                      <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4 }}>
                         <CircularProgress sx={{ color: Y.main }} />
                      </Box>
                    )}
                  </Box>
                  <Typography align="center" variant="caption" display="block" mt={1} color="text.secondary">
                    วาง QR Code ให้อยู่ในกรอบ
                  </Typography>
                </Box>
              </Zoom>
            )}
          </Box>
        </GlassPaper>
      </Fade>

      {/* Result Dialog (Ticket Style) */}
      <Dialog
        open={openResult}
        onClose={() => resetAll()}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          style: { borderRadius: 24, padding: 0, background: 'transparent', boxShadow: 'none' }
        }}
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
                  borderRadius: '20px',
                  p: 3,
                  maskImage: 'radial-gradient(circle at center bottom, transparent 0, black 0)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
                }}>
                  {/* Decorative Header Bar */}
                  <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, bgcolor: isCheckedIn ? Y.success : Y.main }} />

                  {/* Header: Avatar + Name */}
                  <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                    <Avatar
                      src={getAvatarUrl(p)}
                      sx={{
                        width: 64, height: 64,
                        border: `3px solid ${isCheckedIn ? Y.success : Y.main}`
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                       <Typography variant="h6" fontWeight={800} noWrap sx={{ color: Y.text }}>
                         {p.fields?.name || "ไม่ระบุชื่อ"}
                       </Typography>
                       <Chip
                          size="small"
                          label={isCheckedIn ? "Checked-In" : "Ready"}
                          sx={{
                            bgcolor: isCheckedIn ? '#E8F5E9' : '#FFF8E1',
                            color: isCheckedIn ? Y.success : Y.dark,
                            fontWeight: 700
                          }}
                       />
                    </Box>
                  </Stack>

                  <Box sx={{ my: 2, py: 2, borderTop: '1px dashed #ddd', borderBottom: '1px dashed #ddd' }}>
                     {Object.entries(p.fields || {}).map(([key, val]) => {
                        if (key === "name") return null; // ชื่อแสดงข้างบนแล้ว
                        
                        // แปลง Key เป็นภาษาไทย (ถ้าไม่มีใน map จะใช้ key เดิม)
                        const label = FIELD_LABELS[key] || key;
                        
                        return (
                          <Stack direction="row" justifyContent="space-between" key={key} mb={0.5}>
                             <Typography variant="body2" color="text.secondary">{label}</Typography>
                             <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ textAlign: 'right', pl: 1 }}>{val || "-"}</Typography>
                          </Stack>
                        );
                     })}
                     
                     {isCheckedIn && (
                       <>
                         <Stack direction="row" justifyContent="space-between" mt={1}>
                            <Typography variant="body2" color="success.main">เวลาเช็คอิน</Typography>
                            <Typography variant="body2" fontWeight={700} color="success.main">
                              {new Date(p.checkedInAt).toLocaleTimeString("th-TH", {hour: '2-digit', minute:'2-digit'})} น.
                            </Typography>
                         </Stack>
                         <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">ผู้ติดตาม</Typography>
                            <Typography variant="body2" fontWeight={700}>{p.followers ?? 0}</Typography>
                         </Stack>
                       </>
                     )}
                  </Box>

                  {/* Action Button */}
                  {isCheckedIn ? (
                    <Button
                      fullWidth variant="contained" color="success"
                      startIcon={<CheckCircleIcon />}
                      onClick={() => resetAll()}
                      sx={{ borderRadius: 3, fontWeight: 700, boxShadow: 'none' }}
                    >
                      เรียบร้อย (ปิด)
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
                        bgcolor: Y.main, color: '#3E2723', fontWeight: 800, fontSize: '1.1rem', py: 1.5,
                        boxShadow: `0 8px 24px ${Y.glassBorder}`,
                        ":hover": { bgcolor: Y.dark, color: '#fff' }
                      }}
                    >
                      {checkingIn === p._id ? <CircularProgress size={24} color="inherit"/> : "CHECK IN"}
                    </PulseButton>
                  )}
                </Paper>
               );
            })}
          </Stack>
          
          <Box sx={{ mt: 2, textAlign: 'center' }}>
             <IconButton onClick={() => resetAll()} sx={{ bgcolor: 'rgba(255,255,255,0.8)', ":hover": { bgcolor: '#fff' } }}>
                <CloseIcon />
             </IconButton>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Not Found Dialog */}
      <Dialog open={openNotFound} onClose={() => resetAll()} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogContent sx={{ textAlign: 'center', py: 4 }}>
           <Box sx={{ width: 80, height: 80, bgcolor: '#FFEBEE', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
              <SearchIcon sx={{ fontSize: 40, color: Y.error }} />
           </Box>
           <Typography variant="h6" fontWeight={700} color={Y.error} gutterBottom>
              ไม่พบข้อมูล
           </Typography>
           <Typography color="text.secondary" mb={3}>
              {notFoundText}
           </Typography>
           <Button variant="outlined" onClick={() => resetAll()} color="error" sx={{ borderRadius: 3, px: 4, fontWeight: 700 }}>
             ลองใหม่
           </Button>
        </DialogContent>
      </Dialog>

      {/* Followers Dialog */}
      <FollowersDialog
        open={showFollowersDialog}
        onClose={() => setShowFollowersDialog(false)}
        onConfirm={confirmWithFollowers}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={2500}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.success ? "success" : "error"}
          variant="filled"
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          sx={{ width: '100%', borderRadius: 3, fontWeight: 600, boxShadow: '0 8px 20px rgba(0,0,0,0.2)' }}
        >
          {snackbar.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}