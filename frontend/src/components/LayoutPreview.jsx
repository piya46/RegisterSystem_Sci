import React from "react";
import { Box, Chip, Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, Button, MenuItem } from "@mui/material";
import { EmptyState } from "./FeedbackStates";

export default function LayoutPreview({ layoutKey, config, event }) {
  if (layoutKey === "registrationForm") {
    const fields = Array.isArray(config?.fields) ? config.fields : [];
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff", position: "sticky", top: 92 }}>
        <Typography variant="overline" color="text.secondary" fontWeight={900}>Preview</Typography>
        <Typography variant="h6" fontWeight={950}>แบบฟอร์มลงทะเบียน</Typography>
        <Stack spacing={1.25} mt={1.5}>
          {fields.filter((field) => field.enabled !== false).map((field) => (
            <TextField key={field.id || field.name || field.key} size="small" label={`${field.label || field.name}${field.required ? " *" : ""}`} placeholder={field.placeholder || ""} select={field.type === "select"} disabled>
              {(field.options || []).map((option) => <MenuItem key={option.value || option.label} value={option.value || option.label}>{option.label || option.value}</MenuItem>)}
            </TextField>
          ))}
        </Stack>
      </Paper>
    );
  }
  if (layoutKey === "dashboard") {
    const widgets = Array.isArray(config?.widgets) ? config.widgets.filter((item) => item.enabled !== false) : [];
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff", position: "sticky", top: 92 }}>
        <Typography variant="overline" color="text.secondary" fontWeight={900}>Preview</Typography>
        <Grid container spacing={1.25}>
          {widgets.map((widget) => (
            <Grid item xs={12} sm={widget.type === "table" ? 12 : 6} key={widget.id || widget.title}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: widget.type === "table" ? "#f8fafc" : "#fff8e1" }}>
                <Typography variant="caption" color="text.secondary">{widget.type}</Typography>
                <Typography fontWeight={950}>{widget.title}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>
    );
  }
  if (layoutKey === "ticket") {
    const blocks = Array.isArray(config?.blocks) ? config.blocks.filter((item) => item.enabled !== false) : [];
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff", position: "sticky", top: 92 }}>
        <Typography variant="overline" color="text.secondary" fontWeight={900}>Preview</Typography>
        <Paper sx={{ overflow: "hidden", borderRadius: 2, border: "1px solid #e4e7ec" }}>
          <Box sx={{ p: 1.5, bgcolor: event?.branding?.secondaryColor || "#114b5f", color: "#fff" }}>
            <Typography fontWeight={950}>{event?.name || "บัตรเข้างาน"}</Typography>
          </Box>
          <Stack spacing={1} sx={{ p: 2 }}>
            {blocks.map((block) => (
              <Paper key={block.id || block.label} variant="outlined" sx={{ p: 1.25, borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">{block.label || block.type}</Typography>
                <Typography fontWeight={900}>{block.title || block.body || block.value || "-"}</Typography>
              </Paper>
            ))}
          </Stack>
        </Paper>
      </Paper>
    );
  }
  if (layoutKey === "report") {
    const columns = Array.isArray(config?.columns) ? config.columns.filter((item) => item.enabled !== false) : [];
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff", position: "sticky", top: 92 }}>
        <Typography variant="overline" color="text.secondary" fontWeight={900}>Preview</Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead><TableRow>{columns.map((column) => <TableCell key={column.id || column.key}>{column.label || column.key}</TableCell>)}</TableRow></TableHead>
            <TableBody><TableRow>{columns.map((column) => <TableCell key={column.id || column.key}>ตัวอย่าง</TableCell>)}</TableRow></TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  }

  const blocks = Array.isArray(config?.blocks) ? config.blocks.filter((block) => block.enabled !== false) : [];
  if (blocks.length === 0) {
    return <EmptyState title="ยังไม่มีบล็อกในหน้านี้" description="เพิ่มบล็อกด้านซ้ายเพื่อเริ่มออกแบบหน้า Landing" />;
  }
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "#fff", position: "sticky", top: 92 }}>
      <Typography variant="overline" color="text.secondary" fontWeight={900}>Preview</Typography>
      <Stack spacing={1.5}>
        {blocks.map((block) => {
          if (block.type === "hero") {
            return (
              <Paper key={block.id} sx={{ p: 2.5, borderRadius: 2, color: "#fff", background: `linear-gradient(135deg, ${event?.branding?.secondaryColor || "#114b5f"}, ${event?.branding?.primaryColor || "#f7b500"})` }}>
                {block.logoUrl && <Box component="img" src={block.logoUrl} alt="" sx={{ width: 56, height: 56, objectFit: "contain", bgcolor: "#fff", borderRadius: 1, p: 0.5, mb: 1 }} />}
                <Typography variant="h5" fontWeight={950}>{block.title || event?.name || "ชื่อกิจกรรม"}</Typography>
                <Typography fontWeight={800} sx={{ opacity: 0.9 }}>{block.subtitle}</Typography>
                {block.body && <Typography variant="body2" sx={{ mt: 1, opacity: 0.85 }}>{block.body}</Typography>}
                {block.primaryActionLabel && <Chip sx={{ mt: 1.5, bgcolor: "#fff", fontWeight: 900 }} label={block.primaryActionLabel} />}
              </Paper>
            );
          }
          if (block.type === "schedule") {
            return (
              <Paper key={block.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography fontWeight={950}>{block.title || "กำหนดการ"}</Typography>
                <Stack spacing={1} mt={1}>
                  {(block.items || []).map((item, index) => (
                    <Stack key={`${block.id}-preview-${index}`} direction="row" spacing={1}>
                      <Chip size="small" label={item.time || "-"} />
                      <Box>
                        <Typography variant="body2" fontWeight={850}>{item.title || "รายการ"}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.description}</Typography>
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            );
          }
          if (block.type === "faq") {
            return (
              <Paper key={block.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography fontWeight={950}>{block.title || "FAQ"}</Typography>
                {(block.items || []).slice(0, 3).map((item, index) => (
                  <Box key={`${block.id}-faq-${index}`} sx={{ mt: 1 }}>
                    <Typography variant="body2" fontWeight={850}>{item.question || "คำถาม"}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.answer || "คำตอบ"}</Typography>
                  </Box>
                ))}
              </Paper>
            );
          }
          if (block.type === "cta") {
            return (
              <Paper key={block.id} variant="outlined" sx={{ p: 2, borderRadius: 2, textAlign: "center", bgcolor: "#fff8e1" }}>
                <Typography fontWeight={950}>{block.title || "Call to action"}</Typography>
                <Button size="small" variant="contained" sx={{ mt: 1 }}>{block.buttonLabel || "เปิด"}</Button>
              </Paper>
            );
          }
          return (
            <Paper key={block.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography fontWeight={950}>{block.title || "ข้อความ"}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>{block.body}</Typography>
            </Paper>
          );
        })}
      </Stack>
    </Paper>
  );
}
