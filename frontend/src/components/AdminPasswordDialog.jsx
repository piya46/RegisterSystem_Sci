import React, { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Alert, InputAdornment, IconButton,
  Box, Typography, Stack, CircularProgress
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import LockResetIcon from '@mui/icons-material/LockReset';
import SaveIcon from '@mui/icons-material/Save';
import SecurityIcon from '@mui/icons-material/Security';

// ✅ Import API
import { resetUserPassword, requestActionOtp } from "../utils/api";

export default function AdminPasswordDialog({
  open, onClose, isSelf, user, onSuccess
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  // States UI
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ✅ States สำหรับ OTP Flow
  const [requireOtpMode, setRequireOtpMode] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpRef, setOtpRef] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  // ✅ Refs สำหรับช่อง OTP 8 ช่อง
  const otpInputs = useRef([]);

  // รีเซ็ตค่าทุกครั้งที่เปิด Dialog
  useEffect(() => {
    if (open) {
      setPassword("");
      setConfirm("");
      setError("");
      setShowPassword(false);
      setShowConfirm(false);
      setRequireOtpMode(false);
      setOtpCode("");
      setOtpRef("");
      setLoading(false);
    }
  }, [open]);

  // ฟังก์ชันขอ OTP (สำหรับ Admin Action)
  const handleRequestOtp = async () => {
    setOtpLoading(true);
    setOtpCode(""); // Clear OTP เก่า
    try {
      const res = await requestActionOtp();
      setOtpRef(res.data.ref);
    } catch (err) {
      setError("ส่ง OTP ไม่สำเร็จ: " + (err.response?.data?.error || err.message));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!password || !confirm) {
      setError("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    if (password.length < 6) {
      setError("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
      return;
    }
    if (password !== confirm) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. ลองยิง API แบบปกติ (ยังไม่มี OTP)
      await resetUserPassword(user._id, password);
      
      // ถ้าผ่าน (Staff/Kiosk)
      if (onSuccess) onSuccess(); 
      onClose();

    } catch (err) {
      const errMsg = err.response?.data?.error;
      const errDetail = err.response?.data?.message;

      // 2. ถ้า Backend บอกว่าต้องใช้ OTP
      if (errMsg === 'REQUIRE_OTP') {
        setRequireOtpMode(true); // เปลี่ยนหน้า UI เป็น OTP
        setError(""); // เคลียร์ Error เดิม
        await handleRequestOtp(); // ยิงขอ OTP ทันที
      } else {
        setError(errDetail || errMsg || "เกิดข้อผิดพลาดในการบันทึก");
      }
    } finally {
      setLoading(false);
    }
  };

  // ฟังก์ชันยืนยัน OTP พร้อมรหัสผ่านใหม่
  const handleConfirmWithOtp = async () => {
    if (!otpCode || otpCode.length < 8) {
      setError("กรุณากรอกรหัส OTP 8 หลัก");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // ยิง API ซ้ำ พร้อมแนบ OTP
      await resetUserPassword(user._id, password, otpCode);
      
      if (onSuccess) onSuccess();
      onClose();

    } catch (err) {
      setError(err.response?.data?.error || "รหัส OTP ไม่ถูกต้อง หรือหมดอายุ");
    } finally {
      setLoading(false);
    }
  };

  // --- OTP Handlers ---
  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return; // รับเฉพาะตัวเลข
    const newOtp = otpCode.split('');
    // เติมให้เต็ม 8 ช่องถ้ายังไม่ถึง
    while (newOtp.length < 8) newOtp.push(''); 
    
    newOtp[index] = value;
    const finalStr = newOtp.join('').substring(0, 8);
    setOtpCode(finalStr);

    // Auto Focus Next
    if (value !== "" && index < 7) {
        otpInputs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    // Backspace: ถ้าย้อนกลับแล้วช่องปัจจุบันว่าง ให้ไปลบช่องก่อนหน้า
    if (e.key === "Backspace") {
        if (!otpCode[index] && index > 0) {
            otpInputs.current[index - 1]?.focus();
        }
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const data = e.clipboardData.getData("text").replace(/[^0-9]/g, "").substring(0, 8);
    setOtpCode(data);
    // Focus ช่องสุดท้ายที่กรอก
    const focusIndex = Math.min(data.length, 7);
    otpInputs.current[focusIndex]?.focus();
  };

  const renderPasswordInput = (label, value, setValue, show, setShow, autoFocus = false) => (
    <TextField
      label={label}
      type={show ? "text" : "password"}
      value={value}
      onChange={e => setValue(e.target.value)}
      fullWidth
      margin="normal"
      autoFocus={autoFocus}
      disabled={loading}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton onClick={() => setShow(!show)} edge="end">
              {show ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </InputAdornment>
        ),
      }}
      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
    />
  );

  return (
    <Dialog 
      open={open} 
      onClose={loading ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: 4, p: 1 } }}
    >
      <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <Box sx={{ bgcolor: requireOtpMode ? '#fff3e0' : '#e3f2fd', p: 1.5, borderRadius: '50%' }}>
            {requireOtpMode ? (
                <SecurityIcon color="warning" sx={{ fontSize: 32 }} />
            ) : (
                <LockResetIcon color="primary" sx={{ fontSize: 32 }} />
            )}
          </Box>
          <Typography variant="h6" fontWeight="bold">
            {requireOtpMode ? "ยืนยันตัวตน (Admin)" : (isSelf ? "เปลี่ยนรหัสผ่านของคุณ" : "รีเซ็ตรหัสผ่านผู้ใช้")}
          </Typography>
          
          {!isSelf && user && !requireOtpMode && (
            <Typography variant="body2" color="text.secondary">
              สำหรับบัญชี: <b>{user.username}</b>
            </Typography>
          )}
        </Box>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={1} mt={1}>
          {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
          
          {/* --- Mode ปกติ: กรอก Password --- */}
          {!requireOtpMode ? (
            <>
                {renderPasswordInput("รหัสผ่านใหม่", password, setPassword, showPassword, setShowPassword, true)}
                {renderPasswordInput("ยืนยันรหัสผ่านใหม่", confirm, setConfirm, showConfirm, setShowConfirm)}
            </>
          ) : (
            /* --- Mode OTP: กรอก OTP แบบสวยงาม --- */
            <Box sx={{ p: 2, bgcolor: '#FFFDE7', borderRadius: 2, border: '1px dashed #fbc02d', textAlign: 'center' }}>
                <Typography variant="caption" display="block" gutterBottom sx={{ color: '#f57f17' }}>
                    * เป็นการแก้ไขรหัสผ่าน Admin ต้องยืนยันตัวตน *
                </Typography>
                
                <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">Ref Code</Typography>
                    <Typography variant="h6" fontWeight="bold" color="#3E2723" sx={{ letterSpacing: 1, lineHeight: 1 }}>
                        {otpRef}
                    </Typography>
                </Box>

                {/* ✅ ช่องกรอก OTP 8 หลักแบบแยกช่อง */}
                <Box 
                    sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, mb: 2 }} 
                    onPaste={handleOtpPaste}
                >
                    {[...Array(8)].map((_, index) => (
                        <React.Fragment key={index}>
                        <input
                            ref={el => otpInputs.current[index] = el}
                            type="tel"
                            maxLength={1}
                            value={otpCode[index] || ""}
                            onChange={(e) => handleOtpChange(index, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(index, e)}
                            disabled={loading}
                            style={{
                                width: '32px', height: '40px',
                                fontSize: '18px', fontWeight: 'bold', textAlign: 'center',
                                borderRadius: '6px',
                                border: '1px solid #FFCA28',
                                backgroundColor: '#fff',
                                outline: 'none',
                                color: '#333',
                                transition: 'all 0.2s'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#F57F17';
                                e.target.style.boxShadow = '0 0 0 2px rgba(245, 127, 23, 0.2)';
                                e.target.style.transform = 'translateY(-2px)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = '#FFCA28';
                                e.target.style.boxShadow = 'none';
                                e.target.style.transform = 'none';
                            }}
                        />
                        {/* ขีดคั่นกลางระหว่างเลข 4 กับ 5 */}
                        {index === 3 && (
                            <Box component="span" sx={{ display: 'flex', alignItems: 'center', color: '#BDBDBD', fontWeight: 'bold' }}>-</Box>
                        )}
                        </React.Fragment>
                    ))}
                </Box>
                
                <Box sx={{ textAlign: 'center' }}>
                    <Button 
                        size="small" 
                        onClick={handleRequestOtp} 
                        disabled={otpLoading || loading}
                        sx={{ color: '#F57F17', textTransform: 'none' }}
                    >
                        {otpLoading ? "กำลังส่ง..." : "ขอรหัส OTP ใหม่"}
                    </Button>
                </Box>
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'space-between' }}>
        <Button 
          onClick={onClose} 
          color="inherit" 
          disabled={loading}
          sx={{ borderRadius: 2, px: 3 }}
        >
          ยกเลิก
        </Button>

        {/* ปุ่มเปลี่ยนไปตาม Mode */}
        {!requireOtpMode ? (
            <Button 
                onClick={handleSave} 
                variant="contained" 
                color="primary"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                sx={{ borderRadius: 2, px: 3, boxShadow: 2 }}
            >
                {loading ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
        ) : (
            <Button 
                onClick={handleConfirmWithOtp} 
                variant="contained" 
                color="warning" // สีส้ม/เหลือง
                disabled={loading || otpCode.length < 8}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SecurityIcon />}
                sx={{ borderRadius: 2, px: 3, boxShadow: 2, bgcolor: '#FFCA28', color: '#3E2723', '&:hover': { bgcolor: '#FFB300' } }}
            >
                {loading ? "กำลังตรวจสอบ..." : "ยืนยัน OTP"}
            </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}