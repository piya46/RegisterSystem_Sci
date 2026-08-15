import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Box, Typography, Container, Paper, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Stepper, Step, StepLabel, Snackbar, Alert, Stack } from '@mui/material';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import LandingBlocks from '../components/LandingBlocks';
import StepPersonalInfo from './PreRegistration/StepPersonalInfo';
import StepPackageSelection from './PreRegistration/StepPackageSelection';
import StepConfirmation from './PreRegistration/StepConfirmation';
import ResendTicketDialog from './PreRegistration/ResendTicketDialog';

import useRegistrationForm from '../hooks/useRegistrationForm';
import { createParticipant, createDonation, createIdempotencyKey, getTurnstileToken } from '../utils/api';

const steps = ['ข้อมูลส่วนตัว', 'การสนับสนุนแพ็กเกจ', 'ตรวจสอบและยืนยัน'];
const SAFE_DRAFT_FIELDS = [
  'wantToDonate',
  'wantPackage',
  'packageType',
  'packageSize',
  'pickupMethod',
  'membershipOption',
];

function safeDraftPreferences(value = {}) {
  return Object.fromEntries(
    SAFE_DRAFT_FIELDS
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]])
  );
}

export default function PreRegistrationPage({ mode = "register" }) {
  const { eventSlug } = useParams();
  const navigate = useNavigate();

  const {
    loading,
    eventInfo,
    fields,
    availablePackages,
    systemStatus,
    pickupOptions,
    availableSizes,
    setAvailableSizes,
    canUseDonations,
    canUsePackages,
    canReuseRegistration,
    generateSchema
  } = useRegistrationForm(eventSlug, mode);

  const [activeStep, setActiveStep] = useState(0);
  const [cfToken, setCfToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorDialog, setErrorDialog] = useState({ open: false, title: "", msg: "" });
  const [successData, setSuccessData] = useState(null);
  const [resendTicketOpen, setResendTicketOpen] = useState(false);

  const turnstileRef = useRef();
  const registrationRequestRef = useRef(null);
  const donationRequestRef = useRef(null);
  const canonicalEventSlug = eventInfo?.slug || eventSlug || '';
  const draftStorageKey = `regFormDraft:${canonicalEventSlug || 'current'}`;

  const getSavedData = () => {
    try {
      // Remove the legacy unscoped draft because it may contain PII from an older build.
      sessionStorage.removeItem('regFormDraft');
      const saved = sessionStorage.getItem(draftStorageKey);
      return saved ? safeDraftPreferences(JSON.parse(saved)) : {};
    } catch {
      return {};
    }
  };

  const methods = useForm({
    resolver: async (data, context, options) => {
      // Create schema dynamically based on current data state (wantToDonate, etc)
      const schema = generateSchema(fields, data.wantToDonate, data.wantPackage, (data.wantPackage && data.pickupMethod === 'DELIVERY') || data.membershipOption === 'existing' || data.membershipOption === 'new', pickupOptions);
      return zodResolver(schema)(data, context, options);
    },
    defaultValues: {
      wantToDonate: false,
      wantPackage: false,
      packageType: "",
      packageSize: "",
      pickupMethod: "",
      donationAmount: "",
      membershipOption: "",
      ...getSavedData()
    },
    mode: 'onTouched'
  });

  const { watch, trigger, handleSubmit, setValue } = methods;

  useEffect(() => {
    if (!canUseDonations) {
      setValue('wantToDonate', false);
      setValue('wantPackage', false);
      setValue('packageType', '');
      setValue('packageSize', '');
      setValue('pickupMethod', '');
      setValue('donationAmount', '');
      return;
    }
    if (!canUsePackages) {
      setValue('wantPackage', false);
      setValue('packageSize', '');
      setValue('pickupMethod', '');
    }
  }, [canUseDonations, canUsePackages, setValue]);

  useEffect(() => {
    if (!eventInfo?.slug || eventSlug) return;
    const canonicalKey = `regFormDraft:${eventInfo.slug}`;
    try {
      const saved = sessionStorage.getItem(canonicalKey) || sessionStorage.getItem('regFormDraft:current');
      if (saved) {
        const preferences = safeDraftPreferences(JSON.parse(saved));
        Object.entries(preferences).forEach(([key, value]) => setValue(key, value));
        sessionStorage.setItem(canonicalKey, JSON.stringify(preferences));
      }
      sessionStorage.removeItem('regFormDraft:current');
    } catch {
      sessionStorage.removeItem('regFormDraft:current');
    }
  }, [eventInfo?.slug, eventSlug, setValue]);

  useEffect(() => {
    const subscription = watch((value) => {
      sessionStorage.setItem(draftStorageKey, JSON.stringify(safeDraftPreferences(value)));
    });
    return () => subscription.unsubscribe();
  }, [draftStorageKey, watch]);

  const handleNext = async () => {
    let isValid = false;
    if (activeStep === 0) {
       // Validate personal info fields
       const personalFields = fields.map(f => f.name);
       isValid = await trigger(personalFields);
    } else if (activeStep === 1) {
       // Validate donation fields
       isValid = await trigger(['wantToDonate', 'wantPackage', 'packageType', 'packageSize', 'pickupMethod', 'donationAmount']);
    }

    if (isValid) {
      setActiveStep((prev) => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
    window.scrollTo(0, 0);
  };

  const handleVerify = useCallback((token) => { setCfToken(token); }, []);
  const handleError = useCallback(() => { setCfToken(""); }, []);

  const onSubmit = async (data) => {
    // If not on final step, just next
    if (activeStep !== steps.length - 1) {
      handleNext();
      return;
    }

    // Check turnstile
    if (!cfToken) {
       setErrorDialog({ open: true, title: "ยืนยันความปลอดภัย", msg: "กรุณารอระบบตรวจสอบความปลอดภัย (Turnstile) สักครู่ หรือรีเฟรชหน้าเว็บ" });
       return;
    }

    setIsSubmitting(true);
    try {
      const requireAddress = (data.wantPackage && data.pickupMethod === 'DELIVERY') || data.membershipOption === 'existing' || data.membershipOption === 'new';
      const finalConsent = (data.membershipOption === 'existing' || data.membershipOption === 'new') ? 'agreed' : 'disagreed';
      const finalForm = { ...data };
      if (!requireAddress) { finalForm['usr_add'] = "-"; finalForm['usr_add_post'] = "-"; }

      // Clean up rhf fields from final form
      delete finalForm.wantToDonate;
      delete finalForm.wantPackage;
      delete finalForm.packageType;
      delete finalForm.packageSize;
      delete finalForm.pickupMethod;
      delete finalForm.donationAmount;
      delete finalForm.membershipOption;

      const payload = {
        ...finalForm,
        followers: 0,
        cfToken,
        consent: finalConsent,
        specialAssistance: "", // Extracted for simplicity in this demo, add back if needed
        isPackage: data.wantPackage,
        eventSlug: eventSlug || eventInfo?.slug,
        eventYear: eventInfo?.eventYear,
      };

      if (!registrationRequestRef.current) {
        registrationRequestRef.current = { key: createIdempotencyKey() };
      }
      const participant = await createParticipant(payload, registrationRequestRef.current.key);

      let donationWarning = '';
      if (data.wantToDonate && data.donationAmount && parseFloat(data.donationAmount) > 0) {
        try {
            const fullName = data.name || data.fullName || "- -";
            const nameParts = fullName.trim().split(" ");
            const firstName = nameParts[0] || "-";
            const lastName = nameParts.slice(1).join(" ") || "-";
            if (!donationRequestRef.current) {
              donationRequestRef.current = {
                key: createIdempotencyKey(),
                transferDateTime: new Date().toISOString(),
              };
            }
            const transferDateTime = donationRequestRef.current.transferDateTime;
            const addressText = `${data.usr_add || ''} ${data.usr_add_post || ''}`.trim();

            const donationCfToken = await getTurnstileToken('donation_create');
            await createDonation({
              userId: null, firstName, lastName, amount: parseFloat(data.donationAmount), transferDateTime,
              source: "PRE_REGISTER", isPackage: data.wantPackage, packageType: data.packageType,
              size: data.wantPackage ? data.packageSize : "", pickupMethod: data.pickupMethod, address: addressText,
              slipUrl: data.slipUrl,
              cfToken: donationCfToken,
              eventSlug: eventSlug || eventInfo?.slug,
              eventYear: eventInfo?.eventYear,
            }, donationRequestRef.current.key);
          } catch (e) {
            console.warn("Donation creation failed", {
              status: e.response?.status || 0,
              code: e.response?.data?.code || 'DONATION_CREATE_FAILED',
            });
            donationWarning = e.response?.data?.message
              || 'ลงทะเบียนสำเร็จ แต่ยังบันทึกรายการสนับสนุนไม่สำเร็จ กรุณาติดต่อเจ้าหน้าที่';
          }
      }

      // Clear session storage on success
      sessionStorage.removeItem(draftStorageKey);
      setSuccessData({ ...participant.data, donationWarning });
    } catch (err) {
      console.warn('Participant registration failed', {
        status: err.response?.status || 0,
        code: err.response?.data?.code || 'PARTICIPANT_REGISTRATION_FAILED',
      });
      setErrorDialog({
        open: true,
        title: "เกิดข้อผิดพลาด",
        msg: err.response?.data?.message || err.response?.data?.error || "ไม่สามารถลงทะเบียนได้",
      });
      setCfToken(""); // Reset CF token
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: '#f5f5f5' }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 3 }}>กำลังโหลดข้อมูล...</Typography>
      </Box>
    );
  }

  if (mode === "landing") {
    return <LandingBlocks event={eventInfo} blocks={eventInfo?.layouts?.landingPage?.config?.blocks} />;
  }

  if (!systemStatus.isOpen) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ bgcolor: 'primary.main', color: '#fff', py: 2 }}>
          <Container maxWidth="md">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h5" fontWeight="bold">ลงทะเบียนเข้าร่วมกิจกรรม</Typography>
              {canonicalEventSlug && (
                <Button color="inherit" variant="outlined" size="small" onClick={() => setResendTicketOpen(true)}>
                  ขอรับ E-Ticket อีกครั้ง
                </Button>
              )}
            </Box>
          </Container>
        </Box>

        <Container maxWidth="md" sx={{ mt: 4, flexGrow: 1, display: 'flex', flexDirection: 'column', pb: 4 }}>
          <Paper elevation={3} sx={{ p: { xs: 4, md: 6 }, borderRadius: 4, textAlign: 'center' }}>
            <Typography variant="h5" color="error" fontWeight="bold" gutterBottom>{systemStatus.message}</Typography>
            <Typography variant="body1" color="text.secondary" mb={4}>
              ขณะนี้ระบบยังไม่เปิดรับลงทะเบียน หรือถูกระงับชั่วคราว กรุณาตรวจสอบอีกครั้งในภายหลัง
            </Typography>
            <Button variant="contained" size="large" sx={{ borderRadius: 8, px: 4 }} onClick={() => navigate("/")}>
              กลับหน้าหลัก
            </Button>
          </Paper>
        </Container>
        <ResendTicketDialog
          open={resendTicketOpen}
          onClose={() => setResendTicketOpen(false)}
          eventSlug={canonicalEventSlug}
          eventYear={eventInfo?.eventYear || "current"}
        />
      </Box>
    );
  }

  if (successData) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: '#f7f9fb', p: 3 }}>
        <Paper elevation={3} sx={{ p: { xs: 3, md: 5 }, borderRadius: 3, textAlign: 'center', maxWidth: 600 }}>
          <Typography variant="h4" color="success.main" fontWeight="bold" gutterBottom>ลงทะเบียนสำเร็จ!</Typography>
          <Typography variant="body1" mb={3}>รหัสอ้างอิงของคุณคือ: <b>{successData.code || successData.data?.code}</b></Typography>
          <Alert severity="success" sx={{ mb: 3 }}>
            โปรดบันทึกภาพหน้าจอนี้ หรือใช้ QR Code ที่ส่งไปยังอีเมลของท่าน เพื่อใช้แสดงที่จุดลงทะเบียนหน้างาน
          </Alert>
          {successData.donationWarning && (
            <Alert severity="warning" sx={{ mb: 3 }}>{successData.donationWarning}</Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
            <Button variant="contained" color="secondary" size="large" onClick={() => navigate('/wallet')}>
              เปิดกระเป๋าเงิน (E-Wallet)
            </Button>
            <Button variant="outlined" size="large" onClick={() => window.location.reload()}>
              ลงทะเบียนเพิ่ม
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  }

  const requireAddress = (watch('wantPackage') && watch('pickupMethod') === 'DELIVERY') || watch('membershipOption') === 'existing' || watch('membershipOption') === 'new';

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f7f9fb", pb: 10, overflowX: 'hidden' }}>
      {/* Cover / Header */}
      <Box sx={{
        bgcolor: eventInfo?.branding?.primaryColor || '#114b5f',
        color: '#fff',
        pt: { xs: 4, sm: 6 }, pb: { xs: 10, sm: 12 }, px: 1,
        textAlign: 'center',
        backgroundImage: eventInfo?.branding?.coverImageUrl ? `linear-gradient(rgba(17, 75, 95, 0.9), rgba(17, 75, 95, 0.9)), url(${eventInfo.branding.coverImageUrl})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}>
        <Container maxWidth="lg">
          <Typography
            component="h1"
            fontWeight={900}
            sx={{ fontSize: { xs: '2rem', sm: '3rem' }, lineHeight: 1.2, overflowWrap: 'anywhere' }}
          >
            {eventInfo?.name || "ลงทะเบียนล่วงหน้า"}
          </Typography>
          {eventInfo?.eventYear && <Typography variant="h6" sx={{ mt: 1, opacity: 0.9 }}>กิจกรรมประจำปี {eventInfo.eventYear}</Typography>}
        </Container>
      </Box>

      {/* Main Form Container */}
      <Container maxWidth="md" sx={{ mt: -8, position: 'relative', zIndex: 10, px: { xs: 2, sm: 3 } }}>
        <Paper elevation={3} sx={{ p: { xs: 2, md: 4 }, borderRadius: 1 }}>
          <Stepper
            activeStep={activeStep}
            alternativeLabel
            sx={{
              mb: 4,
              '& .MuiStepLabel-label': {
                fontSize: { xs: '0.72rem', sm: '0.875rem' },
                lineHeight: 1.25,
                whiteSpace: 'normal',
              },
            }}
          >
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onSubmit)}>

              {activeStep === 0 && (
                <StepPersonalInfo
                  fields={fields}
                  requireAddress={requireAddress}
                  canReuseRegistration={canReuseRegistration}
                  eventSlug={canonicalEventSlug}
                />
              )}

              {activeStep === 1 && (
                <StepPackageSelection
                  canUseDonations={canUseDonations}
                  canUsePackages={canUsePackages}
                  availablePackages={availablePackages}
                  pickupOptions={{ pickup: eventInfo?.config?.enablePickup, delivery: eventInfo?.config?.enableDelivery }}
                  availableSizes={availableSizes}
                  setAvailableSizes={setAvailableSizes}
                  eventConfig={eventInfo?.config || {}}
                  eventSlug={canonicalEventSlug}
                />
              )}

              {activeStep === 2 && (
                <StepConfirmation
                  fields={fields}
                  turnstileRef={turnstileRef}
                  handleVerify={handleVerify}
                  handleError={handleError}
                />
              )}

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4, pt: 2, borderTop: '1px solid #eee' }}>
                <Button
                  disabled={activeStep === 0 || isSubmitting}
                  onClick={handleBack}
                  variant="outlined"
                  size="large"
                >
                  ย้อนกลับ
                </Button>

                {activeStep === steps.length - 1 ? (
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    size="large"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'ยืนยันการลงทะเบียน'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="contained"
                    color="primary"
                    size="large"
                    onClick={handleNext}
                  >
                    ถัดไป
                  </Button>
                )}
              </Box>
            </form>
          </FormProvider>
        </Paper>
      </Container>

      {/* Error Dialog */}
      <Dialog open={errorDialog.open} onClose={() => setErrorDialog({ ...errorDialog, open: false })}>
        <DialogTitle>{errorDialog.title}</DialogTitle>
        <DialogContent><Typography>{errorDialog.msg}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setErrorDialog({ ...errorDialog, open: false })}>ปิด</Button>
        </DialogActions>
      </Dialog>
      <ResendTicketDialog
        open={resendTicketOpen}
        onClose={() => setResendTicketOpen(false)}
        eventSlug={canonicalEventSlug}
        eventYear={eventInfo?.eventYear || "current"}
      />
    </Box>
  );
}
