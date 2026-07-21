import React, { useState } from 'react';
import { Box, Typography, Grid, Card, CardActionArea, CardContent, FormControl, InputLabel, Select, MenuItem, TextField, Alert, FormHelperText, Button, CircularProgress } from '@mui/material';
import { Controller, useFormContext } from 'react-hook-form';
import SizeChart from '../../components/SizeChart';
import StorefrontIcon from "@mui/icons-material/Storefront";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import axios from 'axios';
import { API_BASE_URL } from '../../utils/api';
import { getTurnstileToken } from '../../utils/turnstile';

export default function StepPackageSelection({ canUseDonations, canUsePackages, availablePackages, pickupOptions, availableSizes, setAvailableSizes, eventConfig, eventSlug }) {
  const { control, watch, setValue, formState: { errors } } = useFormContext();

  const wantToDonate = watch('wantToDonate');
  const wantPackage = watch('wantPackage');
  const packageType = watch('packageType');
  const donationAmount = watch('donationAmount');

  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleSlipUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingSlip(true);
    setUploadError("");
    try {
      const cfToken = await getTurnstileToken('public_slip_upload');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('eventSlug', eventSlug);
      const res = await axios.post(`${API_BASE_URL}/uploads/public`, formData, {
        headers: cfToken ? { 'X-CF-Token': cfToken } : {}
      });
      if (res.data.success) {
        setValue('slipUrl', res.data.url, { shouldValidate: true });
      }
    } catch {
      setUploadError("อัปโหลดไม่สำเร็จ กรุณาลองใหม่ (ไฟล์ภาพไม่เกิน 5MB)");
    } finally {
      setUploadingSlip(false);
    }
  };


  const handleDonationModeChange = (val) => {
    setValue('wantToDonate', true);
    if (val === 'general') {
      setValue('wantPackage', false);
      setValue('packageType', 'general');
      setValue('pickupMethod', '');
    } else {
      setValue('wantPackage', true);
      setValue('packageType', '');
      setValue('packageSize', '');
      setValue('donationAmount', '');
    }
  };

  const handlePackageSelect = (pkgName) => {
    setValue('packageType', pkgName);
    setValue('packageSize', '');
    const foundPkg = availablePackages.find(p => p.name === pkgName);
    if (foundPkg) {
      setValue('donationAmount', String(foundPkg.price));
      if (foundPkg.items && foundPkg.items[0]?.sizes) {
        setAvailableSizes(foundPkg.items[0].sizes);
      } else {
        setAvailableSizes([]);
      }
    }
  };

  if (!canUseDonations) {
    return (
      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">ไม่มีแพ็กเกจให้เลือกในขณะนี้</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h6" fontWeight="bold" color="primary.main" gutterBottom>รูปแบบการสนับสนุน</Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6}>
          <Card variant="outlined" sx={{ borderColor: (!wantPackage && wantToDonate) ? 'primary.main' : 'divider', borderWidth: (!wantPackage && wantToDonate) ? 2 : 1 }}>
            <CardActionArea onClick={() => handleDonationModeChange('general')} sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" fontWeight="bold">บริจาคทั่วไป (ไม่รับของที่ระลึก)</Typography>
              <Typography variant="body2" color="text.secondary">สนับสนุนกิจกรรมตามกำลังศรัทธา</Typography>
            </CardActionArea>
          </Card>
        </Grid>
        {canUsePackages && (
          <Grid item xs={12} sm={6}>
            <Card variant="outlined" sx={{ borderColor: wantPackage ? 'primary.main' : 'divider', borderWidth: wantPackage ? 2 : 1 }}>
              <CardActionArea onClick={() => handleDonationModeChange('package')} sx={{ p: 2, height: '100%' }}>
                <Typography variant="h6" fontWeight="bold">เลือกแพ็กเกจของที่ระลึก</Typography>
                <Typography variant="body2" color="text.secondary">รับเสื้อหรือของที่ระลึกจากกิจกรรม</Typography>
              </CardActionArea>
            </Card>
          </Grid>
        )}
      </Grid>

      {wantToDonate && !wantPackage && (
        <Box sx={{ mb: 4, p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
          <Typography fontWeight="bold" mb={2}>ระบุจำนวนเงินที่ต้องการบริจาค (บาท)</Typography>
          <Controller
            name="donationAmount"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                type="number"
                fullWidth
                placeholder="เช่น 500"
                error={!!errors.donationAmount}
                helperText={errors.donationAmount?.message}
                sx={{ bgcolor: '#fff' }}
              />
            )}
          />
        </Box>
      )}

      {wantToDonate && wantPackage && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>เลือกแพ็กเกจ</Typography>
          {errors.packageType && <Alert severity="error" sx={{ mb: 2 }}>{errors.packageType.message}</Alert>}
          <Grid container spacing={2}>
            {availablePackages.map((pkg) => (
              <Grid item xs={12} sm={6} md={4} key={pkg.name}>
                <Card
                  variant="outlined"
                  sx={{
                    cursor: 'pointer',
                    borderColor: packageType === pkg.name ? 'primary.main' : 'divider',
                    borderWidth: packageType === pkg.name ? 2 : 1,
                    height: '100%'
                  }}
                  onClick={() => handlePackageSelect(pkg.name)}
                >
                  {pkg.imageUrl && (
                    <Box sx={{ height: 140, backgroundImage: `url(${pkg.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  )}
                  <CardContent>
                    <Typography fontWeight="bold" gutterBottom>{pkg.name}</Typography>
                    {pkg.description && <Typography variant="body2" color="text.secondary" paragraph>{pkg.description}</Typography>}
                    <Typography variant="h6" color="primary.main">{pkg.price.toLocaleString()} บาท</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {packageType && availableSizes.length > 0 && (
            <Box sx={{ mt: 4, p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
              <Typography fontWeight="bold" mb={2}>เลือกไซส์เสื้อ</Typography>
              <Controller
                name="packageSize"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.packageSize} sx={{ bgcolor: '#fff' }}>
                    <InputLabel>ไซส์เสื้อ *</InputLabel>
                    <Select {...field} label="ไซส์เสื้อ *">
                      <MenuItem value=""><em>-- เลือกไซส์ --</em></MenuItem>
                      {availableSizes.map(s => <MenuItem key={s.name || s} value={s.name || s}>{s.name || s}</MenuItem>)}
                    </Select>
                    {errors.packageSize && <FormHelperText>{errors.packageSize.message}</FormHelperText>}
                  </FormControl>
                )}
              />
              <SizeChart />
            </Box>
          )}

          {packageType && (pickupOptions.pickup || pickupOptions.delivery) && (
            <Box sx={{ mt: 4, p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
              <Typography fontWeight="bold" mb={2}>วิธีการรับของที่ระลึก</Typography>
              <Grid container spacing={2}>
                {pickupOptions.pickup && (
                  <Grid item xs={12} sm={6}>
                    <Controller
                      name="pickupMethod"
                      control={control}
                      render={({ field }) => (
                        <Card variant="outlined" sx={{ borderColor: field.value === 'PICKUP' ? 'primary.main' : 'divider', borderWidth: field.value === 'PICKUP' ? 2 : 1 }}>
                          <CardActionArea onClick={() => field.onChange('PICKUP')} sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                            <StorefrontIcon color={field.value === 'PICKUP' ? 'primary' : 'action'} sx={{ mr: 2, fontSize: 40 }} />
                            <Box>
                              <Typography fontWeight="bold">รับด้วยตนเองที่หน้างาน</Typography>
                              <Typography variant="body2" color="text.secondary">ในวันจัดกิจกรรม</Typography>
                            </Box>
                          </CardActionArea>
                        </Card>
                      )}
                    />
                  </Grid>
                )}
                {pickupOptions.delivery && (
                  <Grid item xs={12} sm={6}>
                    <Controller
                      name="pickupMethod"
                      control={control}
                      render={({ field }) => (
                        <Card variant="outlined" sx={{ borderColor: field.value === 'DELIVERY' ? 'primary.main' : 'divider', borderWidth: field.value === 'DELIVERY' ? 2 : 1 }}>
                          <CardActionArea onClick={() => field.onChange('DELIVERY')} sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                            <LocalShippingIcon color={field.value === 'DELIVERY' ? 'primary' : 'action'} sx={{ mr: 2, fontSize: 40 }} />
                            <Box>
                              <Typography fontWeight="bold">จัดส่งทางไปรษณีย์</Typography>
                              <Typography variant="body2" color="text.secondary">มีค่าใช้จ่ายเพิ่มเติม (ถ้ามี)</Typography>
                            </Box>
                          </CardActionArea>
                        </Card>
                      )}
                    />
                  </Grid>
                )}
              </Grid>
              {errors.pickupMethod && <Alert severity="error" sx={{ mt: 2 }}>{errors.pickupMethod.message}</Alert>}
            </Box>
          )}
        </Box>
      )}

      {wantToDonate && donationAmount && Number(donationAmount) > 0 && (
        <Box sx={{ mt: 4, p: 3, bgcolor: '#e3f2fd', borderRadius: 2, border: '1px solid #90caf9' }}>
          <Typography variant="h6" fontWeight="bold" color="primary.main" mb={2}>ช่องทางการชำระเงิน</Typography>

          {(eventConfig?.bankAccountName || eventConfig?.paymentQrUrl) ? (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" fontWeight="bold">โอนเงินเข้าบัญชี:</Typography>
                {eventConfig?.bankAccountName && <Typography variant="body1">ชื่อบัญชี: {eventConfig.bankAccountName}</Typography>}
                {eventConfig?.bankAccountNumber && <Typography variant="body1" fontWeight="bold" color="primary.main">เลขที่บัญชี: {eventConfig.bankAccountNumber}</Typography>}
                {eventConfig?.bankName && <Typography variant="body1">ธนาคาร: {eventConfig.bankName}</Typography>}
                <Typography variant="body2" color="text.secondary" mt={2}>ยอดที่ต้องโอน: <b>{Number(donationAmount).toLocaleString()} บาท</b></Typography>
              </Grid>
              {eventConfig?.paymentQrUrl && (
                <Grid item xs={12} md={6} sx={{ textAlign: 'center' }}>
                  <img src={eventConfig.paymentQrUrl} alt="Payment QR" style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: 8, border: '2px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                </Grid>
              )}
            </Grid>
          ) : (
            <Typography variant="body2" color="text.secondary">ผู้จัดงานยังไม่ได้ระบุข้อมูลการรับเงินในระบบ</Typography>
          )}

          <Box sx={{ mt: 3, pt: 3, borderTop: '1px dashed #90caf9' }}>
            <Typography fontWeight="bold" mb={1}>แนบหลักฐานการโอนเงิน (สลิป)</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>รองรับไฟล์ภาพ JPG, PNG ขนาดไม่เกิน 5MB</Typography>
            <Controller
              name="slipUrl"
              control={control}
              render={({ field }) => (
                <Box>
                  <Button
                    variant="contained"
                    component="label"
                    startIcon={uploadingSlip ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
                    disabled={uploadingSlip}
                  >
                    อัปโหลดสลิป
                    <input type="file" hidden accept="image/*" onChange={handleSlipUpload} />
                  </Button>
                  {field.value && (
                    <Box sx={{ mt: 2 }}>
                      <Alert severity="success" sx={{ mb: 1 }}>อัปโหลดสลิปเรียบร้อยแล้ว</Alert>
                      <img src={field.value} alt="Slip" style={{ maxWidth: 200, borderRadius: 8 }} />
                    </Box>
                  )}
                  {uploadError && <Alert severity="error" sx={{ mt: 2 }}>{uploadError}</Alert>}
                  {errors.slipUrl && <Alert severity="error" sx={{ mt: 2 }}>กรุณาแนบสลิปโอนเงิน</Alert>}
                </Box>
              )}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
