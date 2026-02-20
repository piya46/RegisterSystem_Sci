import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, MenuItem, Stack, Typography, Box, Select, FormControl, InputLabel, Paper, Slide, TextField
} from '@mui/material';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { generateSelfRegisterLink } from '../utils/api';

const Transition = React.forwardRef(function Transition(props, ref) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export default function AdminGenerateLinkDialog({ open, onClose, targetAdmin, pointsList = [] }) {
    const [pointId, setPointId] = useState('');
    const [validFrom, setValidFrom] = useState('');
    const [validUntil, setValidUntil] = useState('');
    const [generatedLink, setGeneratedLink] = useState('');
    const [loading, setLoading] = useState(false);
    
    // สร้าง Ref สำหรับอ้างอิงถึง Component ที่ต้องการเซฟเป็นรูป
    const qrCardRef = useRef(null);

    useEffect(() => {
        if (open) {
            setPointId('');
            setGeneratedLink('');
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
        
        const fromDate = new Date(validFrom);
        const untilDate = new Date(validUntil);

        if (fromDate >= untilDate) {
            return alert('เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด');
        }

        setLoading(true);
        try {
            const payload = {
                pointId,
                validFrom: fromDate.toISOString(),
                validUntil: untilDate.toISOString(),
                forStaffId: targetAdmin._id || targetAdmin.id
            };

            const res = await generateSelfRegisterLink(payload);
            const link = `${window.location.origin}/self-register/${res.data.token}`;
            setGeneratedLink(link);
        } catch (err) {
            alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการสร้างลิงก์');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedLink);
        alert('คัดลอกลิงก์สำเร็จ นำไปส่งให้สตาฟได้เลย');
    };

    // ฟังก์ชันสำหรับแปลง Component เป็นรูปภาพและดาวน์โหลด
    const handleDownloadImage = async () => {
        if (!qrCardRef.current) return;
        try {
            // scale: 2 ช่วยให้รูปที่เซฟออกมามีความคมชัดขึ้น (High Resolution)
            const canvas = await html2canvas(qrCardRef.current, { scale: 2, backgroundColor: '#ffffff' });
            const dataUrl = canvas.toDataURL('image/png');
            
            // สร้างลิงก์ชั่วคราวเพื่อทริกเกอร์การดาวน์โหลด
            const link = document.createElement('a');
            link.download = `QR_Staff_${targetAdmin?.username || 'Link'}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error("Failed to download image", err);
            alert("เกิดข้อผิดพลาดในการเซฟรูปภาพ");
        }
    };

    // ฟังก์ชันจัดฟอร์แมตวันที่ให้อ่านง่ายสำหรับแสดงบนรูป
    const formatDisplayDate = (isoString) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleString('th-TH', { 
            dateStyle: 'medium', 
            timeStyle: 'short' 
        }); // ตัวอย่างผลลัพธ์: 20 ก.พ. 2026 18:53
    };

    return (
        <Dialog open={open} onClose={onClose} TransitionComponent={Transition} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4, bgcolor: '#FFFBE6' } }}>
            <DialogTitle sx={{ fontWeight: 800, color: '#3E2723', borderBottom: '1px solid rgba(0,0,0,0.05)', pb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <QrCode2Icon color="primary" /> สร้าง QR ของสตาฟ (Self-Register)
            </DialogTitle>

            <DialogContent sx={{ mt: 3 }}>
                {!generatedLink ? (
                    <>
                        <Typography variant="body2" color="text.secondary" mb={3} sx={{ bgcolor: '#FFFDE7', p: 1.5, borderRadius: 2, borderLeft: '4px solid #FFC107' }}>
                            ลิงก์ที่สร้างขึ้นจะถูกระบุว่า <Typography component="span" fontWeight={800} color="primary.dark">{targetAdmin?.fullName || targetAdmin?.username}</Typography> เป็นผู้รับการลงทะเบียน
                        </Typography>

                        <Stack spacing={3}>
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
                    </>
                ) : (
                    <Box display="flex" flexDirection="column" alignItems="center" gap={3}>
                        {/* การ์ดส่วนนี้คือสิ่งที่จะถูกแคปเจอร์ไปเป็นรูปภาพ */}
                        <Paper 
                            ref={qrCardRef} 
                            elevation={3} 
                            sx={{ 
                                p: 4, 
                                borderRadius: 4, 
                                bgcolor: '#fff', 
                                display: 'flex', 
                                flexDirection: 'column',
                                alignItems: 'center',
                                border: '3px solid #FFC107',
                                width: '100%',
                                maxWidth: 340
                            }}
                        >
                            <Typography variant="h5" fontWeight={900} color="#3E2723" gutterBottom textAlign="center">
                                {targetAdmin?.fullName || targetAdmin?.username}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" mb={2} fontWeight={600}>
                                Staff Kiosk Registration
                            </Typography>
                            
                            <Box sx={{ p: 2, bgcolor: '#FFFBE6', borderRadius: 3, mb: 3 }}>
                                <QRCodeSVG value={generatedLink} size={200} level="M" includeMargin={false} />
                            </Box>
                            
                            <Box sx={{ width: '100%', bgcolor: '#f5f5f5', p: 2, borderRadius: 2, textAlign: 'center' }}>
                                <Typography variant="caption" fontWeight={700} color="text.secondary" display="block">
                                    ใช้งานได้ตั้งแต่:
                                </Typography>
                                <Typography variant="body2" color="primary.dark" fontWeight={700} mb={1}>
                                    {formatDisplayDate(validFrom)}
                                </Typography>
                                
                                <Typography variant="caption" fontWeight={700} color="text.secondary" display="block">
                                    หมดอายุ:
                                </Typography>
                                <Typography variant="body2" color="error.main" fontWeight={700}>
                                    {formatDisplayDate(validUntil)}
                                </Typography>
                            </Box>
                        </Paper>

                        <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ wordBreak: 'break-all', px: 2, bgcolor: 'rgba(0,0,0,0.03)', py: 1, borderRadius: 2 }}>
                            {generatedLink}
                        </Typography>

                        {/* กลุ่มปุ่ม Action */}
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} width="100%" justifyContent="center">
                            <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleCopy} sx={{ borderRadius: 50, px: 3, fontWeight: 700, borderColor: '#8D6E63', color: '#8D6E63' }}>
                                ก๊อปปี้ลิงก์
                            </Button>
                            <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleDownloadImage} sx={{ borderRadius: 50, px: 3, fontWeight: 700, bgcolor: '#FFC107', color: '#000', '&:hover': { bgcolor: '#FFA000' } }}>
                                ดาวน์โหลดรูป QR
                            </Button>
                        </Stack>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2, pt: 0 }}>
                <Button onClick={onClose} sx={{ color: '#8D6E63', fontWeight: 600 }}>ปิด</Button>
                {!generatedLink && (
                    <Button variant="contained" onClick={handleGenerate} disabled={loading || !pointId} sx={{ borderRadius: 50, px: 3, fontWeight: 700, bgcolor: '#FF9800', '&:hover': { bgcolor: '#F57C00' } }}>
                        {loading ? 'กำลังสร้าง...' : 'สร้างลิงก์ / QR Code'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}