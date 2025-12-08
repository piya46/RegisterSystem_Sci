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
import SparklesIcon from "@mui/icons-material/AutoAwesome";

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
    // Auto-focus on open
    if (open) {
      setTimeout(() => nameRef.current?.focus(), 200);
    }
  }, [open]);

  const trimmedName = useMemo(() => name.trim(), [name]);

  // Validation Logic
  const nameError =
    trimmedName.length === 0
      ? "Point Name is required" // ทับศัพท์
      : trimmedName.length < 2
      ? "Name too short (min 2 chars)"
      : trimmedName.length > NAME_MAX
      ? `Name too long (max ${NAME_MAX} chars)`
      : "";

  const descError =
    description.length > DESC_MAX
      ? `Description too long (max ${DESC_MAX} chars)`
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
      
      // Handle Async onSave
      if (ret && typeof ret.then === "function") {
        await ret;
      }
      onClose?.();
    } catch (err) {
      console.error("Save registration point failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    // Shortcut: Ctrl+Enter / Cmd+Enter to Save
    if ((e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
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
          boxShadow: "0 16px 48px rgba(136,74,252,0.20)" // Purple Shadow
        }
      }}
    >
      {/* Loading Indicator */}
      {saving && (
        <LinearProgress sx={{ height: 3, bgcolor: "#f3e8ff", "& .MuiLinearProgress-bar": { bgcolor: "#884afc" } }} />
      )}

      {/* Header Area */}
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
            {/* Header Title (ทับศัพท์) */}
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
              {isEdit ? "Edit Registration Point" : "Add Registration Point"}
            </Typography>
            <Chip
              size="small"
              label={isEdit ? "Edit Mode" : "New Point"}
              sx={{
                ml: 1,
                fontWeight: 700,
                bgcolor: isEdit ? "#ede7f6" : "#e8f5e9",
                color: isEdit ? "#6d38b6" : "#1b5e20",
                border: "1px solid",
                borderColor: isEdit ? "rgba(109,56,182,0.2)" : "rgba(27,94,32,0.2)"
              }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Tips: ระบุชื่อ Location ให้ชัดเจน เช่น “Hall 1 - Desk A” หรือ “Main Entrance”
          </Typography>
        </DialogTitle>
      </Box>

      <Divider />

      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <DialogContent sx={{ pt: 2.5 }}>
          <Stack spacing={2.5}>
            {/* Field: Point Name */}
            <TextField
              inputRef={nameRef}
              autoFocus
              label="Point Name"
              placeholder="Ex. Main Hall - Desk A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={Boolean(nameError)}
              helperText={
                nameError || (
                  <Stack direction="row" justifyContent="space-between">
                    <span>Short & Unique Name</span>
                    <span>{trimmedName.length}/{NAME_MAX}</span>
                  </Stack>
                )
              }
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <StoreIcon sx={{ color: "#884afc" }} />
                  </InputAdornment>
                )
              }}
              fullWidth
              required
              sx={fieldStyle}
            />

            {/* Field: Description */}
            <TextField
              label="Description (Optional)"
              placeholder="Ex. Near elevators, Service time 08:00–10:30"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={Boolean(descError)}
              helperText={
                descError || (
                  <Stack direction="row" justifyContent="space-between">
                    <span>Additional details / Operating hours</span>
                    <span>{description.length}/{DESC_MAX}</span>
                  </Stack>
                )
              }
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <NotesIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: description ? (
                  <InputAdornment position="end">
                    <Tooltip title="Clear text">
                      <IconButton
                        size="small"
                        edge="end"
                        onClick={() => setDescription("")}
                        disabled={saving}
                      >
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ) : null
              }}
              multiline
              minRows={3}
              maxRows={6}
              fullWidth
              sx={fieldStyle}
            />

            {/* Preview Section */}
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ pl: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                PREVIEW BADGE:
              </Typography>
              <Chip
                icon={<StoreIcon />}
                label={trimmedName || "Point Name"}
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

        <DialogActions sx={{ p: 2.2, bgcolor: "#fafafa" }}>
          <Button
            onClick={onClose}
            disabled={saving}
            color="inherit"
            sx={{ fontWeight: 700, borderRadius: 2, color: "text.secondary" }}
          >
            Cancel
          </Button>
          
          <Button
            type="submit"
            variant="contained"
            disabled={isInvalid || saving}
            sx={{
              fontWeight: 800,
              borderRadius: 2,
              px: 3,
              bgcolor: "#6d38b6",
              "&:hover": { bgcolor: "#512da8" },
              boxShadow: "0 6px 18px rgba(109,56,182,0.25)"
            }}
          >
            {isEdit ? "Save Changes" : "Add Point"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

// Custom Style for nice focus state
const fieldStyle = {
  "& .MuiOutlinedInput-root": {
    borderRadius: 2,
    "&.Mui-focused fieldset": {
      borderColor: "#884afc",
      borderWidth: 2
    }
  }
};