// src/components/AdminPasswordDialog.jsx
import React, { useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography
} from "@mui/material";

export default function AdminPasswordDialog({
  open, onClose, onSave, isSelf, user
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!password) {
      setError("กรุณากรอกรหัสผ่านใหม่");
      return;
    }
    if (password !== confirm) {
      setError("รหัสผ่านไม่ตรงกัน");
      return;
    }
    setError("");
    onSave(password);
    setPassword("");
    setConfirm("");
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{isSelf ? "เปลี่ยนรหัสผ่านของคุณ" : `รีเซ็ตรหัสผ่าน: ${user?.username}`}</DialogTitle>
      <DialogContent>
        <TextField
          label="รหัสผ่านใหม่"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          fullWidth
          margin="normal"
          autoFocus
        />
        <TextField
          label="ยืนยันรหัสผ่านใหม่"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          fullWidth
          margin="normal"
        />
        {error && <Typography color="error">{error}</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">ยกเลิก</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          {isSelf ? "เปลี่ยนรหัสผ่าน" : "รีเซ็ต"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
