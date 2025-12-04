// src/pages/KioskPage.jsx
import React, { useEffect, useState } from "react";
import {
  Box, Container, Paper, Stack, Typography, Avatar, Chip, Divider,
  TextField, MenuItem, Button, Fab, Tooltip, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress
} from "@mui/material";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import LockIcon from "@mui/icons-material/Lock";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import LoginIcon from "@mui/icons-material/Login";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import {
  getMe,
  createParticipantByStaff as registerOnsiteByKiosk,
  listParticipantFields,
} from "../utils/api";
import { useSearchParams, useNavigate } from "react-router-dom";
import FollowersDialog from "../components/FollowersDialog";

function KioskPage() {
  const [me, setMe] = useState(null);
  const [fields, setFields] = useState([]);
  const [form, setForm] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Followers popup
  const [followersDialogOpen, setFollowersDialogOpen] = useState(false);
  const [pendingSubmitForm, setPendingSubmitForm] = useState(null);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [kioskMode, setKioskMode] = useState(false);

  // Exit kiosk dialog
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState("");
  const [exitError, setExitError] = useState("");

  const selectedPoint = searchParams.get("point");

  useEffect(() => {
    if (!selectedPoint) {
      navigate("/select-point");
      return;
    }
    getMe(token)
      .then((res) => setMe(res.data || res))
      .catch(() => {});
    listParticipantFields(token)
      .then((res) => setFields(res.data || res))
      .catch(() => {});
  }, [token, selectedPoint, navigate]);

  /* ===== Kiosk mode (full screen + block menu/keys) ===== */
  function openFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen();
    else if (elem.mozRequestFullScreen) elem.mozRequestFullScreen();
    else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
  }
  function closeFullscreen() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  }
  function preventContextMenu(e) { e.preventDefault(); }
  function preventKeys(e) {
    if (
      e.key === "F11" ||
      e.key === "Escape" ||
      (e.ctrlKey && ["w", "r"].includes(e.key.toLowerCase())) ||
      (e.altKey && e.key === "F4")
    ) {
      e.preventDefault();
    }
  }
  useEffect(() => {
    if (kioskMode) {
      openFullscreen();
      window.addEventListener("contextmenu", preventContextMenu);
      window.addEventListener("keydown", preventKeys);
    } else {
      closeFullscreen();
      window.removeEventListener("contextmenu", preventContextMenu);
      window.removeEventListener("keydown", preventKeys);
    }
  }, [kioskMode]);

  /* ===== Form handlers ===== */
  const handleInput = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleOnsiteSubmit = (e) => {
    e.preventDefault();
    setResult(null);
    setPendingSubmitForm({ ...form });
    setFollowersDialogOpen(true); // เปิดถามจำนวนผู้ติดตามก่อน
  };

  const handleConfirmFollowers = async (followers) => {
    setFollowersDialogOpen(false);
    setLoading(true);
    try {
      const res = await registerOnsiteByKiosk(
        { ...pendingSubmitForm, registrationPoint: selectedPoint, followers },
        token
      );
      setResult({
        success: true,
        message: `ลงทะเบียนสำเร็จ: ${res.data?.fields?.name || res.fields?.name || ""}`,
      });
      setForm({});
    } catch (err) {
      setResult({
        success: false,
        message: err.response?.data?.error || "เกิดข้อผิดพลาด",
      });
    }
    setLoading(false);
    setPendingSubmitForm(null);
  };

  /* ===== Kiosk controls ===== */
  const handleEnterKiosk = () => {
    setKioskMode(true);
    setResult(null);
  };
  const openExitDialog = () => {
    setExitPassword("");
    setExitError("");
    setExitOpen(true);
  };
  const closeExitDialog = () => {
    setExitOpen(false);
    setExitPassword("");
    setExitError("");
  };
  const confirmExitKiosk = () => {
    setExitError("");
    if (!exitPassword) {
      setExitError("กรุณากรอกรหัสผ่าน");
      return;
    }
    // เดโม: ใช้ username เป็นรหัสผ่านออก (สามารถเปลี่ยนเป็น API verify จริง)
    if (exitPassword === me?.username) {
      setKioskMode(false);
      closeExitDialog();
      setResult(null);
    } else {
      setExitError("รหัสผ่านไม่ถูกต้อง");
    }
  };

  /* ===== Numeric/text helpers ===== */
  const blockWheel = (e) => (e.target instanceof HTMLElement) && e.target.blur();
  const blockInvalidNumberKeys = (e) => {
    if (["e", "E", "+", "-", ".", " "].includes(e.key)) e.preventDefault();
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 600px at 20% -10%, #fff7db 0%, transparent 60%), radial-gradient(1200px 600px at 120% 110%, #e3f2fd 0%, transparent 60%), linear-gradient(135deg,#fff8e1 0%,#fffde7 100%)",
        py: { xs: 3, md: 6 },
      }}
    >
      <Container maxWidth="sm">
        {/* Header */}
        <Paper
          elevation={4}
          sx={{
            p: { xs: 2.5, md: 3 },
            borderRadius: 4,
            background:
              "linear-gradient(135deg, rgba(255,243,224,.95) 0%, rgba(227,242,253,.95) 100%)",
            boxShadow: "0 14px 36px rgba(255,193,7,0.25)",
            border: "1px solid rgba(255,193,7,.35)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
            <Avatar
              src="/logo.svg"
              alt="Logo"
              sx={{
                width: 56,
                height: 56,
                bgcolor: "#fff",
                border: "2px solid rgba(255,193,7,.7)",
                boxShadow: "0 6px 18px rgba(255,193,7,.35)",
              }}
            />
            <Box textAlign="center">
              <Typography variant="h5" fontWeight={900} color="primary" sx={{ letterSpacing: 0.6 }}>
                ลงทะเบียนหน้างาน
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 0.5 }}>
                <Chip
                  label={`Point: ${selectedPoint ? selectedPoint : "-"}`}
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              </Stack>
            </Box>
          </Stack>

          {/* Staff card */}
          <Paper
            variant="outlined"
            sx={{
              mt: 2.5,
              p: 2,
              borderRadius: 3,
              bgcolor: "#fff",
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: "primary.main", width: 40, height: 40 }}>
                <PersonOutlineIcon />
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                  เจ้าหน้าที่ผู้ปฏิบัติงาน
                </Typography>
                <Typography sx={{ fontWeight: 700 }}>
                  {me?.fullName || me?.username || "ไม่พบข้อมูล"}
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }} />
              <Chip
                label={kioskMode ? "Kiosk Mode" : "Normal"}
                size="small"
                color={kioskMode ? "success" : "default"}
              />
            </Stack>
          </Paper>

          <Divider sx={{ my: 3 }} />

          {/* Form */}
          <Box component="form" onSubmit={handleOnsiteSubmit}>
            <Stack spacing={2}>
              {fields.map((f) => {
                if (f.type === "select") {
                  const options = Array.isArray(f.options)
                    ? f.options.map((o) =>
                        typeof o === "string"
                          ? { label: o, value: o }
                          : { label: o.label ?? String(o.value ?? ""), value: o.value ?? o.label ?? "" }
                      )
                    : [];
                  return (
                    <TextField
                      key={f.name}
                      select
                      name={f.name}
                      label={f.label}
                      value={form[f.name] || ""}
                      onChange={handleInput}
                      required={!!f.required}
                      fullWidth
                      SelectProps={{ displayEmpty: true }}
                      helperText={f.required ? "จำเป็นต้องกรอก" : "ไม่บังคับ"}
                      sx={tfStyle}
                    >
                      <MenuItem value="">
                        <em>— เลือก {f.label} —</em>
                      </MenuItem>
                      {options.map((opt) => (
                        <MenuItem key={`${f.name}-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  );
                }

                const inputType =
                  f.type === "email" ? "email" : f.type === "number" ? "number" : "text";

                return (
                  <TextField
                    key={f.name}
                    name={f.name}
                    type={inputType}
                    label={f.label}
                    value={form[f.name] || ""}
                    onChange={handleInput}
                    required={!!f.required}
                    fullWidth
                    helperText={f.required ? "จำเป็นต้องกรอก" : "ไม่บังคับ"}
                    sx={tfStyle}
                    InputLabelProps={inputType === "date" ? { shrink: true } : undefined}
                    autoComplete="off"
                    onWheel={inputType === "number" ? blockWheel : undefined}
                    onKeyDown={inputType === "number" ? blockInvalidNumberKeys : undefined}
                    inputProps={
                      inputType === "number"
                        ? { inputMode: "numeric", pattern: "[0-9]*" }
                        : undefined
                    }
                  />
                );
              })}

              {result && (
                <Alert
                  severity={result.success ? "success" : "error"}
                  icon={<CheckCircleIcon />}
                  sx={{ fontWeight: 600 }}
                >
                  {result.message}
                </Alert>
              )}

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={18} /> : <LoginIcon />}
                  fullWidth
                  sx={{
                    borderRadius: 3,
                    fontWeight: 800,
                    boxShadow: loading ? "none" : "0 8px 20px rgba(33,150,243,.35)",
                  }}
                >
                  {loading ? "กำลังบันทึก..." : "ลงทะเบียนหน้างาน"}
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  color="inherit"
                  startIcon={<GroupAddIcon />}
                  onClick={() => {
                    setPendingSubmitForm({ ...form });
                    setFollowersDialogOpen(true);
                  }}
                  fullWidth
                  sx={{ borderRadius: 3 }}
                >
                  ระบุผู้ติดตามก่อนส่ง
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Paper>
      </Container>

      {/* Floating FAB: Enter/Exit Kiosk */}
      {!kioskMode ? (
        <Tooltip title="เปิดโหมด Kiosk">
          <Fab
            color="primary"
            onClick={handleEnterKiosk}
            sx={{
              position: "fixed",
              right: 24,
              bottom: 24,
              boxShadow: "0 12px 28px rgba(33,150,243,.35)",
            }}
          >
            <LockOpenIcon />
          </Fab>
        </Tooltip>
      ) : (
        <Tooltip title="ออกจากโหมด Kiosk">
          <Fab
            color="secondary"
            onClick={openExitDialog}
            sx={{
              position: "fixed",
              right: 24,
              bottom: 24,
              boxShadow: "0 12px 28px rgba(255,87,34,.35)",
            }}
          >
            <LockIcon />
          </Fab>
        </Tooltip>
      )}

      {/* FollowersDialog */}
      <FollowersDialog
        open={followersDialogOpen}
        onClose={() => {
          setFollowersDialogOpen(false);
          setPendingSubmitForm(null);
        }}
        onConfirm={handleConfirmFollowers}
      />

      {/* Exit Kiosk Dialog */}
      <Dialog open={exitOpen} onClose={closeExitDialog}>
        <DialogTitle>ยืนยันออกจากโหมด Kiosk</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            กรุณากรอกรหัสผ่านเพื่อยืนยันการออกจากโหมด Kiosk
          </Typography>
          <TextField
            type="password"
            label="รหัสผ่าน"
            value={exitPassword}
            onChange={(e) => setExitPassword(e.target.value)}
            fullWidth
            autoFocus
            error={!!exitError}
            helperText={exitError || " "}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeExitDialog}>ยกเลิก</Button>
          <Button onClick={confirmExitKiosk} variant="contained" color="warning">
            ออกจากโหมด
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ===== Shared styles ===== */
const tfStyle = {
  "& .MuiOutlinedInput-root": {
    bgcolor: "#fff",
    borderRadius: 2,
    "& fieldset": { borderColor: "rgba(25,118,210,.35)" },
    "&:hover fieldset": { borderColor: "rgba(25,118,210,.7)" },
    "&.Mui-focused fieldset": { borderColor: "#1976d2" },
  },
};

export default KioskPage;
