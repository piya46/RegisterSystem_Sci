// frontend/src/pages/PublicLuckyDrawPage.jsx
import React, { useCallback, useState, useEffect } from 'react';
import { Box, Typography, Paper, Stack } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CampaignIcon from '@mui/icons-material/Campaign';
import { getPublicPrizes } from '../utils/api';

const THEME = {
    bg: "radial-gradient(circle at 50% 50%, #FFFDE7 0%, #FFC107 100%)",
    text: "#3E2723",
    accent: "#FF6F00",
    cardBg: "rgba(255, 255, 255, 0.85)"
};

export default function PublicLuckyDrawPage() {
    const [prizes, setPrizes] = useState([]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const eventYear = new URLSearchParams(window.location.search).get('eventYear') || '';

    useEffect(() => {
        const clock = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(clock);
    }, []);

    const fetchPrizes = useCallback(async () => {
        try {
            const res = await getPublicPrizes(eventYear ? { eventYear } : undefined);
            setPrizes(res.data);
        } catch (err) {
            console.error("Auto-refresh error:", err);
        }
    }, [eventYear]);

    useEffect(() => {
        fetchPrizes();
        const refreshInterval = setInterval(fetchPrizes, 5000); // 🌟 Refresh ทุก 5 วินาที
        return () => clearInterval(refreshInterval);
    }, [fetchPrizes]);

    const recentWinners = prizes
        .flatMap(p => p.winners.map(w => ({
            prizeName: p.name,
            winnerName: w.participantName || w.participantId?.fields?.name || 'ไม่ทราบชื่อ',
            department: w.department || w.participantId?.fields?.department || w.participantId?.fields?.dept || '',
            wonAt: new Date(w.wonAt)
        })))
        .sort((a, b) => b.wonAt - a.wonAt)
        .slice(0, 10); // แสดง 10 อันดับล่าสุด

    const latestWinner = recentWinners.length > 0 ? recentWinners[0] : null;

    return (
        <Box sx={{ minHeight: '100vh', background: THEME.bg, color: THEME.text, p: { xs: 2, md: 4, lg: 6 }, fontFamily: 'Prompt, sans-serif' }}>

            {/* Header */}
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" mb={6} spacing={2}>
                <Typography variant="h3" fontWeight={900} color={THEME.accent} display="flex" alignItems="center" gap={1} sx={{ textShadow: '0 2px 4px rgba(255,255,255,0.8)' }}>
                    <EmojiEventsIcon fontSize="large" /> ประกาศผลรางวัล เสือเหลืองคืนถิ่น
                </Typography>
                <Paper elevation={4} sx={{ px: 3, py: 1.5, borderRadius: 50, bgcolor: 'rgba(255,255,255,0.9)', border: '2px solid #FFC107' }}>
                    <Typography variant="h5" fontWeight={800} color={THEME.text} display="flex" alignItems="center" gap={1}>
                        <AccessTimeIcon /> {currentTime.toLocaleTimeString('th-TH')}
                    </Typography>
                </Paper>
            </Stack>

            <Stack direction={{ xs: "column", lg: "row" }} spacing={4} sx={{ maxWidth: 1400, mx: 'auto' }}>

                {/* Main Focus: Latest Winner */}
                <Box flex={1} textAlign="center">
                    <Typography variant="h4" fontWeight={900} color={THEME.text} mb={2} sx={{ textShadow: '0 2px 5px rgba(255,255,255,0.8)' }}>
                        รางวัลล่าสุด
                    </Typography>

                    <Paper elevation={16} sx={{
                        p: { xs: 4, md: 8 }, borderRadius: 6,
                        background: 'rgba(255,255,255,0.9)',
                        border: `4px solid ${THEME.accent}`,
                        backdropFilter: 'blur(10px)'
                    }}>
                        {latestWinner ? (
                            <>
                                <Typography variant="h5" fontWeight={800} color="#FF9800" mb={2}>🎉 ขอแสดงความยินดีกับ 🎉</Typography>
                                <Typography variant="h1" fontWeight={900} sx={{ color: THEME.text, fontSize: { xs: '3rem', md: '5.5rem' }, lineHeight: 1.2, mb: 1 }}>
                                    {latestWinner.winnerName}
                                </Typography>
                                {latestWinner.department && (
                                    <Typography variant="h4" fontWeight={700} color="text.secondary" mb={3}>
                                        ภาควิชา: {latestWinner.department}
                                    </Typography>
                                )}
                                <Paper elevation={0} sx={{ display: 'inline-block', bgcolor: '#FFF8E1', px: 4, py: 1.5, borderRadius: 50, border: '2px dashed #FFCA28' }}>
                                    <Typography variant="h5" fontWeight={800} color={THEME.accent}>
                                        ได้รับรางวัล: {latestWinner.prizeName}
                                    </Typography>
                                </Paper>
                            </>
                        ) : (
                            <Typography variant="h4" color="text.secondary" py={10}>กำลังรอการประกาศผลรางวัล...</Typography>
                        )}
                    </Paper>
                </Box>

                {/* Sidebar: Recent Winners List */}
                <Paper elevation={12} sx={{
                    width: { xs: '100%', lg: 450 }, flexShrink: 0,
                    bgcolor: THEME.cardBg, backdropFilter: 'blur(10px)',
                    borderRadius: 6, border: '2px solid #FFCA28', overflow: 'hidden'
                }}>
                    <Box sx={{ bgcolor: '#FFB300', p: 2.5, textAlign: 'center' }}>
                        <Typography variant="h5" fontWeight={800} color={THEME.text} display="flex" alignItems="center" justifyContent="center" gap={1}>
                            <CampaignIcon fontSize="large" /> รายชื่อผู้โชคดีก่อนหน้า
                        </Typography>
                    </Box>
                    <Box sx={{ p: 3, maxHeight: '65vh', overflowY: 'auto' }}>
                        {recentWinners.length <= 1 ? (
                            <Typography color="text.secondary" textAlign="center" py={5} variant="h6">ยังไม่มีประวัติเพิ่มเติม</Typography>
                        ) : (
                            <Stack spacing={2}>
                                {recentWinners.slice(1).map((w, i) => (
                                    <Paper key={i} elevation={2} sx={{ p: 2.5, bgcolor: '#FFF', borderRadius: 3, borderLeft: `6px solid ${THEME.accent}` }}>
                                        <Typography variant="subtitle1" color={THEME.accent} fontWeight={800}>{w.prizeName}</Typography>
                                        <Typography variant="h6" fontWeight={900} color={THEME.text}>{w.winnerName}</Typography>
                                        <Typography variant="body2" color="text.secondary" fontWeight={500}>{w.wonAt.toLocaleTimeString('th-TH')}</Typography>
                                    </Paper>
                                ))}
                            </Stack>
                        )}
                    </Box>
                </Paper>

            </Stack>

        </Box>
    );
}
