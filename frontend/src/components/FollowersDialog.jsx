import React, { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Typography, Stack, InputAdornment
} from "@mui/material";
import GroupIcon from "@mui/icons-material/Groups";

function clampInt(v, min = 0, max = 50) {
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export default function FollowersDialog({ open, onClose, onConfirm }) {
  // เก็บเป็น string เพื่อควบคุม input ได้ดี (รวมถึงค่าว่าง "")
  const [value, setValue] = useState("0");
  const inputRef = useRef(null);
  const focusTimer = useRef(null);

  // รีเซ็ตเมื่อเปิดใหม่ และโฟกัสช่องกรอก
  useEffect(() => {
    if (open) {
      setValue("0");
      // โฟกัสหลัง render เสร็จ
      focusTimer.current = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 200);
    }
    return () => {
      if (focusTimer.current) {
        clearTimeout(focusTimer.current);
        focusTimer.current = null;
      }
    };
  }, [open]);

  const handleConfirm = () => {
    const n = clampInt(value);
    onConfirm?.(n);
    setValue("0");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleConfirm();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle
        sx={{
          textAlign: "center",
          pb: 1.5,
          color: "#6d38b6",
          fontWeight: 700,
          letterSpacing: 0.5,
          fontSize: 22
        }}
      >
        <GroupIcon sx={{ mr: 1, fontSize: 26, mb: "-5px" }} color="primary" />
        จำนวนผู้ติดตาม
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} alignItems="center" sx={{ mt: 1 }}>
          <Typography
            color="text.secondary"
            fontWeight={500}
            sx={{ fontSize: 16, mb: 1, textAlign: "center" }}
          >
            หากผู้เข้าร่วมมีเพื่อนหรือผู้ติดตามมาด้วย ให้กรอกจำนวนคนไว้ที่นี่
          </Typography>

          <TextField
            type="number"
            label="กรอกจำนวนผู้ติดตาม"
            value={value}
            onChange={(e) => {
              // อนุญาตค่าว่างเพื่อให้ลบได้ แต่จะ clamp ตอนยืนยัน
              const next = e.target.value;
              // กันใส่ทศนิยม: ตัดทุกอย่างให้เหลือเฉพาะเครื่องหมายลบตัวแรกและตัวเลข
              const sanitized = next.replace(/[^\d-]/g, "");
              setValue(sanitized);
            }}
            onKeyDown={(e) => {
              // กัน scroll เปลี่ยนค่าเวลาโฟกัสอยู่ที่ input
              if (e.key === "Enter") handleConfirm();
            }}
            onWheel={(e) => e.currentTarget.blur()}
            inputRef={inputRef}
            inputProps={{
              min: 0,
              max: 50,
              step: 1,
              inputMode: "numeric",
              style: { textAlign: "center", fontSize: 20 }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <GroupIcon color="secondary" />
                </InputAdornment>
              ),
            }}
            fullWidth
            variant="outlined"
            sx={{
              "& .MuiInputBase-root": {
                borderRadius: 2,
                bgcolor: "#f6f2ff",
                fontWeight: 700
              }
            }}
            aria-label="จำนวนผู้ติดตาม (คน)"
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ pb: 2, px: 3, justifyContent: "center" }}>
        <Button
          onClick={() => {
            setValue("0");
            onClose?.();
          }}
          color="secondary"
          variant="outlined"
          sx={{ fontWeight: 600, px: 3, borderRadius: 2 }}
        >
          ยกเลิก
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="primary"
          sx={{ fontWeight: 700, px: 4, borderRadius: 2 }}
          disabled={clampInt(value) < 0}
        >
          ตกลง
        </Button>
      </DialogActions>
    </Dialog>
  );
}
