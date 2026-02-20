import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, MenuItem, Stack, Typography, Box, Select, FormControl, InputLabel, Paper, Slide
} from '@mui/material';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { QRCodeSVG } from 'qrcode.react';
import { generateSelfRegisterLink } from '../utils/api';

const Transition = React.forwardRef(function Transition(props, ref) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export default function AdminGenerateLinkDialog({ open, onClose, targetAdmin, pointsList = [] }) {
    const [pointId, setPointId] = useState('');
    const [durationHours, setDurationHours] = useState(1);
    const [generatedLink, setGeneratedLink] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            setPointId('');
            setDurationHours(1);
            setGeneratedLink('');
            setLoading(false);
        }
    }, [open]);

    const handleGenerate = async () => {
        if (!pointId) return alert('กรุณาเลือกจุดลงทะเบียน');

        setLoading(true);
        try {
            const validFrom = new Date();
            const validUntil = new Date(validFrom.getTime() + durationHours * 60 * 60 * 1000);

            const payload = {
                pointId,
                validFrom: validFrom.toISOString(),
                validUntil: validUntil.toISOString(),
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

    return (
        <Dialog open={open} onClose={onClose} TransitionComponent={Transition} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4, bgcolor: '#FFFBE6' } }}>
            <DialogTitle sx={{ fontWeight: 800, color: '#3E2723', borderBottom: '1px solid rgba(0,0,0,0.05)', pb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <QrCode2Icon color="primary" /> สร้าง QR ของสตาฟ (Self-Register)
            </DialogTitle>

            <DialogContent sx={{ mt: 3 }}>
                <Typography variant="body2" color="text.secondary" mb={3} sx={{ bgcolor: '#FFFDE7', p: 1.5, borderRadius: 2, borderLeft: '4px solid #FFC107' }}>
                    ลิงก์ที่สร้างขึ้นจะถูกระบุว่า <Typography component="span" fontWeight={800} color="primary.dark">{targetAdmin?.fullName || targetAdmin?.username}</Typography> เป็นผู้รับการลงทะเบียน
                </Typography>

                {!generatedLink ? (
                    <Stack spacing={3}>
                        <FormControl fullWidth>
                            <InputLabel>เลือกจุดลงทะเบียนที่จะให้สตาฟรับผิดชอบ</InputLabel>
                            <Select value={pointId} label="เลือกจุดลงทะเบียนที่จะให้สตาฟรับผิดชอบ" onChange={e => setPointId(e.target.value)} sx={{ bgcolor: '#fff', borderRadius: 2 }}>
                                {pointsList.map(p => (
                                    <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth>
                            <InputLabel>เลือกระยะเวลาหมดอายุ</InputLabel>
                            <Select value={durationHours} label="เลือกระยะเวลาหมดอายุ" onChange={e => setDurationHours(e.target.value)} sx={{ bgcolor: '#fff', borderRadius: 2 }}>
                                <MenuItem value={1}>1 ชั่วโมง</MenuItem>
                                <MenuItem value={2}>2 ชั่วโมง</MenuItem>
                                <MenuItem value={4}>4 ชั่วโมง</MenuItem>
                                <MenuItem value={8}>8 ชั่วโมง (เต็มวัน)</MenuItem>
                                <MenuItem value={24}>24 ชั่วโมง</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                ) : (
                    <Box display="flex" flexDirection="column" alignItems="center" gap={3}>
                        <Paper elevation={4} sx={{ p: 3, borderRadius: 4, bgcolor: '#fff', display: 'flex', justifyContent: 'center' }}>
                            <QRCodeSVG value={generatedLink} size={220} level="M" includeMargin={false} />
                        </Paper>
                        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ wordBreak: 'break-all', px: 2, bgcolor: 'rgba(0,0,0,0.03)', py: 1, borderRadius: 2 }}>
                            {generatedLink}
                        </Typography>
                        <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={handleCopy} sx={{ borderRadius: 50, px: 4, py: 1.2, fontWeight: 700, bgcolor: '#FFC107', color: '#000', '&:hover': { bgcolor: '#FFA000' } }}>
                            คัดลอกลิงก์ให้สตาฟ
                        </Button>
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
