// src/components/AdminPasswordDialog.jsx
import React, { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Alert, InputAdornment, IconButton,
  Box, Typography, Stack
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import LockResetIcon from '@mui/icons-material/LockReset';
import SaveIcon from '@mui/icons-material/Save';

export default function AdminPasswordDialog({
  open, onClose, onSave, isSelf, user
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  
  // States สำหรับปุ่มลูกตา
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // รีเซ็ตค่าทุกครั้งที่เปิด Dialog
  useEffect(() => {
    if (open) {
      setPassword("");
      setConfirm("");
      setError("");
      setShowPassword(false);
      setShowConfirm(false);
    }
  }, [open]);

  const handleSave = () => {
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
    setError("");
    onSave(password);
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
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: 4, p: 1 } }}
    >
      <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <Box sx={{ bgcolor: '#e3f2fd', p: 1.5, borderRadius: '50%' }}>
            <LockResetIcon color="primary" sx={{ fontSize: 32 }} />
          </Box>
          <Typography variant="h6" fontWeight="bold">
            {isSelf ? "เปลี่ยนรหัสผ่านของคุณ" : "รีเซ็ตรหัสผ่านผู้ใช้"}
          </Typography>
          {!isSelf && user && (
            <Typography variant="body2" color="text.secondary">
              สำหรับบัญชี: <b>{user.username}</b>
            </Typography>
          )}
        </Box>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={1} mt={1}>
          {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
          
          {renderPasswordInput("รหัสผ่านใหม่", password, setPassword, showPassword, setShowPassword, true)}
          {renderPasswordInput("ยืนยันรหัสผ่านใหม่", confirm, setConfirm, showConfirm, setShowConfirm)}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'space-between' }}>
        <Button 
          onClick={onClose} 
          color="inherit" 
          sx={{ borderRadius: 2, px: 3 }}
        >
          ยกเลิก
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          color="primary"
          startIcon={<SaveIcon />}
          sx={{ borderRadius: 2, px: 3, boxShadow: 2 }}
        >
          บันทึก
        </Button>
      </DialogActions>
    </Dialog>
  );
}