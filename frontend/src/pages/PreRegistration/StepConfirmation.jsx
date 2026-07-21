import React from 'react';
import { Box, Typography, Paper, Grid, Divider, FormControl, InputLabel, Select, MenuItem, FormHelperText, Alert } from '@mui/material';
import { useFormContext, Controller } from 'react-hook-form';
import Turnstile from '../../components/Turnstile';

export default function StepConfirmation({ fields, turnstileRef, handleVerify, handleError }) {
  const { getValues, control, formState: { errors } } = useFormContext();
  const values = getValues();
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const localSiteKey = isLocalhost ? '1x00000000000000000000AA' : undefined;

  const getLabel = (name) => {
    const f = fields.find(x => x.name === name);
    return f ? f.label : name;
  };

  const personalFields = ['name', 'nickname', 'dept', 'date_year', 'phone', 'email'];
  const addressFields = ['usr_add', 'usr_add_post'];
  const otherFields = fields.filter(f => !personalFields.includes(f.name) && !addressFields.includes(f.name)).map(f => f.name);

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h6" fontWeight="bold" color="primary.main" gutterBottom>ตรวจสอบข้อมูลก่อนยืนยัน</Typography>

      <Paper variant="outlined" sx={{ p: 3, mb: 4, borderRadius: 2, bgcolor: '#fcfcfc' }}>
        <Typography fontWeight="bold" gutterBottom>ข้อมูลส่วนตัวและการติดต่อ</Typography>
        <Grid container spacing={2}>
          {personalFields.map(key => values[key] ? (
            <Grid item xs={12} sm={6} key={key}>
              <Typography variant="body2" color="text.secondary">{getLabel(key)}</Typography>
              <Typography fontWeight="medium">{values[key]}</Typography>
            </Grid>
          ) : null)}
        </Grid>

        {values.usr_add && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography fontWeight="bold" gutterBottom>ที่อยู่</Typography>
            <Typography>{values.usr_add} {values.usr_add_post}</Typography>
          </>
        )}

        {otherFields.some(key => values[key]) && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography fontWeight="bold" gutterBottom>ข้อมูลอื่นๆ</Typography>
            <Grid container spacing={2}>
              {otherFields.map(key => values[key] ? (
                <Grid item xs={12} sm={6} key={key}>
                  <Typography variant="body2" color="text.secondary">{getLabel(key)}</Typography>
                  <Typography fontWeight="medium">{values[key]}</Typography>
                </Grid>
              ) : null)}
            </Grid>
          </>
        )}
      </Paper>

      {values.wantToDonate && (
        <Paper variant="outlined" sx={{ p: 3, mb: 4, borderRadius: 2, bgcolor: '#fff8e1', borderColor: '#ffe082' }}>
          <Typography fontWeight="bold" color="#f57f17" gutterBottom>ข้อมูลการสนับสนุน</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">รูปแบบ</Typography>
              <Typography fontWeight="medium">{values.wantPackage ? `รับของที่ระลึก (${values.packageType})` : 'บริจาคทั่วไป'}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">จำนวนเงิน</Typography>
              <Typography fontWeight="bold" color="primary.main">{Number(values.donationAmount).toLocaleString()} บาท</Typography>
            </Grid>
            {values.wantPackage && values.packageSize && (
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">ไซส์เสื้อ</Typography>
                <Typography fontWeight="medium">{values.packageSize}</Typography>
              </Grid>
            )}
            {values.wantPackage && values.pickupMethod && (
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">การรับสินค้า</Typography>
                <Typography fontWeight="medium">{values.pickupMethod === 'PICKUP' ? 'รับด้วยตนเองหน้างาน' : 'จัดส่งทางไปรษณีย์'}</Typography>
              </Grid>
            )}
          </Grid>
        </Paper>
      )}

      <Box sx={{ mb: 4, p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
        <Typography fontWeight="bold" mb={2}>สถานะสมาชิกสมาคมฯ *</Typography>
        <Controller
          name="membershipOption"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth error={!!errors.membershipOption} sx={{ bgcolor: '#fff' }}>
              <InputLabel>สถานะสมาชิก *</InputLabel>
              <Select {...field} label="สถานะสมาชิก *">
                <MenuItem value=""><em>-- เลือกระบุ --</em></MenuItem>
                <MenuItem value="existing">เป็นสมาชิกสมาคมฯ อยู่แล้ว (ตลอดชีพ / รายปี)</MenuItem>
                <MenuItem value="new">ต้องการสมัครสมาชิกสมาคมฯ ใหม่</MenuItem>
                <MenuItem value="none">ไม่เป็นสมาชิก และไม่ต้องการสมัคร</MenuItem>
              </Select>
              {errors.membershipOption && <FormHelperText>{errors.membershipOption.message}</FormHelperText>}
            </FormControl>
          )}
        />
        {(values.membershipOption === 'existing' || values.membershipOption === 'new') && (
          <Alert severity="info" sx={{ mt: 2 }}>
            หากท่านเลือกเป็นสมาชิก ท่านยินยอมให้สมาคมฯ ติดต่อ หรือส่งจดหมายข่าวสาร รวมถึงของที่ระลึกตามที่อยู่ที่ระบุไว้ (หากที่อยู่ไม่ครบถ้วน กรุณาย้อนกลับไปแก้ไข)
          </Alert>
        )}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <Turnstile
          ref={turnstileRef}
          siteKey={localSiteKey}
          action="register"
          onVerify={handleVerify}
          onError={handleError}
        />
      </Box>
    </Box>
  );
}
