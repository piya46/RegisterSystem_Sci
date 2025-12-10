import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import {
  Box, Card, CardContent, Typography, TextField, Button,
  CircularProgress, InputAdornment, IconButton, Tooltip, 
  Dialog, DialogContent, Stack
} from "@mui/material";
import { keyframes } from "@mui/system";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PersonIcon from "@mui/icons-material/Person";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import SecurityIcon from "@mui/icons-material/Security";
import ContactSupportIcon from '@mui/icons-material/ContactSupport';

// Import Turnstile
import Turnstile from "../components/Turnstile";

// --- Animations ---
const float1 = keyframes`0% { transform: translateY(0px) } 50% { transform: translateY(-16px) } 100% { transform: translateY(0px) }`;
const float2 = keyframes`0% { transform: translateY(0px) } 50% { transform: translateY(12px) } 100% { transform: translateY(0px) }`;
const shake = keyframes`0%,100% { transform: translateX(0) } 20% { transform: translateX(-6px) } 40% { transform: translateX(6px) } 60% { transform: translateX(-4px) } 80% { transform: translateX(4px) }`;

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  // State UI
  const [showPwd, setShowPwd] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [shakeOnError, setShakeOnError] = useState(false);
  const [error, setError] = useState(null);
  
  // Dialog States
  const [securityErrorOpen, setSecurityErrorOpen] = useState(false);
  const [forgotPwdOpen, setForgotPwdOpen] = useState(false);

  // Turnstile & Login Logic
  const [cfToken, setCfToken] = useState("");
  const [pendingLogin, setPendingLogin] = useState(false);
  
  // Ref สำหรับควบคุม Turnstile
  const turnstileRef = useRef(null);

  const { login, user, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate]);

  // Trigger Login when Token is ready
  useEffect(() => {
    const doLogin = async () => {
      // เงื่อนไข: ต้องมี token และข้อมูลครบ
      if (!pendingLogin || !cfToken || !username || !password) return;
      
      setError(null);
      setShakeOnError(false);
      
      try {
        await login(username.trim(), password, cfToken);
      } catch (err) {
        const res = err?.response?.data;
        // รับข้อความจาก Server โดยตรง (ถ้ามี) หรือใช้ Default text
        const serverMsg = res?.error || res?.message || "Login Failed";
        
        // ตรวจสอบว่าเป็น Bot Error หรือไม่
        const isBotError = 
            (serverMsg && serverMsg.toLowerCase().includes("turnstile")) || 
            (serverMsg && serverMsg.toLowerCase().includes("captcha")) ||
            (serverMsg && serverMsg.toLowerCase().includes("security") && !serverMsg.includes("credential"));

        if (isBotError) {
           setSecurityErrorOpen(true);
        } else {
           // แสดงข้อความที่ Server ส่งมา (เช่น "User not found", "Password incorrect")
           setError(serverMsg === "Login Failed" ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" : serverMsg);
           setShakeOnError(true);
           setTimeout(() => setShakeOnError(false), 500);
        }

        // Reset Turnstile ผ่าน Ref เพื่อให้ลองใหม่ได้
        turnstileRef.current?.reset();
        setCfToken("");
        
      } finally {
        setPendingLogin(false);
      }
    };

    doLogin();
  }, [cfToken, pendingLogin, username, password, login]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
        setError("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
        setShakeOnError(true);
        setTimeout(() => setShakeOnError(false), 500);
        return;
    }
    setPendingLogin(true);
    
    // สั่ง Execute ผ่าน Ref
    turnstileRef.current?.execute();
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
              Sign in to manage events
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
                    <IconButton 
                        onClick={() => setShowPwd((v) => !v)} 
                        edge="end"
                        aria-label={showPwd ? "Hide password" : "Show password"}
                    >
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
                  <Tooltip title="Caps Lock is ON">
                    <Typography sx={{ display: "flex", alignItems: "center", gap: 0.7, color: "#b26a00", fontWeight: 700 }} variant="body2">
                      <WarningAmberRoundedIcon fontSize="small" /> Caps Lock is ON
                    </Typography>
                  </Tooltip>
                )}
                {error && <Typography color="error" sx={{ mt: 0.5, fontSize: "0.95em", fontWeight: 700 }}>{error}</Typography>}
              </Box>
            )}

            <Box sx={{ mt: 1, mb: 1, display: "flex", justifyContent: "flex-end" }}>
              <Button 
                type="button" 
                size="small" 
                onClick={() => setForgotPwdOpen(true)}
                sx={{ textTransform: "none", color: "#7a5b00", fontWeight: 700, "&:hover": { textDecoration: "underline", bgcolor: 'transparent' } }} 
              >
                Forgot Password?
              </Button>
            </Box>

            {/* Invisible Turnstile Widget WITH REF (Fixed Props) */}
            <Turnstile 
                ref={turnstileRef} 
                size="invisible"       // เปลี่ยนจาก invisible เป็น size="invisible"
                action="login"         // ย้าย action ออกมาเป็น prop
                onVerify={(t) => setCfToken(t)} 
                onError={() => { setPendingLogin(false); setError("Security check failed"); }} 
            />

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

      {/* Security Error Dialog */}
      <Dialog
        open={securityErrorOpen}
        onClose={() => setSecurityErrorOpen(false)}
        PaperProps={{ sx: { borderRadius: 4, p: 2, maxWidth: 360, textAlign: 'center', borderTop: '6px solid #FF3B30' } }}
      >
        <DialogContent>
          <Stack alignItems="center" spacing={2}>
            <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: '#FFEBEE', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(211, 47, 47, 0.2)' }}>
              <SecurityIcon sx={{ fontSize: 36, color: '#D32F2F' }} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={800} color="#D32F2F" gutterBottom>Verification Failed</Typography>
              <Typography variant="body2" color="text.secondary">System cannot verify your identity (Cloudflare Check Failed)</Typography>
            </Box>
            <Button variant="contained" color="error" fullWidth onClick={() => setSecurityErrorOpen(false)} sx={{ borderRadius: 2, fontWeight: 700, mt: 1 }}>OK</Button>
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Forgot Password Dialog */}
      <Dialog
        open={forgotPwdOpen}
        onClose={() => setForgotPwdOpen(false)}
        PaperProps={{ sx: { borderRadius: 4, maxWidth: 400 } }}
      >
         <DialogContent sx={{ textAlign: 'center', p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                <Box sx={{ p: 2, bgcolor: '#fff8e1', borderRadius: '50%' }}>
                    <ContactSupportIcon sx={{ fontSize: 40, color: '#fbc02d' }} />
                </Box>
            </Box>
            <Typography variant="h6" fontWeight="bold" gutterBottom color="#333">
                Forgot Password?
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
                Please contact System Admin or IT Support to reset your password.
            </Typography>
            
            <Box sx={{ bgcolor: '#f5f5f5', p: 2, borderRadius: 3, border: '1px dashed #bdbdbd' }}>
                <Typography variant="subtitle2" color="text.secondary">Support Contact</Typography>
                <Typography variant="h6" color="primary.main" fontWeight="bold">
                   Email: piyaton56@gmail.com (IT)
                </Typography>
            </Box>

            <Button 
                onClick={() => setForgotPwdOpen(false)} 
                fullWidth 
                variant="outlined" 
                sx={{ mt: 3, borderRadius: 2, fontWeight: 700, color: '#666', borderColor: '#ddd' }}
            >
                Close
            </Button>
         </DialogContent>
      </Dialog>

    </Box>
  );
}