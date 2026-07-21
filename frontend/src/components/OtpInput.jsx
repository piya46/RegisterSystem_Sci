import React, { useRef } from 'react';
import { Box } from '@mui/material';

export default function OtpInput({ length = 8, value, onChange }) {
  const otpInputs = useRef([]);

  const handleOtpChange = (index, val) => {
    if (isNaN(val)) return; // รับเฉพาะตัวเลข
    const newOtp = value.split('');
    while (newOtp.length < length) newOtp.push('');

    newOtp[index] = val;
    const finalStr = newOtp.join('').substring(0, length);
    onChange(finalStr);

    // Auto Focus Next
    if (val !== "" && index < length - 1) {
        otpInputs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    // Backspace: ถ้าย้อนกลับแล้วช่องปัจจุบันว่าง ให้ไปลบช่องก่อนหน้า
    if (e.key === "Backspace") {
        if (!value[index] && index > 0) {
            otpInputs.current[index - 1]?.focus();
        }
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const data = e.clipboardData.getData("text").replace(/[^0-9]/g, "").substring(0, length);
    onChange(data);
    // Focus ช่องสุดท้ายที่กรอก
    const focusIndex = Math.min(data.length, length - 1);
    otpInputs.current[focusIndex]?.focus();
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', gap: { xs: 0.5, sm: 1 }, mb: 1 }} onPaste={handleOtpPaste}>
      {[...Array(length)].map((_, index) => (
        <React.Fragment key={index}>
          <input
            ref={el => otpInputs.current[index] = el}
            type="tel"
            maxLength={1}
            value={value[index] || ""}
            onChange={(e) => handleOtpChange(index, e.target.value)}
            onKeyDown={(e) => handleOtpKeyDown(index, e)}
            style={{
              width: '40px', height: '48px',
              fontSize: '20px', fontWeight: 'bold', textAlign: 'center',
              borderRadius: '8px',
              border: '1.5px solid #e0e0e0',
              backgroundColor: '#fafafa',
              outline: 'none',
              color: '#333',
              transition: 'all 0.2s'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#fbc02d';
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 4px 8px rgba(251, 192, 45, 0.2)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#e0e0e0';
              e.target.style.transform = 'none';
              e.target.style.boxShadow = 'none';
            }}
          />
          {/* ขีดคั่นกลางระหว่างเลข 4 กับ 5 (ถ้า length = 8) */}
          {length === 8 && index === 3 && (
            <Box component="span" sx={{ display: 'flex', alignItems: 'center', color: '#bdbdbd', fontWeight: 'bold' }}>-</Box>
          )}
        </React.Fragment>
      ))}
    </Box>
  );
}
