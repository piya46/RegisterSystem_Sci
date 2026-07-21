import React, { useState } from 'react';
import { Box, Typography, TextField, Grid, FormControl, InputLabel, Select, MenuItem, FormHelperText, Alert, Button } from '@mui/material';
import { Controller, useFormContext } from 'react-hook-form';
import ReuseRegistrationDialog from './ReuseRegistrationDialog';

export default function StepPersonalInfo({ fields, requireAddress, canReuseRegistration, eventSlug }) {
  const { control, formState: { errors }, setValue } = useFormContext();
  const [reuseDialogOpen, setReuseDialogOpen] = useState(false);

  const handleReuseSuccess = (data) => {
    // Prefill form with returned data
    if (data.fields) {
      Object.keys(data.fields).forEach(key => {
        setValue(key, data.fields[key]);
      });
    }
    if (data.followers !== undefined) setValue('followers', data.followers);
    if (data.specialAssistance) setValue('specialAssistance', data.specialAssistance);
  };

  const fieldGroups = React.useMemo(() => {
    const all = (fields || []).filter(f => f?.enabled !== false).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    const processed = all.map(f => ({
      ...f,
      _options: f.type === "select" ? (Array.isArray(f.options) ? f.options.map(o => {
        if (typeof o === "string") return { label: o, value: o };
        if (o && typeof o === "object") return { label: o.label ?? String(o.value ?? ""), value: o.value ?? o.label ?? "" };
        return { label: String(o), value: String(o) };
      }) : []) : []
    }));

    const personalOrder = ['name', 'nickname', 'dept', 'date_year'];
    const personal = processed.filter(f => personalOrder.includes(f.name)).sort((a, b) => personalOrder.indexOf(a.name) - personalOrder.indexOf(b.name));
    const contact = processed.filter(f => ['phone', 'email'].includes(f.name));
    const address = processed.filter(f => ['usr_add', 'usr_add_post'].includes(f.name));
    const specifiedKeys = [...personalOrder, 'phone', 'email', 'usr_add', 'usr_add_post'];
    const others = processed.filter(f => !specifiedKeys.includes(f.name));
    return { personal, contact, address, others };
  }, [fields]);

  const renderField = (f) => (
    <Grid item xs={12} sm={f.name === 'date_year' || f.name === 'nickname' || f.name === 'usr_add_post' ? 6 : 12} key={f.name}>
      <Controller
        name={f.name}
        control={control}
        render={({ field }) => {
          if (f.type === "select") {
            return (
              <FormControl fullWidth error={!!errors[f.name]} sx={{ bgcolor: "#fff", borderRadius: 1 }}>
                <InputLabel>{f.label}{f.required && " *"}</InputLabel>
                <Select {...field} label={`${f.label}${f.required ? " *" : ""}`}>
                  <MenuItem value=""><em>-- เลือก --</em></MenuItem>
                  {f._options.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </Select>
                {errors[f.name] && <FormHelperText>{errors[f.name]?.message}</FormHelperText>}
              </FormControl>
            );
          }
          return (
            <TextField
              {...field}
              label={f.label}
              required={f.required}
              fullWidth
              multiline={f.type === 'textarea'}
              rows={f.type === 'textarea' ? 3 : 1}
              error={!!errors[f.name]}
              helperText={errors[f.name]?.message || (f.name === 'date_year' ? "นิสิตปัจจุบันรหัส 65 เป็นต้นไป ไม่สามารถลงทะเบียนได้" : "")}
              inputProps={{ maxLength: f.name === 'date_year' ? 4 : undefined }}
              sx={{ bgcolor: "#fff", borderRadius: 1 }}
            />
          );
        }}
      />
    </Grid>
  );

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight="bold" color="primary.main">ข้อมูลส่วนตัว</Typography>
        {canReuseRegistration && (
          <Button variant="outlined" size="small" onClick={() => setReuseDialogOpen(true)}>
            ดึงข้อมูลเดิม (มีประวัติแล้ว)
          </Button>
        )}
      </Box>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {fieldGroups.personal.map(renderField)}
      </Grid>

      <Typography variant="h6" fontWeight="bold" color="primary.main" gutterBottom>ข้อมูลการติดต่อ</Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {fieldGroups.contact.map(renderField)}
      </Grid>

      {requireAddress && (
        <>
          <Typography variant="h6" fontWeight="bold" color="primary.main" gutterBottom>ที่อยู่จัดส่ง</Typography>
          <Alert severity="info" sx={{ mb: 2 }}>ที่อยู่นี้จะถูกใช้สำหรับจัดส่งสินค้า หรือใช้เป็นฐานข้อมูลสมาคมฯ</Alert>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            {fieldGroups.address.map(renderField)}
          </Grid>
        </>
      )}

      {fieldGroups.others.length > 0 && (
        <>
          <Typography variant="h6" fontWeight="bold" color="primary.main" gutterBottom>ข้อมูลเพิ่มเติม</Typography>
          <Grid container spacing={2}>
            {fieldGroups.others.map(renderField)}
          </Grid>
        </>
      )}

      {canReuseRegistration && (
        <ReuseRegistrationDialog
          open={reuseDialogOpen}
          onClose={() => setReuseDialogOpen(false)}
          onReuseSuccess={handleReuseSuccess}
          eventSlug={eventSlug}
        />
      )}
    </Box>
  );
}
