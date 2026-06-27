import React, { useEffect, useMemo, useState } from 'react';
import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { getEventYears } from '../utils/api';

export default function EventYearSelect({
  value,
  onChange,
  allowAll = false,
  label = 'ปีงาน',
  size = 'small',
  sx,
}) {
  const [eventYears, setEventYears] = useState([]);
  const [currentEventYear, setCurrentEventYear] = useState('');

  useEffect(() => {
    let active = true;
    getEventYears()
      .then((res) => {
        if (!active) return;
        setEventYears(Array.isArray(res.data?.data) ? res.data.data : []);
        setCurrentEventYear(res.data?.currentEventYear || '');
      })
      .catch(() => {
        if (active) setEventYears([]);
      });
    return () => { active = false; };
  }, []);

  const options = useMemo(() => {
    const years = new Set(eventYears.map((item) => String(item.year || item)));
    if (currentEventYear) years.add(String(currentEventYear));
    return Array.from(years).filter(Boolean).sort((a, b) => Number(b) - Number(a));
  }, [currentEventYear, eventYears]);

  const selectedValue = value || currentEventYear || '';

  return (
    <FormControl size={size} sx={{ minWidth: 150, ...sx }}>
      <InputLabel>{label}</InputLabel>
      <Select
        value={selectedValue}
        label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        {!selectedValue && <MenuItem value="">กำลังโหลดปีงาน...</MenuItem>}
        {allowAll && <MenuItem value="all">ทุกปี</MenuItem>}
        {options.map((year) => (
          <MenuItem key={year} value={year}>
            {year}{year === String(currentEventYear) ? ' (ปัจจุบัน)' : ''}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
