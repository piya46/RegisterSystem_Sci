// src/pages/CheckinStaffPage.jsx
import React, { useEffect, useState, useRef } from "react";
import {
  Box, Paper, Typography, Stack, TextField, Button,
  CircularProgress, Snackbar, Alert, Stepper, Step, StepLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Avatar, Chip, Divider, Fade, Tooltip, useMediaQuery, LinearProgress
} from "@mui/material";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import SearchIcon from "@mui/icons-material/ManageSearch";
import PersonIcon from "@mui/icons-material/Person";
import CloseIcon from "@mui/icons-material/Close";
import getAvatarUrl from "../utils/getAvatarUrl";
import { searchParticipants, checkinByQr, listRegistrationPoints } from "../utils/api";
import useAuth from "../hooks/useAuth";
import QrScanner from "../components/QrScanner";
import FollowersDialog from "../components/FollowersDialog";
import { useTheme } from "@mui/material/styles";
import { useNavigate, useLocation } from "react-router-dom";

/* ===================== Theme Yellows ===================== */
const Y = {
  main: "#FFC107",      // amber 500
  dark: "#FFB300",      // amber 600
  light: "#FFE082",     // amber 200
  pale: "#FFF8E1",      // amber 50
  chipBg: "#FFF3CD",    // soft chip bg
  chipText: "#8A6D3B",  // chip text
  success: "#3ecf8e"
};

/* ===================== Big Step Icon (Yellow) ===================== */
function BigStepIcon(props) {
  const { icon, active, completed } = props;
  return (
    <Box sx={{
      width: 48, height: 48, borderRadius: "50%",
      background: active || completed
        ? "linear-gradient(135deg, #FFC107 55%, #FFF3E0 100%)"
        : Y.pale,
      display: "flex", alignItems: "center", justifyContent: "center",
      border: active ? `3.5px solid ${Y.main}` : `2px solid ${Y.pale}`,
      boxShadow: active ? "0 2px 16px rgba(255,193,7,.35)" : "0 1px 8px rgba(255,193,7,.18)",
      transition: "all .18s"
    }}>
      {React.cloneElement(icon, {
        sx: { fontSize: 30, color: active || completed ? "#5D4037" : "#BFA066" }
      })}
    </Box>
  );
}

const STEPS = [
  { label: "รอสแกน QR", icon: <QrCodeScannerIcon /> },
  { label: "ค้นหาข้อมูล", icon: <SearchIcon /> },
  { label: "ผลลัพธ์", icon: <PersonIcon /> },
];

export default function CheckinStaffPage() {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));
  const isMd = useMediaQuery(theme.breakpoints.down("md"));
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
  const [openResult, setOpenResult] = useState(false);
  const [openNotFound, setOpenNotFound] = useState(false);
  const [notFoundText, setNotFoundText] = useState("");
  const qrLock = useRef(false);

  // Registration points
  const [registrationPoint, setRegistrationPoint] = useState("");
  const [registrationPointName, setRegistrationPointName] = useState("");
  const [pointList, setPointList] = useState([]);

  // Followers dialog
  const [askFollowersFor, setAskFollowersFor] = useState(null);
  const [showFollowersDialog, setShowFollowersDialog] = useState(false);

  // Load registration points
  useEffect(() => {
    listRegistrationPoints(token)
      .then(res => setPointList(res.data || res))
      .catch(() => {});
  }, [token]);

  // Determine selected point from URL or localStorage
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

  /* ===================== Manual Search ===================== */
  const handleSearch = async (e) => {
    e.preventDefault();
    setActiveStep(1);
    setLoading(true);
    setParticipants([]);
    try {
      const res = await searchParticipants({ q: search }, token);
      const enriched = (res.data || []).map(p => ({
        ...p,
        registeredPointName:
          pointList.find(pt => pt._id === p.registeredPoint)?.name ||
          p.registeredPoint
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

  /* ===================== QR Scan ===================== */
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
        registeredPointName:
          pointList.find(pt => pt._id === p.registeredPoint)?.name ||
          p.registeredPoint
      }));
      if (enriched.length) {
        setParticipants(enriched);
        setSnackbar({ open: true, msg: "สแกนสำเร็จ: " + qrText, success: true });
        setActiveStep(2);
        setOpenResult(true);
        setShowQR(false);
        setTimeout(() => { qrLock.current = false; }, 200);

        if (enriched.length === 1 && enriched[0].status !== "checkedIn") {
          setAskFollowersFor({ id: enriched[0]._id, qrCode: enriched[0].qrCode });
          setShowFollowersDialog(true);
        }
      } else {
        setNotFoundText(`ไม่พบข้อมูลสำหรับ QR "${qrText}"`);
        setOpenNotFound(true);
        setActiveStep(0);
        setTimeout(() => { qrLock.current = false; }, 700);
      }
    } catch {
      setNotFoundText("เกิดข้อผิดพลาดขณะค้นหา");
      setOpenNotFound(true);
      setActiveStep(0);
      setTimeout(() => { qrLock.current = false; }, 700);
    }
    setLoading(false);
  };

  /* ===================== Check-in Action ===================== */
  const handleCheckin = async (id, qrCode, auto = false, followers = 0) => {
    setCheckingIn(id);
    try {
      await checkinByQr(
        { participantId: id, qrCode, registrationPoint, followers },
        token
      );
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

  const handleModalClose = () => resetAll();
  const handleNotFoundClose = () => resetAll();

  function CustomProgressBar() {
    return (
      <LinearProgress
        variant="determinate"
        value={((activeStep) / (STEPS.length - 1)) * 100}
        sx={{
          height: 8,
          borderRadius: 5,
          bgcolor: Y.pale,
          "& .MuiLinearProgress-bar": { bgcolor: Y.main },
          mb: 3,
        }}
      />
    );
  }

  return (
    <Box sx={{
      minHeight: "100vh",
      background:
        "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #fff3cd 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)",
      pt: isXs ? 2 : 6, px: isXs ? 0.5 : 2
    }}>
      <Fade in>
        <Paper elevation={16} sx={{
          width: "100%", maxWidth: isXs ? 380 : isMd ? 500 : 640, mx: "auto",
          p: { xs: 2, sm: 3, md: 4 }, mt: { xs: 1, sm: 3 }, borderRadius: 5,
          boxShadow: "0 14px 36px rgba(255,193,7,0.25)",
          bgcolor: "#fffefa",
          position: "relative",
          overflow: "hidden",
          border: "1px solid rgba(255,193,7,.25)"
        }}>
          {/* Watermark logo in corner */}
          <Avatar
            src="/logo.svg"
            alt="Logo"
            sx={{
              width: 64, height: 64,
              position: "absolute", right: 12, top: 12,
              bgcolor: "#fff",
              border: "2px solid rgba(255,193,7,.35)",
              boxShadow: "0 6px 18px rgba(255,193,7,.35)"
            }}
          />

          {/* จุดลงทะเบียน */}
          <Stack direction="row" justifyContent="center" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Chip
              sx={{
                fontWeight: 800, px: 2, fontSize: 16,
                bgcolor: Y.chipBg, color: Y.chipText,
                ".MuiChip-label": { display: "flex", alignItems: "center" },
                border: "1px solid rgba(255,193,7,.45)"
              }}
              label={
                <span>
                  <QrCodeScannerIcon sx={{ mr: .7, fontSize: 22, mb: -0.5, color: Y.dark }} />
                  จุดลงทะเบียน: <b>{registrationPointName || registrationPoint}</b>
                </span>
              }
            />
            <Button
              size="small"
              variant="outlined"
              sx={{
                fontWeight: 700, py: 0.6, px: 2, borderRadius: 3,
                borderColor: Y.main, color: "#6B5B00",
                ":hover": { borderColor: Y.dark, backgroundColor: "#FFF8E1" }
              }}
              onClick={() => { resetAll(); navigate("/staff/select-point"); }}
            >
              เปลี่ยนจุด
            </Button>
          </Stack>

          {/* Header with big title & logo */}
          <Stack direction="row" spacing={1.2} alignItems="center" justifyContent="center" sx={{ mb: 2.5 }}>
            <Avatar
              src="/logo.svg"
              alt="Logo"
              sx={{
                width: 48, height: 48,
                bgcolor: "#fff",
                border: "2px solid rgba(255,193,7,.6)"
              }}
            />
            <Typography variant={isXs ? "h6" : "h5"} color="primary" fontWeight={900} sx={{ letterSpacing: .6, color: "#6B5B00" }}>
              ระบบเช็คอินสำหรับเจ้าหน้าที่
            </Typography>
          </Stack>

          <CustomProgressBar/>

          <Stepper activeStep={activeStep} alternativeLabel sx={{ mt: 1, mb: 2 }}>
            {STEPS.map(step => (
              <Step key={step.label}>
                <StepLabel
                  StepIconComponent={p => <BigStepIcon {...p} icon={step.icon} />}
                  sx={{
                    ".MuiStepLabel-label": { fontWeight: 700, color: "#6B5B00", fontSize: 16 },
                    ".MuiStepIcon-text": { fontSize: 18, fill: "#6B5B00" }
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: isXs ? 13 : 16 }}>
                    {step.label}
                  </span>
                </StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* คำแนะนำ */}
          <Paper sx={{
            bgcolor: "#FFF3CD", borderRadius: 3,
            p: isXs ? 1 : 2, mb: 2,
            boxShadow: "0 2px 10px rgba(255,193,7,0.18)",
            border: "1px solid rgba(255,193,7,.45)"
          }} variant="outlined">
            <Typography fontSize={15} sx={{ color: "#6B5B00", fontWeight: 700 }}>
              <b>1.</b> กรอกชื่อ/เบอร์/อีเมล หรือ <b>2.</b> <b>กด “สแกน QR”</b> เพื่อเช็คอิน
            </Typography>
          </Paper>

          {/* ฟอร์มค้นหา */}
          <form onSubmit={handleSearch} autoComplete="off">
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
              <TextField
                label="ค้นหาด้วยชื่อ/เบอร์/อีเมล/รหัส QR"
                value={search}
                onChange={e => setSearch(e.target.value)}
                size="small"
                fullWidth
                autoFocus
                sx={{
                  bgcolor: "#fff",
                  borderRadius: 2,
                  "& .MuiInputBase-root": { borderRadius: 2 }
                }}
                disabled={loading || showQR}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={loading || !search}
                sx={{
                  fontWeight: 800, px: 2.5, minWidth: 90, borderRadius: 2,
                  bgcolor: Y.main, ":hover": { bgcolor: Y.dark },
                  boxShadow: "0 3px 14px rgba(255,193,7,.45)", color: "#3E2723"
                }}
                startIcon={<SearchIcon />}
              >
                ค้นหา
              </Button>
              <Tooltip title="เปิดกล้องสแกน QR" arrow>
                <Button
                  variant={showQR ? "contained" : "outlined"}
                  onClick={() => {
                    setShowQR(v => !v);
                    setActiveStep(0);
                    setParticipants([]);
                    qrLock.current = false;
                  }}
                  sx={{
                    borderRadius: 2, py: 1.2,
                    ...(showQR
                      ? { bgcolor: Y.light, color: "#3E2723",
                          ":hover": { bgcolor: "#FFD54F" },
                          boxShadow: "0 3px 14px rgba(255,193,7,.35)" }
                      : { borderColor: Y.main, color: "#6B5B00",
                          ":hover": { borderColor: Y.dark, backgroundColor: "#FFF8E1" } })
                  }}
                  startIcon={<QrCodeScannerIcon sx={{ color: showQR ? "#3E2723" : Y.dark }} />}
                >
                  สแกน QR
                </Button>
              </Tooltip>
            </Stack>
          </form>

          {/* QR Scanner */}
          {showQR && (
            <Box sx={{
              mt: 3, mb: 2, mx: "auto",
              width: "100%", maxWidth: isXs ? 280 : 360,
              borderRadius: 3, overflow: "hidden",
              boxShadow: "0 2px 24px rgba(255,193,7,.35)",
              position: "relative", bgcolor: "#fff",
              border: "1px solid rgba(255,193,7,.35)"
            }}>
              <QrScanner
                onScan={handleScanQr}
                onError={() => setSnackbar({ open: true, msg: "สแกน QR ไม่สำเร็จ", success: false })}
                style={{ width: "100%", minHeight: isXs ? 160 : 210 }}
              />
              {activeStep === 1 && (
                <Typography sx={{ mt: 2, mb: 2, textAlign: "center", color: "#6B5B00" }}>
                  <CircularProgress size={26} sx={{ mr: 1, color: Y.main }} />
                  <b>กำลังค้นหาข้อมูล...</b>
                </Typography>
              )}
              {lastQr && (
                <Typography variant="caption" sx={{
                  mt: 1, mb: 0, display: "block", textAlign: "center",
                  fontWeight: 600, letterSpacing: 0.2, color: "#6B5B00"
                }}>
                  ผลสแกน: <b style={{ color: Y.dark }}>{lastQr}</b>
                </Typography>
              )}
            </Box>
          )}

          {/* Loading สำหรับ manual search */}
          {!showQR && loading && (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <CircularProgress size={36} sx={{ color: Y.main }} />
              <Typography sx={{ mt: 2, color: "#6B5B00" }}>กำลังค้นหาข้อมูล...</Typography>
            </Box>
          )}
        </Paper>
      </Fade>

      {/* ผลลัพธ์การค้นหา */}
      <Dialog open={openResult} onClose={handleModalClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{
          textAlign: "center", fontWeight: 900, color: "#6B5B00", letterSpacing: .4, pb: 1
        }}>
          <PersonIcon sx={{ mb: -0.7, mr: 1, fontSize: 28, color: Y.dark }} />
          ผลลัพธ์การค้นหา
          <Button aria-label="close" onClick={handleModalClose} sx={{
            position: "absolute", right: 12, top: 13, color: "#8D6E63", minWidth: 32, p: 0
          }}>
            <CloseIcon />
          </Button>
        </DialogTitle>
        <DialogContent sx={{ position: "relative" }}>
          {/* watermark logo */}
          <Avatar
            src="/logo.svg"
            alt="logo"
            sx={{
              width: 56, height: 56, position: "absolute", right: 8, top: 8,
              bgcolor: "#fff", border: "2px solid rgba(255,193,7,.35)"
            }}
          />
          {participants.length > 0 ? (
            <Stack spacing={2}>
              {participants.map(p => (
                <Paper key={p._id} sx={{
                  p: 2, mb: 1.5, borderRadius: 4,
                  background: p.status === "checkedIn" ? "#e7fff0" : "#FFFDF4",
                  border: p.status === "checkedIn" ? "2px solid #3ecf8e" : "2px solid rgba(255,193,7,.35)",
                  boxShadow: "0 2px 16px rgba(255,193,7,.15)"
                }} variant="outlined">
                  <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1.3 }}>
                    <Avatar src={getAvatarUrl(p)} sx={{ width: 56, height: 56, boxShadow: "0 2px 8px rgba(255,193,7,.25)" }} />
                    <Chip
                      label={p.status === "checkedIn" ? "เช็คอินแล้ว" : "ยังไม่เช็คอิน"}
                      sx={{
                        fontWeight: 800,
                        bgcolor: p.status === "checkedIn" ? Y.success : Y.chipBg,
                        color: p.status === "checkedIn" ? "#fff" : Y.chipText,
                        px: 2, fontSize: 16
                      }}
                    />
                  </Stack>
                  <Stack spacing={0.7} sx={{ pl: 1, fontSize: 16 }}>
                    {Object.entries(p.fields || {}).map(([key, val]) => (
                      <Typography key={key} fontSize={15}><b>{key}:</b> {val || "-"}</Typography>
                    ))}
                  </Stack>
                  {p.status === "checkedIn" ? (
                    <Stack spacing={0.5} sx={{ pl: 1, mt: 1 }}>
                      <Typography fontSize={14} color="success.main">
                        เวลาเช็คอิน: {p.checkedInAt ? new Date(p.checkedInAt).toLocaleString("th-TH") : "-"}
                      </Typography>
                      <Typography fontSize={14} sx={{ color: "#6B5B00" }}>
                        จุดเช็คอิน: {p.registeredPointName || "-"}
                      </Typography>
                      <Typography fontSize={14}>
                        ผู้ติดตาม: {p.followers ?? 0}
                      </Typography>
                    </Stack>
                  ) : (
                    <Button
                      variant="contained" fullWidth
                      sx={{
                        mt: 2, fontWeight: 900, borderRadius: 3, fontSize: 17,
                        bgcolor: Y.main, ":hover": { bgcolor: Y.dark },
                        boxShadow: "0 4px 18px rgba(255,193,7,.35)", color: "#3E2723"
                      }}
                      disabled={checkingIn === p._id}
                      onClick={() => {
                        setAskFollowersFor({ id: p._id, qrCode: p.qrCode });
                        setShowFollowersDialog(true);
                      }}
                    >
                      {checkingIn === p._id ? <CircularProgress size={18} sx={{ color: "#3E2723" }} /> : "เช็คอิน"}
                    </Button>
                  )}
                </Paper>
              ))}
            </Stack>
          ) : (
            <Typography color="text.secondary" align="center">ไม่พบข้อมูล</Typography>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ justifyContent: "center", pb: 2 }}>
          <Button
            variant="outlined"
            onClick={handleModalClose}
            sx={{ borderRadius: 2, fontWeight: 800, fontSize: 17, px: 4, borderColor: Y.main, color: "#6B5B00",
              ":hover": { borderColor: Y.dark, backgroundColor: "#FFF8E1" } }}
          >
            ปิด
          </Button>
        </DialogActions>
      </Dialog>

      {/* ไม่พบข้อมูล */}
      <Dialog open={openNotFound} onClose={handleNotFoundClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: "center", fontWeight: 900, color: "#B00020", pb: 1 }}>
          <SearchIcon sx={{ mb: -0.7, mr: 1, fontSize: 26, color: "#B00020" }} />
          ไม่พบข้อมูล
        </DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" align="center" fontWeight={700} fontSize={16}>
            {notFoundText}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", pb: 2 }}>
          <Button
            variant="contained"
            onClick={handleNotFoundClose}
            sx={{ borderRadius: 2, fontWeight: 800, fontSize: 16, bgcolor: Y.main, ":hover": { bgcolor: Y.dark }, color: "#3E2723" }}
          >
            ปิด
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog สำหรับกรอกจำนวนผู้ติดตาม */}
      <FollowersDialog
        open={showFollowersDialog}
        onClose={() => setShowFollowersDialog(false)}
        onConfirm={confirmWithFollowers}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={2200}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.success ? "success" : "error"}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          sx={{ fontWeight: 800, fontSize: 16 }}
        >
          {snackbar.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
