import React from "react";
import { Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import InboxIcon from "@mui/icons-material/Inbox";

export function LoadingState({ label = "กำลังโหลดข้อมูล...", minHeight = 300 }) {
  return (
    <Box sx={{ minHeight, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Stack alignItems="center" spacing={2}>
        <CircularProgress color="warning" />
        <Typography color="text.secondary" fontWeight={800}>{label}</Typography>
      </Stack>
    </Box>
  );
}

export function EmptyState({ title = "ยังไม่มีข้อมูล", description = "", actionLabel = "", onAction, icon = <InboxIcon /> }) {
  return (
    <Paper variant="outlined" sx={{ p: 4, borderRadius: 2, bgcolor: "#fff", textAlign: "center" }}>
      <Box sx={{ color: "text.secondary", mb: 1, "& svg": { fontSize: 42 } }}>{icon}</Box>
      <Typography variant="h6" fontWeight={900}>{title}</Typography>
      {description && <Typography color="text.secondary" mt={0.75}>{description}</Typography>}
      {actionLabel && onAction && (
        <Button variant="contained" sx={{ mt: 2 }} onClick={onAction}>{actionLabel}</Button>
      )}
    </Paper>
  );
}
