import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, TextField, Stack, Button, Tabs, Tab, Alert, CircularProgress, IconButton, Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import Grid from '@mui/material/GridLegacy';
import { useOutletContext } from 'react-router';
import SaveIcon from '@mui/icons-material/Save';
import CodeIcon from '@mui/icons-material/Code';
import { updateEventLayout } from '../utils/api';
import LayoutPreview from '../components/LayoutPreview';

const layoutKeys = [
  { key: "landingPage", label: "หน้าแรก (Landing Page)" },
  { key: "registrationForm", label: "ฟอร์มลงทะเบียน" },
  { key: "ticket", label: "บัตรเข้างาน (Ticket)" },
  { key: "dashboard", label: "หน้าจอ Dashboard" },
  { key: "publicReport", label: "รายงานสาธารณะ" },
];

export default function EventLayoutsPage() {
  const { event, setEvent } = useOutletContext();
  const [activeTab, setActiveTab] = useState("landingPage");
  const [jsonText, setJsonText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ open: false, severity: "success", text: "" });
  const [advancedMode, setAdvancedMode] = useState(false);

  // Load layout JSON when tab or event changes
  useEffect(() => {
    if (event) {
      const storedConfig = event.layouts?.[activeTab]?.config || {};
      setJsonText(JSON.stringify(storedConfig, null, 2));
      setErrorText("");
    }
  }, [event, activeTab]);

  const handleJsonChange = (e) => {
    setJsonText(e.target.value);
    try {
      JSON.parse(e.target.value);
      setErrorText("");
    } catch {
      setErrorText("รูปแบบ JSON ไม่ถูกต้อง");
    }
  };

  const handleSave = async () => {
    if (errorText) return;
    setSaving(true);
    setMessage({ open: false, severity: "success", text: "" });
    try {
      const parsed = JSON.parse(jsonText || "{}");
      const response = await updateEventLayout(event._id || event.id, activeTab, parsed);
      setMessage({ open: true, severity: "success", text: `บันทึก Layout ของ ${layoutKeys.find(k => k.key === activeTab)?.label} สำเร็จ` });
      const updatedLayout = response.data?.data || { config: parsed };
      setEvent((current) => ({
        ...current,
        layouts: {
          ...(current.layouts || {}),
          [activeTab]: updatedLayout,
        },
      }));
    } catch (error) {
      setMessage({ open: true, severity: "error", text: error.response?.data?.message || "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  };

  const parsedConfig = () => {
    try {
      return JSON.parse(jsonText || "{}");
    } catch {
      return {};
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={800}>ออกแบบหน้าจอ (Layouts)</Typography>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<CodeIcon />}
            onClick={() => setAdvancedMode(!advancedMode)}
            sx={{ borderRadius: 8 }}
          >
            {advancedMode ? "ปิดโหมดขั้นสูง" : "โหมดขั้นสูง (JSON)"}
          </Button>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving || !!errorText}
            sx={{ borderRadius: 8, px: 3 }}
          >
            บันทึก Layout
          </Button>
        </Stack>
      </Stack>

      {message.open && (
        <Alert severity={message.severity} sx={{ mb: 3, borderRadius: 2 }}>{message.text}</Alert>
      )}

      <Paper sx={{ borderRadius: 3, overflow: 'hidden', mb: 4 }}>
        <Tabs
          value={activeTab}
          onChange={(e, v) => setActiveTab(v)}
          variant="scrollable"
          sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#fff' }}
        >
          {layoutKeys.map(k => (
            <Tab key={k.key} label={k.label} value={k.key} />
          ))}
        </Tabs>

        <Box sx={{ bgcolor: '#f8fafc', p: 3 }}>
          <Grid container spacing={3}>
            {/* Editor Side */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, borderRadius: 2, height: '100%' }}>
                <Typography variant="h6" fontWeight={700} mb={2}>ตัวแก้ไข {layoutKeys.find(k => k.key === activeTab)?.label}</Typography>

                {!advancedMode ? (
                  <Box textAlign="center" py={5}>
                    <Typography color="text.secondary" mb={2}>
                      เครื่องมือจัดหน้าแบบ UI พื้นฐานกำลังอยู่ระหว่างการพัฒนา
                    </Typography>
                    <Button variant="contained" onClick={() => setAdvancedMode(true)}>
                      เปิดตัวแก้ไข JSON (โหมดขั้นสูง) แทน
                    </Button>
                  </Box>
                ) : (
                  <Box>
                    <TextField
                      fullWidth
                      multiline
                      rows={20}
                      variant="outlined"
                      value={jsonText}
                      onChange={handleJsonChange}
                      error={!!errorText}
                      helperText={errorText}
                      InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13, bgcolor: '#f1f5f9' } }}
                    />
                  </Box>
                )}
              </Paper>
            </Grid>

            {/* Preview Side */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="text.secondary" mb={1} fontWeight={700}>PREVIEW (ตัวอย่าง)</Typography>
              <LayoutPreview layoutKey={activeTab} config={parsedConfig()} event={event} />
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Box>
  );
}
