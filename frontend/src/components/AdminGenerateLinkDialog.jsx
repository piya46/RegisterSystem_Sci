// frontend/src/components/AdminGenerateLinkDialog.jsx
import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, MenuItem, Stack, Typography, Box, Select, FormControl, InputLabel, Paper, Slide, TextField, Chip, Divider
} from '@mui/material';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import PrintIcon from '@mui/icons-material/Print';
import { QRCodeSVG } from 'qrcode.react';
import { generateSelfRegisterLink } from '../utils/api';

const Transition = React.forwardRef(function Transition(props, ref) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export default function AdminGenerateLinkDialog({ open, onClose, targetAdmins = [], pointsList = [] }) {
    const [pointId, setPointId] = useState('');
    const [validFrom, setValidFrom] = useState('');
    const [validUntil, setValidUntil] = useState('');
    
    // สถานะสำหรับเก็บผลลัพธ์การสร้างลิงก์ (Array of objects)
    const [generatedResults, setGeneratedResults] = useState([]);
    const [loading, setLoading] = useState(false);

    // 🌟 State สำหรับการตั้งค่าความกว้าง-สูงของบัตรเวลา Print (หน่วยเป็น เซนติเมตร cm)
    const [cardWidth, setCardWidth] = useState(6.5);
    const [cardHeight, setCardHeight] = useState(9);

    useEffect(() => {
        if (open) {
            setPointId('');
            setGeneratedResults([]);
            setLoading(false);

            const now = new Date();
            const tzOffset = now.getTimezoneOffset() * 60000;
            const localNow = new Date(now.getTime() - tzOffset);
            const localTomorrow = new Date(localNow.getTime() + 24 * 60 * 60 * 1000);

            setValidFrom(localNow.toISOString().slice(0, 16));
            setValidUntil(localTomorrow.toISOString().slice(0, 16));
        }
    }, [open]);

    const handleGenerate = async () => {
        if (!pointId) return alert('กรุณาเลือกจุดลงทะเบียน');
        if (!validFrom || !validUntil) return alert('กรุณาระบุวัน-เวลาให้ครบถ้วน');
        if (targetAdmins.length === 0) return alert('ไม่พบรายชื่อผู้รับ');
        
        const fromDate = new Date(validFrom);
        const untilDate = new Date(validUntil);

        if (fromDate >= untilDate) {
            return alert('เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด');
        }

        setLoading(true);
        const results = [];

        // ลูปสร้างลิงก์ทีละคน
        for (const admin of targetAdmins) {
            try {
                const payload = {
                    pointId,
                    validFrom: fromDate.toISOString(),
                    validUntil: untilDate.toISOString(),
                    forStaffId: admin._id || admin.id
                };
                const res = await generateSelfRegisterLink(payload);
                results.push({
                    admin,
                    link: `${window.location.origin}/self-register/${res.data.token}`
                });
            } catch (err) {
                console.error(`สร้างลิงก์ให้ ${admin.username} ล้มเหลว`, err);
            }
        }
        
        setGeneratedResults(results);
        setLoading(false);
    };

    const handlePrint = () => {
        window.print();
    };

    const formatDisplayDate = (isoString) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }); 
    };

    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            TransitionComponent={Transition} 
            maxWidth="md" // 🌟 ขยายเป็นขนาด md ให้มีพื้นที่แสดง Preview
            fullWidth 
            PaperProps={{ sx: { borderRadius: 4, bgcolor: '#FFFBE6' } }}
        >
            {/* 🌟 เพิ่ม Style สำหรับระบบ Print ลงใน Head ของเอกสารชั่วคราว */}
            <style type="text/css" media="print">
                {`
                    @page { size: A4 landscape; margin: 10mm; }
                    body * { visibility: hidden !important; }
                    
                    /* แสดงเฉพาะส่วนที่เป็น ID printable-qr-grid เท่านั้น */
                    #printable-qr-grid, #printable-qr-grid * { visibility: visible !important; }
                    
                    /* ดึง Grid ออกมาวางเป็น Layout หลักตอนปริ้น */
                    #printable-qr-grid {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                        justify-content: flex-start;
                        align-content: flex-start;
                        margin: 0;
                        padding: 0;
                    }

                    /* Override Material UI Dialog css ที่ชอบทำให้ปริ้นขาดตอน */
                    .MuiDialog-root { position: absolute !important; z-index: 9999 !important; }
                    .MuiDialog-container { display: block !important; height: auto !important; overflow: visible !important; }
                    .MuiPaper-root { box-shadow: none !important; background: transparent !important; margin: 0 !important; max-width: 100% !important; overflow: visible !important; }
                `}
            </style>

            <DialogTitle sx={{ fontWeight: 800, color: '#3E2723', borderBottom: '1px solid rgba(0,0,0,0.05)', pb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <QrCode2Icon color="primary" /> {generatedResults.length > 0 ? 'ผลลัพธ์ และ การพิมพ์ (Print Preview)' : `ตั้งค่าการสร้าง QR ของสตาฟ (${targetAdmins.length} คน)`}
            </DialogTitle>

            <DialogContent sx={{ mt: 3, pb: 4 }}>
                {generatedResults.length === 0 ? (
                    /* ----- 1. หน้าจอรับค่าก่อนสร้าง ----- */
                    <Stack spacing={3}>
                        <Box sx={{ bgcolor: '#FFFDE7', p: 2, borderRadius: 3, borderLeft: '4px solid #FFC107' }}>
                            <Typography variant="body2" color="text.secondary" fontWeight={700} mb={1}>
                                รายชื่อสตาฟที่จะถูกสร้าง QR Code:
                            </Typography>
                            <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
                                {targetAdmins.map(admin => (
                                    <Chip key={admin._id} label={admin.fullName || admin.username} size="small" sx={{ bgcolor: '#fff', fontWeight: 600, border: '1px solid #ccc' }} />
                                ))}
                            </Stack>
                        </Box>

                        <FormControl fullWidth>
                            <InputLabel id="point-select-label">เลือกจุดลงทะเบียนที่จะให้สตาฟรับผิดชอบ</InputLabel>
                            <Select 
                                labelId="point-select-label"
                                value={pointId} 
                                label="เลือกจุดลงทะเบียนที่จะให้สตาฟรับผิดชอบ" 
                                onChange={e => setPointId(e.target.value)} 
                                sx={{ bgcolor: '#fff', borderRadius: 2 }}
                            >
                                {pointsList.map(p => (
                                    <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <TextField
                                label="วันที่สามารถเริ่มใช้ลิงก์"
                                type="datetime-local"
                                fullWidth
                                value={validFrom}
                                onChange={e => setValidFrom(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={{ bgcolor: '#fff', borderRadius: 2 }}
                            />
                            <TextField
                                label="วันที่ลิงก์หมดอายุ"
                                type="datetime-local"
                                fullWidth
                                value={validUntil}
                                onChange={e => setValidUntil(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={{ bgcolor: '#fff', borderRadius: 2 }}
                            />
                        </Stack>
                    </Stack>
                ) : (
                    /* ----- 2. หน้าจอผลลัพธ์สำหรับ Print Preview ----- */
                    <Box>
                        {/* เครื่องมือปรับขนาดบัตร */}
                        <Paper sx={{ p: 2, mb: 3, bgcolor: '#fff', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                            <Typography variant="body2" fontWeight={800} color="text.secondary">ตั้งค่าขนาดบัตรตอนพิมพ์:</Typography>
                            <TextField 
                                label="ความกว้าง (ซม.)" 
                                type="number" 
                                inputProps={{ step: 0.5, min: 3, max: 20 }} 
                                value={cardWidth} 
                                onChange={e => setCardWidth(e.target.value)} 
                                size="small" 
                                sx={{ width: 130 }} 
                            />
                            <Typography variant="body2">X</Typography>
                            <TextField 
                                label="ความสูง (ซม.)" 
                                type="number" 
                                inputProps={{ step: 0.5, min: 3, max: 25 }} 
                                value={cardHeight} 
                                onChange={e => setCardHeight(e.target.value)} 
                                size="small" 
                                sx={{ width: 130 }} 
                            />
                            <Typography variant="caption" color="text.secondary">*ระบบจะจัดเรียงลงกระดาษ A4 (แนวนอน) ให้อัตโนมัติเมื่อกดปริ้น</Typography>
                        </Paper>
                        
                        <Divider sx={{ mb: 3 }} />

                        {/* พื้นที่ที่จะถูกปริ้น (Printable Area) */}
                        <Box id="printable-qr-grid" sx={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
                            {generatedResults.map((item, idx) => (
                                <Box 
                                    key={idx}
                                    sx={{
                                        width: `${cardWidth}cm`,
                                        height: `${cardHeight}cm`,
                                        border: '2px solid #FFC107',
                                        borderRadius: '12px',
                                        bgcolor: '#fff',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        p: 1.5,
                                        boxSizing: 'border-box',
                                        pageBreakInside: 'avoid', // ป้องกันการปริ้นขาดครึ่งบัตรข้ามหน้า
                                        boxShadow: '0 4px 10px rgba(0,0,0,0.05)'
                                    }}
                                >
                                    <Typography variant="body1" fontWeight={900} color="#3E2723" align="center" sx={{ fontSize: '0.9rem', lineHeight: 1.2, mb: 1, overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', whiteSpace: 'nowrap' }}>
                                        {item.admin.fullName || item.admin.username}
                                    </Typography>
                                    
                                    <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                                        <QRCodeSVG value={item.link} style={{ width: '100%', height: 'auto', maxHeight: '100%' }} level="M" />
                                    </Box>

                                    <Box textAlign="center" mt={1} width="100%">
                                        <Typography sx={{ fontSize: '10px', color: 'text.secondary', fontWeight: 600, lineHeight: 1.2 }}>
                                            Kiosk Staff ID: {item.admin.username}
                                        </Typography>
                                        <Typography sx={{ fontSize: '9px', color: '#d32f2f', fontWeight: 700, mt: 0.5 }}>
                                            หมดอายุ: {formatDisplayDate(validUntil)}
                                        </Typography>
                                    </Box>
                                </Box>
                            ))}
                        </Box>

                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2, pt: 0, justifyContent: 'space-between' }}>
                <Button onClick={onClose} sx={{ color: '#8D6E63', fontWeight: 600 }}>ปิดหน้าต่าง</Button>
                
                {generatedResults.length === 0 ? (
                    <Button variant="contained" onClick={handleGenerate} disabled={loading || !pointId} sx={{ borderRadius: 50, px: 4, fontWeight: 700, bgcolor: '#FF9800', '&:hover': { bgcolor: '#F57C00' } }}>
                        {loading ? 'กำลังสร้าง...' : 'สร้าง QR Code'}
                    </Button>
                ) : (
                    <Button variant="contained" startIcon={<PrintIcon />} onClick={handlePrint} sx={{ borderRadius: 50, px: 4, fontWeight: 800, bgcolor: '#2e7d32', color: '#fff', '&:hover': { bgcolor: '#1b5e20' } }}>
                        ปริ้น A4 (Print)
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}