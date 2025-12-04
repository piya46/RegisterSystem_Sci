// src/components/RegistrationPointDialog.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Typography, Chip, Divider,
  InputAdornment, IconButton, Tooltip, Slide, LinearProgress, Box
} from "@mui/material";
import StoreIcon from "@mui/icons-material/Store";
import NotesIcon from "@mui/icons-material/Notes";
import ClearIcon from "@mui/icons-material/Backspace";
import SparklesIcon from "@mui/icons-material/AutoAwesome"; // ใช้เป็นไอคอนประกอบหัวข้อ

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const NAME_MAX = 60;
const DESC_MAX = 200;

export default function RegistrationPointDialog({
  open,
  onClose,
  onSave,
  initialData,
  isEdit
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    setName(initialData?.name || "");
    setDescription(initialData?.description || "");
  }, [initialData, open]);

  useEffect(() => {
    // โฟกัสช่องชื่อเมื่อเปิด dialog
    if (open) {
      setTimeout(() => nameRef.current?.focus(), 200);
    }
  }, [open]);

  const trimmedName = useMemo(() => name.trim(), [name]);

  const nameError =
    trimmedName.length === 0
      ? "กรุณาระบุชื่อจุดลงทะเบียน"
      : trimmedName.length < 2
      ? "ชื่อต้องมีความยาวอย่างน้อย 2 ตัวอักษร"
      : trimmedName.length > NAME_MAX
      ? `ชื่อยาวเกิน ${NAME_MAX} อักขระ`
      : "";

  const descError =
    description.length > DESC_MAX
      ? `รายละเอียดเกิน ${DESC_MAX} อักขระ`
      : "";

  const isInvalid = Boolean(nameError || descError);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (isInvalid || saving) return;

    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        description: description.trim()
      };
      const ret = onSave?.(payload);
      // รองรับ onSave แบบ async (Promise)
      if (ret && typeof ret.then === "function") {
        await ret;
      }
      // ปิดเมื่อบันทึกสำเร็จ
      onClose?.();
    } catch (err) {
      // ถ้าอยากแสดง error จริง ๆ สามารถใส่ Snackbar ภายนอกได้
      console.error("Save registration point failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    // Enter = บันทึก, Esc = ปิด
    if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || (e.key === "Enter" && e.target.tagName !== "TEXTAREA")) {
      handleSubmit(e);
    }
    if (e.key === "Escape") onClose?.();
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      TransitionComponent={Transition}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        elevation: 16,
        sx: {
          borderRadius: 3,
          overflow: "hidden",
          boxShadow: "0 16px 48px rgba(136,74,252,0.20)"
        }
      }}
    >
      {/* Saving bar */}
      {saving && (
        <LinearProgress sx={{ height: 3, bgcolor: "#f3e8ff" }} />
      )}

      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 1.5,
          background: "linear-gradient(90deg,#f7f0ff 0%,#fff 100%)"
        }}
      >
        <DialogTitle sx={{ p: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <SparklesIcon sx={{ color: "#884afc" }} />
            <Typography
              variant="h6"
              sx={{
                fontWeight: 800,
                background:
                  "linear-gradient(90deg,#6d38b6 0%, #884afc 50%, #b388ff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: 0.2
              }}
            >
              {isEdit ? "แก้ไขจุดลงทะเบียน" : "เพิ่มจุดลงทะเบียน"}
            </Typography>
            <Chip
              size="small"
              label={isEdit ? "Edit Mode" : "New"}
              sx={{
                ml: 1,
                fontWeight: 700,
                bgcolor: isEdit ? "#ede7f6" : "#e8f5e9",
                color: isEdit ? "#6d38b6" : "#1b5e20"
              }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            กรอกชื่อที่เข้าใจง่าย เช่น “หน้างานโถงชั้น 1” หรือ “โต๊ะลงทะเบียน A”
          </Typography>
        </DialogTitle>
      </Box>

      <Divider />

      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <DialogContent sx={{ pt: 2.5 }}>
          <Stack spacing={2.5}>
            {/* Name */}
            <TextField
              inputRef={nameRef}
              autoFocus
              label="ชื่อจุดลงทะเบียน"
              placeholder="เช่น โถงชั้น 1 – โต๊ะ A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={Boolean(nameError)}
              helperText={
                nameError || (
                  <Stack direction="row" justifyContent="space-between">
                    <span>ควรสั้น กระชับ และสื่อสารชัดเจน</span>
                    <span>{trimmedName.length}/{NAME_MAX}</span>
                  </Stack>
                )
              }
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <StoreIcon color="primary" />
                  </InputAdornment>
                )
              }}
              fullWidth
              required
            />

            {/* Description */}
            <TextField
              label="รายละเอียด (ไม่บังคับ)"
              placeholder="เช่น บริเวณหน้าลิฟต์ ใกล้บันไดเลื่อน เปิด 08:00–10:30 น."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={Boolean(descError)}
              helperText={
                descError || (
                  <Stack direction="row" justifyContent="space-between">
                    <span>ข้อมูลช่วยอธิบายตำแหน่ง/ช่วงเวลา/ข้อสังเกต</span>
                    <span>{description.length}/{DESC_MAX}</span>
                  </Stack>
                )
              }
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <NotesIcon color="secondary" />
                  </InputAdornment>
                ),
                endAdornment: description ? (
                  <InputAdornment position="end">
                    <Tooltip title="ล้างข้อความ">
                      <span>
                        <IconButton
                          size="small"
                          edge="end"
                          onClick={() => setDescription("")}
                          disabled={saving}
                        >
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ) : null
              }}
              multiline
              minRows={3}
              maxRows={6}
              fullWidth
            />

            {/* Preview Chip (เล่นสีเล็ก ๆ ให้เห็นชื่อจะไปโผล่ยังไง) */}
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2" color="text.secondary">
                ตัวอย่างแท็กแสดงผล:
              </Typography>
              <Chip
                icon={<StoreIcon />}
                label={trimmedName || "ชื่อจุดลงทะเบียน"}
                sx={{
                  fontWeight: 700,
                  borderRadius: 2,
                  bgcolor: "#fff3ff",
                  color: "#6d38b6",
                  border: "1px solid #e9d7ff"
                }}
              />
            </Stack>
          </Stack>
        </DialogContent>

        <Divider />

        <DialogActions sx={{ p: 2.2 }}>
          <Tooltip title="Esc">
            <span>
              <Button
                onClick={onClose}
                disabled={saving}
                sx={{ fontWeight: 700, borderRadius: 2 }}
              >
                ยกเลิก
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Enter หรือ Ctrl/Cmd + Enter">
            <span>
              <Button
                type="submit"
                variant="contained"
                disabled={isInvalid || saving}
                sx={{
                  fontWeight: 800,
                  borderRadius: 2,
                  px: 3,
                  boxShadow: "0 6px 18px rgba(136,74,252,0.25)"
                }}
              >
                {isEdit ? "บันทึก" : "เพิ่ม"}
              </Button>
            </span>
          </Tooltip>
        </DialogActions>
      </form>
    </Dialog>
  );
}
