import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import {
  Box, Card, CardContent, Typography, TextField, Button,
  CircularProgress, InputAdornment, IconButton, Tooltip, 
  Dialog, DialogContent, Stack,
  Stepper, Step, StepLabel, Alert
} from "@mui/material";
import { keyframes } from "@mui/system";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PersonIcon from "@mui/icons-material/Person";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import SecurityIcon from "@mui/icons-material/Security";
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

// ✅ Import API
import { requestPasswordReset, resetPasswordWithOtp } from "../utils/api";
import Turnstile from "../components/Turnstile";

// --- Animations ---
const float1 = keyframes`0% { transform: translateY(0px) } 50% { transform: translateY(-16px) } 100% { transform: translateY(0px) }`;
const float2 = keyframes`0% { transform: translateY(0px) } 50% { transform: translateY(12px) } 100% { transform: translateY(0px) }`;
const shake = keyframes`0%,100% { transform: translateX(0) } 20% { transform: translateX(-6px) } 40% { transform: translateX(6px) } 60% { transform: translateX(-4px) } 80% { transform: translateX(4px) }`;
const fadeIn = keyframes`from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); }`;

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  // UI States
  const [showPwd, setShowPwd] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [shakeOnError, setShakeOnError] = useState(false);
  const [error, setError] = useState(null);
  
  const [securityErrorOpen, setSecurityErrorOpen] = useState(false);
  const [forgotPwdOpen, setForgotPwdOpen] = useState(false);

  // Login Logic States
  const [pendingLogin, setPendingLogin] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false); 
  
  // ✅ Forgot Password Wizard State
  const [resetStep, setResetStep] = useState(0); 
  const [resetUsername, setResetUsername] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetRef, setResetRef] = useState(""); 
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  const turnstileRef = useRef(null);
  const formDataRef = useRef({ username: "", password: "" });
  const isSubmittingRef = useRef(false);

  // ✅ Refs สำหรับช่อง OTP 8 ช่อง
  const otpInputs = useRef([]);

  const { login, user, loading } = useAuth();
  const navigate = useNavigate();

  // Sync state to ref
  useEffect(() => {
    formDataRef.current = { username, password };
  }, [username, password]);

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate]);

  // --- Login Logic ---
  const processLogin = async (token) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    
    const { username: currentUser, password: currentPass } = formDataRef.current;

    if (!currentUser || !currentPass || !token) {
        isSubmittingRef.current = false;
        return;
    }
    
    setError(null);
    setShakeOnError(false);
    setPendingLogin(true);
    
    try {
        await login(currentUser.trim(), currentPass, token);
        setLoginSuccess(true);
    } catch (err) {
        setPendingLogin(false);
        isSubmittingRef.current = false;

        const status = err?.response?.status;
        const rawMsg = err?.response?.data?.message || err?.response?.data?.error || "Login Failed";
        const msg = rawMsg.toLowerCase();

        const isBotMessage = msg.includes("turnstile") || 
                             msg.includes("cloudflare") || 
                             msg.includes("captcha");

        if ((status === 401 || status === 400) && !isBotMessage) {
           setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
           setShakeOnError(true);
           setTimeout(() => setShakeOnError(false), 500);
        } else if (isBotMessage) {
           setSecurityErrorOpen(true);
        } else {
           setError(rawMsg); 
           setShakeOnError(true);
           setTimeout(() => setShakeOnError(false), 500);
        }
        turnstileRef.current?.reset();
    }
  };

  const handleVerify = useCallback((token) => {
    processLogin(token);
  }, []); 

  const handleError = useCallback(() => {
    setPendingLogin(false);
    isSubmittingRef.current = false;
    setError("Security check failed");
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
        setError("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
        setShakeOnError(true);
        setTimeout(() => setShakeOnError(false), 500);
        return;
    }
    setPendingLogin(true);
    turnstileRef.current?.execute();
  };

  const handleCloseForgot = () => {
    setForgotPwdOpen(false);
    setTimeout(() => {
        setResetStep(0);
        setResetUsername("");
        setResetOtp("");
        setNewPassword("");
        setResetMsg("");
        setResetRef("");
    }, 300);
  };

  // ✅ OTP Handler Logic: จัดการการพิมพ์ การลบ และการวาง (Paste)
  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return; // รับเฉพาะตัวเลข
    const newOtp = resetOtp.split('');
    while (newOtp.length < 8) newOtp.push(''); 
    
    newOtp[index] = value;
    const finalStr = newOtp.join('').substring(0, 8);
    setResetOtp(finalStr);

    // Auto Focus Next
    if (value !== "" && index < 7) {
        otpInputs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    // Backspace: ถ้าย้อนกลับแล้วช่องปัจจุบันว่าง ให้ไปลบช่องก่อนหน้า
    if (e.key === "Backspace") {
        if (!resetOtp[index] && index > 0) {
            otpInputs.current[index - 1]?.focus();
        }
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const data = e.clipboardData.getData("text").replace(/[^0-9]/g, "").substring(0, 8);
    setResetOtp(data);
    // Focus ช่องสุดท้ายที่กรอก
    const focusIndex = Math.min(data.length, 7);
    otpInputs.current[focusIndex]?.focus();
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
          transition: "height 0.3s ease"
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          {loginSuccess ? (
            <Stack alignItems="center" justifyContent="center" spacing={3} sx={{ py: 6, animation: `${fadeIn} 0.5s ease-out` }}>
              <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress size={80} thickness={2} sx={{ color: "#fbc02d" }} />
                <CheckCircleOutlineIcon sx={{ position: 'absolute', fontSize: 40, color: "#fbc02d", opacity: 0.8 }} />
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" fontWeight={800} color="#6a4d00" sx={{ mb: 1 }}>กำลังพาท่านเข้าสู่ระบบ...</Typography>
                <Typography variant="body2" color="#7a5b00" fontWeight={500}>ตรวจสอบข้อมูลถูกต้อง กรุณารอสักครู่</Typography>
              </Box>
            </Stack>
          ) : (
            <>
              {/* Logo & Header */}
              <Box sx={{ textAlign: "center", mb: 2.5 }}>
                <Box component="img" src="/logo.svg" alt="Logo" sx={{ width: 72, height: 72, mb: 1, filter: "drop-shadow(0 4px 10px rgba(253, 216, 53, .45))" }} />
                <Typography variant="h4" fontWeight={800} letterSpacing={0.5} sx={{ color: "#6a4d00", textShadow: "0 1px 0 #fff7" }}>Management Login</Typography>
                <Typography sx={{ mt: 0.5, color: "#7a5b00", fontWeight: 600 }}>Sign in to manage events</Typography>
              </Box>

              <form onSubmit={handleSubmit} noValidate>
                {/* Username Input */}
                <TextField
                  fullWidth margin="normal" variant="outlined" label="Username"
                  value={username} onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => setCapsLock(e.getModifierState?.("CapsLock"))}
                  InputProps={{ startAdornment: (<InputAdornment position="start"><PersonIcon sx={{ color: "#fbc02d" }} /></InputAdornment>) }}
                  disabled={loading || pendingLogin} autoFocus required placeholder="username"
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, "& fieldset": { borderColor: "#fbc02d66" }, "&:hover fieldset": { borderColor: "#f57f17" }, "&.Mui-focused fieldset": { borderColor: "#fbc02d" }, bgcolor: "#fffdf4" }, input: { fontWeight: 600 } }}
                />

                {/* Password Input */}
                <TextField
                  fullWidth margin="normal" variant="outlined" label="Password"
                  value={password} type={showPwd ? "text" : "password"}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => setCapsLock(e.getModifierState?.("CapsLock"))}
                  InputProps={{
                    startAdornment: (<InputAdornment position="start"><LockOutlinedIcon sx={{ color: "#fbc02d" }} /></InputAdornment>),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPwd((v) => !v)} edge="end" aria-label={showPwd ? "Hide password" : "Show password"}>
                          {showPwd ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  disabled={loading || pendingLogin} required placeholder="••••••••"
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, "& fieldset": { borderColor: "#fbc02d66" }, "&:hover fieldset": { borderColor: "#f57f17" }, "&.Mui-focused fieldset": { borderColor: "#fbc02d" }, bgcolor: "#fffdf4" }, input: { fontWeight: 600, letterSpacing: 1 } }}
                />

                {/* Error & CapsLock Alert */}
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

                {/* Forgot Password Link */}
                <Box sx={{ mt: 1, mb: 1, display: "flex", justifyContent: "flex-end" }}>
                  <Button type="button" size="small" onClick={() => setForgotPwdOpen(true)} sx={{ textTransform: "none", color: "#7a5b00", fontWeight: 700, "&:hover": { textDecoration: "underline", bgcolor: 'transparent' } }}>Forgot Password?</Button>
                </Box>

                {/* Turnstile & Submit */}
                <Turnstile ref={turnstileRef} size="invisible" execution="execute" action="login" onVerify={handleVerify} onError={handleError} />

                <Button type="submit" fullWidth size="large" variant="contained"
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Security Dialog */}
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

      {/* ✅ Forgot Password Dialog (Wizard) */}
      <Dialog
        open={forgotPwdOpen}
        onClose={handleCloseForgot}
        PaperProps={{ sx: { borderRadius: 4, maxWidth: 500, width: '100%' } }}
      >
         <DialogContent sx={{ p: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
                <Typography variant="h6" fontWeight="bold" color="#6a4d00">ลืมรหัสผ่าน / Reset Password</Typography>
            </Box>

            <Stepper activeStep={resetStep} alternativeLabel sx={{ mb: 4, '& .MuiStepIcon-root.Mui-active': { color: '#fbc02d' }, '& .MuiStepIcon-root.Mui-completed': { color: '#fbc02d' } }}>
                <Step><StepLabel>ระบุบัญชี</StepLabel></Step>
                <Step><StepLabel>ยืนยัน OTP</StepLabel></Step>
                <Step><StepLabel>ตั้งรหัสใหม่</StepLabel></Step>
            </Stepper>

            {/* Step 0: Request OTP */}
            {resetStep === 0 && (
                <Box component="form" onSubmit={async (e) => {
                    e.preventDefault();
                    setResetLoading(true);
                    setResetMsg("");
                    try {
                        const res = await requestPasswordReset(resetUsername);
                        setResetRef(res.data.ref);
                        setResetStep(1);
                    } catch (err) {
                        setResetMsg(err.response?.data?.error || "ไม่สามารถส่ง OTP ได้");
                    } finally {
                        setResetLoading(false);
                    }
                }}>
                    <Typography variant="body2" sx={{ mb: 2, textAlign: 'center' }}>กรุณากรอก Username หรือ Email ที่ลงทะเบียนไว้ <br/>ระบบจะส่ง OTP ไปยังอีเมลของท่าน</Typography>
                    <TextField 
                        fullWidth label="Username / Email" variant="outlined"
                        value={resetUsername} onChange={e => setResetUsername(e.target.value)} 
                        required autoFocus
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                    {resetMsg && <Alert severity="error" sx={{ mt: 2 }}>{resetMsg}</Alert>}
                    <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, bgcolor: "#fbc02d", color: "#4a3400", fontWeight: 'bold', "&:hover":{ bgcolor: "#f57f17" } }} disabled={!resetUsername || resetLoading}>
                        {resetLoading ? <CircularProgress size={24} /> : "ขอรหัส OTP"}
                    </Button>
                </Box>
            )}

            {/* ✅ Step 1: Verify OTP (แบบช่องแยกสวยๆ) */}
            {resetStep === 1 && (
                <Box component="form" onSubmit={(e) => { e.preventDefault(); setResetStep(2); }}>
                    <Box sx={{ bgcolor: '#FFFDE7', p: 2, borderRadius: 2, mb: 3, border: '1px dashed #fbc02d', textAlign: 'center' }}>
                         <Typography variant="subtitle2" color="#6a4d00">Ref Code</Typography>
                         <Typography variant="h5" fontWeight="bold" color="#4a3400" letterSpacing={1}>{resetRef}</Typography>
                         <Typography variant="caption" display="block" color="text.secondary" mt={0.5}>กรุณากรอกรหัส 8 หลักจากอีเมล</Typography>
                    </Box>

                    {/* 8-Digit OTP Inputs */}
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: { xs: 0.5, sm: 1 }, mb: 1 }} onPaste={handleOtpPaste}>
                        {[...Array(8)].map((_, index) => (
                             <React.Fragment key={index}>
                                <input
                                    ref={el => otpInputs.current[index] = el}
                                    type="tel"
                                    maxLength={1}
                                    value={resetOtp[index] || ""}
                                    onChange={(e) => handleOtpChange(index, e.target.value)}
                                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                                    style={{
                                        width: '40px', height: '48px',
                                        fontSize: '20px', fontWeight: 'bold', textAlign: 'center',
                                        borderRadius: '8px',
                                        border: '1.5px solid #e0e0e0',
                                        backgroundColor: '#fafafa',
                                        outline: 'none',
                                        color: '#333',
                                        transition: 'all 0.2s'
                                    }}
                                    onFocus={(e) => {
                                        e.target.style.borderColor = '#fbc02d';
                                        e.target.style.transform = 'translateY(-2px)';
                                        e.target.style.boxShadow = '0 4px 8px rgba(251, 192, 45, 0.2)';
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.borderColor = '#e0e0e0';
                                        e.target.style.transform = 'none';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                />
                                {/* ขีดคั่นกลางระหว่างเลข 4 กับ 5 */}
                                {index === 3 && (
                                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', color: '#bdbdbd', fontWeight: 'bold' }}>-</Box>
                                )}
                            </React.Fragment>
                        ))}
                    </Box>

                    <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, bgcolor: "#fbc02d", color: "#4a3400", fontWeight: 'bold', "&:hover":{ bgcolor: "#f57f17" } }} disabled={resetOtp.length < 8}>
                        ตรวจสอบ OTP
                    </Button>
                    <Button fullWidth onClick={() => setResetStep(0)} sx={{ mt: 1, color: '#757575' }}>กลับไปแก้ไขข้อมูล</Button>
                </Box>
            )}

            {/* Step 2: New Password */}
            {resetStep === 2 && (
                <Box component="form" onSubmit={async (e) => {
                    e.preventDefault();
                    setResetLoading(true);
                    try {
                        await resetPasswordWithOtp(resetUsername, resetOtp, newPassword);
                        setResetStep(3); // Success
                    } catch (err) {
                        setResetMsg(err.response?.data?.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ");
                    } finally {
                        setResetLoading(false);
                    }
                }}>
                    <Typography variant="body2" sx={{ mb: 2, textAlign: 'center' }}>กรุณาตั้งรหัสผ่านใหม่เพื่อเข้าใช้งาน</Typography>
                    <TextField 
                        fullWidth type="password" label="รหัสผ่านใหม่" variant="outlined"
                        value={newPassword} onChange={e => setNewPassword(e.target.value)} 
                        required autoFocus
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                    {resetMsg && <Alert severity="error" sx={{ mt: 2 }}>{resetMsg}</Alert>}
                    <Button type="submit" fullWidth variant="contained" color="success" sx={{ mt: 3, fontWeight: 'bold', bgcolor: "#2e7d32" }} disabled={!newPassword || resetLoading}>
                        {resetLoading ? <CircularProgress size={24} /> : "ยืนยันการเปลี่ยนรหัสผ่าน"}
                    </Button>
                </Box>
            )}

            {/* Step 3: Success */}
            {resetStep === 3 && (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 60, color: '#2e7d32', mb: 2 }} />
                    <Typography variant="h6" color="#2e7d32" gutterBottom fontWeight="bold">เปลี่ยนรหัสผ่านสำเร็จ!</Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                        ท่านสามารถใช้รหัสผ่านใหม่เพื่อเข้าสู่ระบบได้ทันที
                    </Typography>
                    <Button variant="outlined" fullWidth onClick={handleCloseForgot} sx={{ borderRadius: 2, borderColor: '#2e7d32', color: '#2e7d32' }}>ปิดหน้าต่าง</Button>
                </Box>
            )}
         </DialogContent>
      </Dialog>

    </Box>
  );
}