import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import {
  Box, Card, CardContent, Typography, TextField, Button,
  CircularProgress, InputAdornment, IconButton, Checkbox,
  FormControlLabel, Tooltip, Dialog, DialogContent, Stack
} from "@mui/material";
import { keyframes } from "@mui/system";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PersonIcon from "@mui/icons-material/Person";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import SecurityIcon from "@mui/icons-material/Security";
import Turnstile, { executeTurnstile } from "../components/Turnstile";

// --- Animations ---
const float1 = keyframes`0% { transform: translateY(0px) } 50% { transform: translateY(-16px) } 100% { transform: translateY(0px) }`;
const float2 = keyframes`0% { transform: translateY(0px) } 50% { transform: translateY(12px) } 100% { transform: translateY(0px) }`;
const shake = keyframes`0%,100% { transform: translateX(0) } 20% { transform: translateX(-6px) } 40% { transform: translateX(6px) } 60% { transform: translateX(-4px) } 80% { transform: translateX(4px) }`;

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [showPwd, setShowPwd] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [remember, setRemember] = useState(true);
  const [shakeOnError, setShakeOnError] = useState(false);

  // Turnstile State
  const [cfToken, setCfToken] = useState("");
  const [pendingLogin, setPendingLogin] = useState(false);
  const [securityErrorOpen, setSecurityErrorOpen] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate]);

  // Trigger Login when Token is ready
  useEffect(() => {
    const doLogin = async () => {
      if (!pendingLogin || !cfToken) return;
      
      setError(null);
      setShakeOnError(false);
      try {
        await login(username.trim(), password, cfToken);
      } catch (err) {
        const msg = err?.response?.data?.message || err?.response?.data?.error || "เข้าสู่ระบบไม่สำเร็จ";
        
        // ตรวจสอบว่าเป็น Error จาก Security หรือไม่
        if (msg.includes("Security") || msg.includes("Turnstile")) {
           setSecurityErrorOpen(true);
        } else {
           setError(msg);
           setShakeOnError(true);
           setTimeout(() => setShakeOnError(false), 500);
        }

        // Reset Turnstile อัตโนมัติ
        if (window.turnstile) {
            try { window.turnstile.reset(); } catch {}
        }
        setCfToken("");
      } finally {
        setPendingLogin(false);
      }
    };
    doLogin();
    // eslint-disable-next-line
  }, [cfToken, pendingLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPendingLogin(true);
    executeTurnstile(); // เริ่มกระบวนการตรวจสอบ Human
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        background: "radial-gradient(1200px 600px at 0% 0%, #fff8d6 0%, #ffef9a 35%, #ffd54f 65%, #ffca28 100%)",
      }}
    >
      {/* Background Elements */}
      <Box sx={{ position: "absolute", width: 320, height: 320, borderRadius: "50%", top: -80, right: -60, background: "linear-gradient(140deg,#fff59d 0%,#ffca28 70%)", filter: "blur(20px)", opacity: 0.65, animation: `${float1} 9s ease-in-out infinite` }} />
      <Box sx={{ position: "absolute", width: 260, height: 260, borderRadius: "50%", bottom: -70, left: -40, background: "linear-gradient(140deg,#fff9c4 0%,#fbc02d 70%)", filter: "blur(18px)", opacity: 0.55, animation: `${float2} 10s ease-in-out infinite` }} />

      <Card
        sx={{
          width: "100%", maxWidth: 420, borderRadius: 5,
          backdropFilter: "blur(8px)", background: "linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0.92))",
          border: "1.5px solid rgba(251, 192, 45, 0.6)",
          boxShadow: "0 20px 60px rgba(251, 192, 45, 0.35), inset 0 0 0 1px rgba(255,255,255,0.4)",
          animation: shakeOnError ? `${shake} .45s ease` : "none",
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Box sx={{ textAlign: "center", mb: 2.5 }}>
            <Box component="img" src="/logo.svg" alt="Logo" sx={{ width: 72, height: 72, mb: 1, filter: "drop-shadow(0 4px 10px rgba(253, 216, 53, .45))" }} />
            <Typography variant="h4" fontWeight={800} letterSpacing={0.5} sx={{ color: "#6a4d00", textShadow: "0 1px 0 #fff7" }}>
              Management Login
            </Typography>
            <Typography sx={{ mt: 0.5, color: "#7a5b00", fontWeight: 600 }}>
              เข้าสู่ระบบเพื่อจัดการงานอีเวนต์
            </Typography>
          </Box>

          <form onSubmit={handleSubmit} noValidate>
            <TextField
              fullWidth margin="normal" variant="outlined" label="Username"
              value={username} onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => setCapsLock(e.getModifierState?.("CapsLock"))}
              InputProps={{ startAdornment: (<InputAdornment position="start"><PersonIcon sx={{ color: "#fbc02d" }} /></InputAdornment>) }}
              disabled={loading || pendingLogin} autoFocus required placeholder="username"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, "& fieldset": { borderColor: "#fbc02d66" }, "&:hover fieldset": { borderColor: "#f57f17" }, "&.Mui-focused fieldset": { borderColor: "#fbc02d" }, bgcolor: "#fffdf4" }, input: { fontWeight: 600 } }}
            />

            <TextField
              fullWidth margin="normal" variant="outlined" label="Password"
              value={password} type={showPwd ? "text" : "password"}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => setCapsLock(e.getModifierState?.("CapsLock"))}
              InputProps={{
                startAdornment: (<InputAdornment position="start"><LockOutlinedIcon sx={{ color: "#fbc02d" }} /></InputAdornment>),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPwd((v) => !v)} edge="end">
                      {showPwd ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              disabled={loading || pendingLogin} required placeholder="••••••••"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, "& fieldset": { borderColor: "#fbc02d66" }, "&:hover fieldset": { borderColor: "#f57f17" }, "&.Mui-focused fieldset": { borderColor: "#fbc02d" }, bgcolor: "#fffdf4" }, input: { fontWeight: 600, letterSpacing: 1 } }}
            />

            {(capsLock || error) && (
              <Box sx={{ mt: 1, mb: 1 }}>
                {capsLock && (
                  <Tooltip title="ปิด Caps Lock เพื่อหลีกเลี่ยงการพิมพ์ผิด">
                    <Typography sx={{ display: "flex", alignItems: "center", gap: 0.7, color: "#b26a00", fontWeight: 700 }} variant="body2">
                      <WarningAmberRoundedIcon fontSize="small" /> Caps Lock เปิดอยู่
                    </Typography>
                  </Tooltip>
                )}
                {error && <Typography color="error" sx={{ mt: 0.5, fontSize: "0.95em", fontWeight: 700 }}>{error}</Typography>}
              </Box>
            )}

            <Box sx={{ mt: 1, mb: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <FormControlLabel control={<Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} sx={{ color: "#fbc02d", "&.Mui-checked": { color: "#f57f17" } }} />} label="จดจำการเข้าสู่ระบบ" sx={{ userSelect: "none" }} />
              <Button type="button" size="small" sx={{ textTransform: "none", color: "#7a5b00", fontWeight: 700, "&:hover": { textDecoration: "underline" } }} onClick={() => alert("โปรดติดต่อผู้ดูแลระบบ")}>ลืมรหัสผ่าน?</Button>
            </Box>

            {/* Invisible Turnstile Widget */}
            <Turnstile invisible onVerify={(t) => setCfToken(t)} onError={() => { setPendingLogin(false); setError("Security check failed"); }} options={{ action: "login" }} />

            <Button
              type="submit" fullWidth size="large" variant="contained"
              sx={{
                mt: 1.5, mb: 0.5, borderRadius: 3, fontWeight: 900, letterSpacing: 1,
                bgcolor: "#fbc02d", color: "#4a3400", boxShadow: "0 8px 24px rgba(251, 192, 45, 0.55)",
                transition: "transform .1s ease, box-shadow .2s ease",
                "&:hover": { bgcolor: "#f57f17", boxShadow: "0 12px 30px rgba(245, 127, 23, 0.7)", transform: "translateY(-1px)" },
                "&:active": { transform: "translateY(1px)" },
              }}
              disabled={loading || pendingLogin}
            >
              {loading || pendingLogin ? <CircularProgress size={24} sx={{ color: "#4a3400" }} /> : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Security Error Dialog (Modern Cloudflare Style) */}
      <Dialog
        open={securityErrorOpen}
        onClose={() => setSecurityErrorOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: 4, p: 2, maxWidth: 360, textAlign: 'center',
            borderTop: '6px solid #FF3B30' // Red top accent
          }
        }}
      >
        <DialogContent>
          <Stack alignItems="center" spacing={2}>
            <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: '#FFEBEE', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(211, 47, 47, 0.2)' }}>
              <SecurityIcon sx={{ fontSize: 36, color: '#D32F2F' }} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={800} color="#D32F2F" gutterBottom>
                Verification Failed
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                ระบบไม่สามารถยืนยันตัวตนของคุณได้ในขณะนี้ (Security Check)
              </Typography>
              <Typography variant="caption" display="block" sx={{ mt: 1.5, color: '#757575', bgcolor: '#f5f5f5', py: 0.5, px: 1, borderRadius: 1 }}>
                Please verify you are a human.
              </Typography>
            </Box>
            <Button 
              variant="contained" color="error" fullWidth 
              onClick={() => setSecurityErrorOpen(false)}
              sx={{ borderRadius: 2, fontWeight: 700, mt: 1, boxShadow: 'none' }}
            >
              ตกลง
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}