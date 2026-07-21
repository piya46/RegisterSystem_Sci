import { useState, useEffect, useCallback } from 'react';
import * as z from 'zod';
import { getPublicCurrentEvent, getPublicEvent, listParticipantFields, listPackages } from '../utils/api';

// Create dynamic Zod schema based on API fields
const generateSchema = (fields, wantToDonate, wantPackage, requireAddress, pickupOptions) => {
  const schemaShape = {};

  // Map API fields to Zod
  fields.forEach((f) => {
    if (!f.enabled) return;

    let fieldSchema = z.string();

    if (f.required) {
      if (f.name === 'email') {
        fieldSchema = fieldSchema.email({ message: 'อีเมลไม่ถูกต้อง' }).min(1, { message: `กรุณากรอก ${f.label}` });
      } else {
        fieldSchema = fieldSchema.min(1, { message: `กรุณากรอก ${f.label}` });
      }
    } else {
      fieldSchema = fieldSchema.optional().or(z.literal(''));
    }

    // specific field logic
    if (f.name === 'date_year') {
      fieldSchema = fieldSchema.refine((val) => {
        if (!val) return !f.required;
        const yearInt = parseInt(val, 10);
        return yearInt >= 2400 && yearInt < 2565;
      }, { message: 'กรุณากรอกปี พ.ศ. ให้ถูกต้อง (นิสิตปัจจุบันไม่สามารถลงทะเบียนได้)' });
    }

    // address logic overrides
    if (['usr_add', 'usr_add_post'].includes(f.name)) {
       if (requireAddress) {
         fieldSchema = z.string().min(1, { message: 'กรุณากรอกที่อยู่และรหัสไปรษณีย์สำหรับการจัดส่ง' });
       } else {
         fieldSchema = z.string().optional().or(z.literal(''));
       }
    }

    schemaShape[f.name] = fieldSchema;
  });

  // Additional explicit fields
  schemaShape.membershipOption = z.string().min(1, { message: 'กรุณาเลือกสถานะสมาชิก' });

  if (wantToDonate) {
    schemaShape.donationAmount = z.string().min(1, { message: 'กรุณาระบุจำนวนเงิน' });
    schemaShape.packageType = z.string().min(1, { message: 'กรุณาเลือกรูปแบบการสนับสนุน' });

    if (wantPackage) {
      schemaShape.packageSize = z.string().min(1, { message: 'กรุณาเลือกขนาด' });
      if (pickupOptions?.pickup || pickupOptions?.delivery) {
         schemaShape.pickupMethod = z.string().min(1, { message: 'กรุณาเลือกวิธีการรับ' });
      }
    }
  }

  return z.object(schemaShape);
};

export default function useRegistrationForm(eventSlug, mode) {
  const [loading, setLoading] = useState(true);
  const [eventInfo, setEventInfo] = useState(null);
  const [fields, setFields] = useState([]);
  const [availablePackages, setAvailablePackages] = useState([]);
  const [systemStatus, setSystemStatus] = useState({ isOpen: true, message: "" });
  const [pickupOptions, setPickupOptions] = useState({ pickup: true, delivery: true });

  // Custom non-rhf states
  const [availableSizes, setAvailableSizes] = useState([]);
  const [reuseState, setReuseState] = useState({ email: "", otp: "", challengeId: "", ref: "", loading: false, message: "", sourceEventYear: "" });

  const loadInitData = useCallback(async () => {
    try {
      setLoading(true);
      const eventRes = eventSlug
        ? await getPublicEvent(eventSlug)
        : await getPublicCurrentEvent();
      const event = eventRes.data?.data || null;
      if (!event?.slug) throw new Error('Public event identity is unavailable');
      setEventInfo(event);
      const set = event.config || null;
      if (mode !== "landing" && !["registration_open", "active"].includes(event.status)) {
        setSystemStatus({ isOpen: false, message: "กิจกรรมนี้ยังไม่เปิดรับลงทะเบียน" });
      }

      if (set) {
        const now = new Date();
        const start = set.preRegStartDate ? new Date(set.preRegStartDate) : null;
        const end = set.preRegEndDate ? new Date(set.preRegEndDate) : null;

        if (set.maintenanceMode) setSystemStatus({ isOpen: false, message: "ระบบกำลังปิดปรับปรุงชั่วคราว" });
        else if (!set.enableRegister) setSystemStatus({ isOpen: false, message: "ระบบปิดรับลงทะเบียนชั่วคราว" });
        else if (start && now < start) setSystemStatus({ isOpen: false, message: `ระบบจะเปิดให้ลงทะเบียนวันที่ ${start.toLocaleString('th-TH')}` });
        else if (end && now > end) setSystemStatus({ isOpen: false, message: "หมดเวลาลงทะเบียนล่วงหน้าแล้ว" });

        setPickupOptions({ pickup: set.enablePickup !== false, delivery: set.enableDelivery !== false });
      }

      const effectiveEventSlug = event.slug;
      const resFields = await listParticipantFields({ eventSlug: effectiveEventSlug });
      setFields(resFields.data || []);

      if (set?.enabledFeatures?.packages === true) {
        const resPkgs = await listPackages({ eventSlug: effectiveEventSlug });
        setAvailablePackages(resPkgs.data?.data || []);
      }
    } catch {
      setSystemStatus({ isOpen: false, message: "ไม่พบกิจกรรม หรือกิจกรรมยังไม่เปิดให้ใช้งาน" });
    } finally {
      setLoading(false);
    }
  }, [eventSlug, mode]);

  useEffect(() => {
    loadInitData();
  }, [loadInitData]);

  const canUseDonations = eventInfo?.config?.enabledFeatures?.donations === true;
  const canUsePackages = canUseDonations && eventInfo?.config?.enabledFeatures?.packages === true;
  const canReuseRegistration = Boolean(eventInfo?.slug && eventInfo?.config?.allowRegistrationReuse === true);

  return {
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
    reuseState,
    setReuseState,
    generateSchema
  };
}
