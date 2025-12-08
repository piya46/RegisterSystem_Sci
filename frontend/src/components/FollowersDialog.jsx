import React, { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Typography, Stack, IconButton, Box, Chip, Divider
} from "@mui/material";
import GroupIcon from "@mui/icons-material/Groups";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import PersonIcon from "@mui/icons-material/Person";

// ฟังก์ชันจำกัดค่า (Helper)
function clampInt(v, min = 0, max = 50) {
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export default function FollowersDialog({ open, onClose, onConfirm }) {
  const [value, setValue] = useState("0");
  const inputRef = useRef(null);

  // เมื่อเปิด Dialog ให้รีเซ็ตค่า
  useEffect(() => {
    if (open) {
      setValue("0");
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [open]);

  // ฟังก์ชันยืนยัน
  const handleConfirm = () => {
    const n = clampInt(value);
    onConfirm?.(n);
    setValue("0");
  };

  // ปุ่ม +/-
  const handleAdjust = (delta) => {
    const current = clampInt(value);
    const next = clampInt(current + delta);
    setValue(String(next));
  };

  // ปุ่มลัดเลือกจำนวน
  const handleQuickSelect = (num) => {
    setValue(String(num));
    inputRef.current?.focus();
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="xs" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 4, padding: 1 } // เพิ่มความโค้งมน
      }}
    >
      <DialogTitle sx={{ textAlign: "center", pt: 3, pb: 1 }}>
        <Stack direction="column" alignItems="center" spacing={1}>
          <Box sx={{ bgcolor: "#e3f2fd", p: 1.5, borderRadius: "50%" }}>
            <GroupIcon sx={{ fontSize: 32, color: "#1976d2" }} />
          </Box>
          <Typography variant="h6" fontWeight={800} color="#333">
            ระบุจำนวนผู้ติดตาม
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" align="center" mb={3}>
          รวมเพื่อนหรือผู้ติดตามที่มาด้วยกัน (ไม่รวมตัวผู้ลงทะเบียน)
        </Typography>

        {/* ส่วนปุ่ม +/- และ Input */}
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={2} mb={3}>
          <IconButton 
            onClick={() => handleAdjust(-1)} 
            color="error" 
            disabled={clampInt(value) <= 0}
            sx={{ transform: 'scale(1.2)' }}
          >
            <RemoveCircleIcon fontSize="large" />
          </IconButton>

          <TextField
            inputRef={inputRef}
            value={value}
            onChange={(e) => {
              // รับเฉพาะตัวเลขเท่านั้น (ตัดตัวอักษรและเครื่องหมายลบ)
              const val = e.target.value.replace(/\D/g, ""); 
              setValue(val);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            inputProps={{
              inputMode: "numeric",
              style: { 
                textAlign: "center", 
                fontSize: 32, 
                fontWeight: "bold",
                padding: "8px" 
              }
            }}
            variant="standard" // แบบขีดเส้นใต้ ดูสะอาดตา
            sx={{ width: 80 }}
          />

          <IconButton 
            onClick={() => handleAdjust(1)} 
            color="primary"
            disabled={clampInt(value) >= 50}
            sx={{ transform: 'scale(1.2)' }}
          >
            <AddCircleIcon fontSize="large" />
          </IconButton>
        </Stack>
        
        <Divider sx={{ mb: 2 }}>
            <Chip label="เลือกจำนวนด่วน" size="small" sx={{ bgcolor: '#fff', color: '#999' }} />
        </Divider>

        {/* ปุ่มเลือกจำนวนด่วน */}
        <Stack direction="row" spacing={1} justifyContent="center">
          {[0, 1, 2, 3].map((num) => (
            <Chip
              key={num}
              label={num === 0 ? "ไม่มี" : `${num} คน`}
              onClick={() => handleQuickSelect(num)}
              icon={num > 0 ? <PersonIcon /> : undefined}
              color={String(num) === value ? "primary" : "default"}
              variant={String(num) === value ? "filled" : "outlined"}
              clickable
              sx={{ fontWeight: 500, px: 1 }}
            />
          ))}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ pb: 3, px: 3, justifyContent: "space-between" }}>
        <Button
          onClick={onClose}
          color="inherit"
          sx={{ borderRadius: 2, px: 3, color: "text.secondary" }}
        >
          ยกเลิก
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          size="large"
          sx={{ borderRadius: 2, px: 4, boxShadow: 2 }}
        >
          ยืนยัน ({value} คน)
        </Button>
      </DialogActions>
    </Dialog>
  );
}