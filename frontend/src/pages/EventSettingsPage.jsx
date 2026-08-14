import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, TextField, Stack, Button, Tabs, Tab, Alert, CircularProgress, Switch, FormControlLabel, Divider, IconButton, Tooltip } from '@mui/material';
import { useOutletContext } from 'react-router';
import SaveIcon from '@mui/icons-material/Save';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { updateEvent, uploadEventMedia } from '../utils/api';

const featureOptions = [
  { key: "registration", label: "ลงทะเบียนออนไลน์", description: "เปิดหน้าลงทะเบียนให้คนทั่วไปเข้าใช้งาน" },
  { key: "checkin", label: "Check-in หน้างาน", description: "สแกน QR และเช็คอินผ่าน Kiosk" },
  { key: "dashboard", label: "Dashboard", description: "ดูสถิติภาพรวม" },
  { key: "publicReport", label: "รายงานสาธารณะ", description: "จอแสดงผลอัปเดตแบบเรียลไทม์" },
  { key: "donations", label: "ผู้สนับสนุน", description: "เปิดรับเงินสนับสนุน (สลิป/โอนเงิน)" },
  { key: "packages", label: "แพ็กเกจ/สินค้า", description: "ให้ผู้สมัครเลือกแพ็กเกจและของที่ระลึก" },
  { key: "luckyDraw", label: "สุ่มผู้โชคดี", description: "ระบบสุ่มรางวัลจากผู้ที่เช็คอินแล้ว" },
  { key: "certificate", label: "เกียรติบัตร (E-Certificate)", description: "ออกใบเกียรติบัตรอิเล็กทรอนิกส์ให้ผู้ร่วมงาน" },
  { key: "wallet", label: "กระเป๋าเงิน (E-Wallet)", description: "ระบบกระเป๋าเงินอิเล็กทรอนิกส์และคูปอง" },
];

function MediaPreview({ src, alt, aspectRatio = '16 / 9', maxWidth = 420 }) {
  if (!src) return null;
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      sx={{
        display: 'block',
        width: '100%',
        maxWidth,
        aspectRatio,
        objectFit: 'contain',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: '#fff',
        p: 1,
      }}
    />
  );
}

export default function EventSettingsPage() {
  const { event, setEvent } = useOutletContext();
  const [tabIndex, setTabIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ open: false, severity: "success", text: "" });

  const [form, setForm] = useState({
    name: "",
    slug: "",
    eventYear: "",
    logoUrl: "",
    coverImageUrl: "",
    primaryColor: "#f7b500",
    secondaryColor: "#114b5f",
    accentColor: "#22a06b",
    enableRegister: true,
    maintenanceMode: false,
    enabledFeatures: {},
    welcomeMessage: "",
    contactEmail: "",
    bankAccountName: "",
    bankAccountNumber: "",
    bankName: "",
    paymentQrUrl: "",
  });

  useEffect(() => {
    if (event) {
      setForm({
        name: event.name || "",
        slug: event.slug || "",
        eventYear: event.eventYear || "",
        logoUrl: event.branding?.logoUrl || "",
        coverImageUrl: event.branding?.coverImageUrl || "",
        primaryColor: event.branding?.primaryColor || "#f7b500",
        secondaryColor: event.branding?.secondaryColor || "#114b5f",
        accentColor: event.branding?.accentColor || "#22a06b",
        enableRegister: event.config?.enableRegister !== false,
        maintenanceMode: event.config?.maintenanceMode === true,
        enabledFeatures: event.config?.enabledFeatures || {},
        welcomeMessage: event.config?.welcomeMessage || "",
        contactEmail: event.config?.contactEmail || "",
        bankAccountName: event.config?.bankAccountName || "",
        bankAccountNumber: event.config?.bankAccountNumber || "",
        bankName: event.config?.bankName || "",
        paymentQrUrl: event.config?.paymentQrUrl || "",
      });
    }
  }, [event]);

  const handleSave = async () => {
    setSaving(true);
    setMessage({ open: false, severity: "success", text: "" });
    try {
      const response = await updateEvent(event._id || event.id, {
        name: form.name,
        slug: form.slug,
        eventYear: form.eventYear,
        branding: {
          logoUrl: form.logoUrl,
          coverImageUrl: form.coverImageUrl,
          primaryColor: form.primaryColor,
          secondaryColor: form.secondaryColor,
          accentColor: form.accentColor,
        },
        config: {
          ...event.config, // Preserve other configs
          enableRegister: form.enableRegister,
          maintenanceMode: form.maintenanceMode,
          enabledFeatures: form.enabledFeatures,
          welcomeMessage: form.welcomeMessage,
          contactEmail: form.contactEmail,
          bankAccountName: form.bankAccountName,
          bankAccountNumber: form.bankAccountNumber,
          bankName: form.bankName,
          paymentQrUrl: form.paymentQrUrl,
        },
      });
      if (response.data?.data) setEvent(response.data.data);
      setMessage({ open: true, severity: "success", text: "บันทึกการตั้งค่ากิจกรรมสำเร็จ" });
    } catch (error) {
      setMessage({ open: true, severity: "error", text: error.response?.data?.message || "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e, field) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    try {
      setSaving(true);
      const res = await uploadEventMedia(
        file,
        event._id,
        field === 'paymentQrUrl' ? 'payment_qr' : 'event_media'
      );
      if (res.data.success) {
        setForm((current) => ({ ...current, [field]: res.data.url }));
        setMessage({ open: true, severity: "success", text: "อัปโหลดภาพสำเร็จ กรุณาบันทึกการตั้งค่า" });
      }
    } catch {
      setMessage({ open: true, severity: "error", text: "อัปโหลดไม่สำเร็จ โปรดลองใหม่" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={800}>ตั้งค่ากิจกรรม</Typography>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
          sx={{ borderRadius: 8, px: 3 }}
        >
          บันทึกการตั้งค่า
        </Button>
      </Stack>

      {message.open && (
        <Alert severity={message.severity} sx={{ mb: 3, borderRadius: 2 }}>{message.text}</Alert>
      )}

      <Paper sx={{ borderRadius: 3, overflow: 'hidden', mb: 4 }}>
        <Tabs
          value={tabIndex}
          onChange={(e, v) => setTabIndex(v)}
          variant="scrollable"
          sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#fff' }}
        >
          <Tab label="ข้อมูลพื้นฐาน" />
          <Tab label="แบรนดิ้ง & สีสัน" />
          <Tab label="เปิด/ปิดฟีเจอร์" />
        </Tabs>

        <Box sx={{ p: 4, bgcolor: '#fff' }}>
          {tabIndex === 0 && (
            <Stack spacing={3}>
              <Typography variant="h6" fontWeight={700}>ข้อมูลพื้นฐาน (Basic Info)</Typography>
              <TextField
                label="ชื่อกิจกรรม"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                fullWidth
              />
              <Stack direction="row" spacing={2}>
                <TextField
                  label="URL Slug (ภาษาอังกฤษ/ตัวเลข)"
                  value={form.slug}
                  onChange={e => setForm({...form, slug: e.target.value})}
                  fullWidth
                />
                <TextField
                  label="ปีที่จัดงาน (เช่น 2026)"
                  value={form.eventYear}
                  onChange={e => setForm({...form, eventYear: e.target.value})}
                  fullWidth
                />
              </Stack>
              <TextField
                label="อีเมลติดต่อ (Contact Email)"
                value={form.contactEmail}
                onChange={e => setForm({...form, contactEmail: e.target.value})}
                fullWidth
              />
              <TextField
                label="ข้อความต้อนรับ (Welcome Message)"
                value={form.welcomeMessage}
                onChange={e => setForm({...form, welcomeMessage: e.target.value})}
                fullWidth
                multiline
                rows={3}
              />
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" fontWeight={700}>การรับชำระเงิน / บริจาค (Payment Info)</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="ชื่อบัญชี (Account Name)"
                  value={form.bankAccountName}
                  onChange={e => setForm({...form, bankAccountName: e.target.value})}
                  fullWidth
                />
                <TextField
                  label="เลขบัญชี (Account Number)"
                  value={form.bankAccountNumber}
                  onChange={e => setForm({...form, bankAccountNumber: e.target.value})}
                  fullWidth
                />
                <TextField
                  label="ธนาคาร (Bank Name)"
                  value={form.bankName}
                  onChange={e => setForm({...form, bankName: e.target.value})}
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <TextField
                  label="URL ภาพ QR Code รับเงิน"
                  value={form.paymentQrUrl}
                  slotProps={{ input: { readOnly: true } }}
                  fullWidth
                />
                <Button variant="outlined" component="label" startIcon={<CloudUploadIcon />} sx={{ height: 56, minWidth: 140 }} disabled={saving}>
                  อัปโหลดรูป
                  <input type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => handleFileUpload(e, 'paymentQrUrl')} />
                </Button>
                {form.paymentQrUrl && <Tooltip title="นำรูปออก"><IconButton aria-label="นำรูป QR ออก" onClick={() => setForm((current) => ({ ...current, paymentQrUrl: '' }))}><DeleteOutlineIcon /></IconButton></Tooltip>}
              </Stack>
              <MediaPreview src={form.paymentQrUrl} alt="QR รับเงินของกิจกรรม" aspectRatio="1 / 1" maxWidth={260} />
            </Stack>
          )}

          {tabIndex === 1 && (
            <Stack spacing={3}>
              <Typography variant="h6" fontWeight={700}>แบรนดิ้ง (Branding)</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <TextField
                  label="โลโก้กิจกรรม"
                  value={form.logoUrl}
                  slotProps={{ input: { readOnly: true } }}
                  fullWidth
                />
                <Button variant="outlined" component="label" startIcon={<CloudUploadIcon />} sx={{ height: 56, minWidth: 140 }} disabled={saving}>
                  อัปโหลดรูป
                  <input type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => handleFileUpload(e, 'logoUrl')} />
                </Button>
                {form.logoUrl && <Tooltip title="นำรูปออก"><IconButton aria-label="นำโลโก้ออก" onClick={() => setForm((current) => ({ ...current, logoUrl: '' }))}><DeleteOutlineIcon /></IconButton></Tooltip>}
              </Stack>
              <MediaPreview src={form.logoUrl} alt="โลโก้กิจกรรม" aspectRatio="1 / 1" maxWidth={220} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <TextField
                  label="ภาพปก (Cover Image / Certificate Background)"
                  value={form.coverImageUrl}
                  slotProps={{ input: { readOnly: true } }}
                  fullWidth
                />
                <Button variant="outlined" component="label" startIcon={<CloudUploadIcon />} sx={{ height: 56, minWidth: 140 }} disabled={saving}>
                  อัปโหลดรูป
                  <input type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => handleFileUpload(e, 'coverImageUrl')} />
                </Button>
                {form.coverImageUrl && <Tooltip title="นำรูปออก"><IconButton aria-label="นำภาพปกออก" onClick={() => setForm((current) => ({ ...current, coverImageUrl: '' }))}><DeleteOutlineIcon /></IconButton></Tooltip>}
              </Stack>
              <MediaPreview src={form.coverImageUrl} alt="ภาพปกกิจกรรม" />

              <Typography variant="subtitle1" fontWeight={700} mt={2}>สีธีมหลัก (Theme Colors)</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Primary Color"
                  type="color"
                  value={form.primaryColor}
                  onChange={e => setForm({...form, primaryColor: e.target.value})}
                  fullWidth
                />
                <TextField
                  label="Secondary Color"
                  type="color"
                  value={form.secondaryColor}
                  onChange={e => setForm({...form, secondaryColor: e.target.value})}
                  fullWidth
                />
                <TextField
                  label="Accent Color"
                  type="color"
                  value={form.accentColor}
                  onChange={e => setForm({...form, accentColor: e.target.value})}
                  fullWidth
                />
              </Stack>
            </Stack>
          )}

          {tabIndex === 2 && (
            <Stack spacing={3}>
              <Typography variant="h6" fontWeight={700}>การเข้าถึงและสถานะระบบ</Typography>
              <Stack direction="row" spacing={3}>
                <FormControlLabel
                  control={<Switch checked={form.enableRegister} onChange={e => setForm({...form, enableRegister: e.target.checked})} color="success" />}
                  label="เปิดรับลงทะเบียน (Registration Open)"
                />
                <FormControlLabel
                  control={<Switch checked={form.maintenanceMode} onChange={e => setForm({...form, maintenanceMode: e.target.checked})} color="error" />}
                  label="โหมดปิดปรับปรุง (Maintenance Mode)"
                />
              </Stack>

              <Divider />

              <Typography variant="h6" fontWeight={700}>ฟีเจอร์ที่ใช้งาน (Enabled Features)</Typography>
              <Stack spacing={2}>
                {featureOptions.map(opt => (
                  <Box key={opt.key} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: 2 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={form.enabledFeatures[opt.key] !== false} // Default to true if undefined
                          onChange={e => setForm({
                            ...form,
                            enabledFeatures: { ...form.enabledFeatures, [opt.key]: e.target.checked }
                          })}
                        />
                      }
                      label={<Typography fontWeight={700}>{opt.label}</Typography>}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                      {opt.description}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Stack>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
