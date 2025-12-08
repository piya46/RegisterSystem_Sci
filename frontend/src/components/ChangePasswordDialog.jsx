// src/components/ChangePasswordDialog.jsx
import React, { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Alert, InputAdornment, IconButton, Stack, Box, Typography
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import LockResetIcon from '@mui/icons-material/LockReset';
import SaveIcon from '@mui/icons-material/Save';
import useAuth from "../hooks/useAuth";
import * as api from "../utils/api";

export default function ChangePasswordDialog({ open, onClose }) {
  const { token } = useAuth();
  
  // Form States
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Visibility States
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Status States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
      setSuccess("");
      setShowOld(false);
      setShowNew(false);
      setShowConfirm(false);
    }
  }, [open]);

  const handleSave = async () => {
    setError("");
    setSuccess("");

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("รหัสผ่านใหม่กับยืนยันรหัสไม่ตรงกัน");
      return;
    }
    if (newPassword.length < 6) {
      setError("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(
        { oldPassword, newPassword },
        token
      );
      setSuccess("เปลี่ยนรหัสผ่านสำเร็จแล้ว");
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err?.response?.data?.error || "เกิดข้อผิดพลาด รหัสผ่านเดิมอาจไม่ถูกต้อง");
    }
    setLoading(false);
  };

  const renderPasswordInput = (label, value, setValue, show, setShow, autoFocus = false) => (
    <TextField
      label={label}
      type={show ? "text" : "password"}
      fullWidth
      margin="normal"
      value={value}
      onChange={e => setValue(e.target.value)}
      autoFocus={autoFocus}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton onClick={() => setShow(!show)} edge="end">
              {show ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </InputAdornment>
        ),
      }}
      sx={{
        '& .MuiOutlinedInput-root': { borderRadius: 2 }
      }}
    />
  );

  return (
    <Dialog 
      open={open} 
      onClose={!loading ? onClose : undefined} 
      fullWidth 
      maxWidth="xs"
      PaperProps={{
        sx: { borderRadius: 4, padding: 1 }
      }}
    >
      <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <Box sx={{ bgcolor: '#e3f2fd', p: 1.5, borderRadius: '50%' }}>
            <LockResetIcon color="primary" sx={{ fontSize: 32 }} />
          </Box>
          <Typography variant="h6" fontWeight="bold">เปลี่ยนรหัสผ่าน</Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ pt: 2 }}>
        <Box sx={{ mt: 1 }}>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}
          
          {renderPasswordInput("รหัสผ่านเดิม", oldPassword, setOldPassword, showOld, setShowOld, true)}
          {renderPasswordInput("รหัสผ่านใหม่", newPassword, setNewPassword, showNew, setShowNew)}
          {renderPasswordInput("ยืนยันรหัสผ่านใหม่", confirmPassword, setConfirmPassword, showConfirm, setShowConfirm)}
        </Box>
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
        <Button
          onClick={handleSave}
          variant="contained"
          color="primary"
          disabled={loading}
          startIcon={!loading && <SaveIcon />}
          sx={{ borderRadius: 2, px: 3, boxShadow: 2 }}
        >
          {loading ? "กำลังบันทึก..." : "บันทึก"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}