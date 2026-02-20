// frontend/src/pages/LuckyDrawPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Button, Paper, Stack, FormControl, Select, MenuItem, Fade, Chip, CircularProgress } from '@mui/material'; // 🌟 เพิ่ม CircularProgress ตรงนี้
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CampaignIcon from '@mui/icons-material/Campaign';
import ReplayIcon from '@mui/icons-material/Replay';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import IosShareIcon from '@mui/icons-material/IosShare';
import { useNavigate } from 'react-router-dom';
import Confetti from 'react-confetti';
import { listPrizes, drawPrize, cancelPrizeWinner } from '../utils/api';

// 🌟 ธีมสีเหลืองเสือเหลืองคืนถิ่น (Yellow & Dark Brown)
const THEME = {
  bg: "radial-gradient(circle at 50% 50%, #FFFDE7 0%, #FFC107 100%)",
  text: "#3E2723", // สีน้ำตาลเข้ม
  accent: "#FF6F00", // สีส้มเข้ม
  cardBg: "rgba(255, 255, 255, 0.85)"
};

const DUMMY_NAMES = [
  "สมชาย รักเรียน", "วิภาวดี สีสด", "ณัฐพงศ์ ใจดี", "พรพิมล คนงาม",
  "กิตติศักดิ์ ยอดเยี่ยม", "ศิริพร อักษร", "เอกราช เก่งการ", "นภัสสร ดอนเมือง",
  "ธนวัฒน์ จัดให้", "จิราพร สอนดี", "พีรพล คนเก่ง", "สุนิสา น่ารัก"
];

export default function LuckyDrawPage() {
  const navigate = useNavigate();
  const [prizes, setPrizes] = useState([]);
  const [selectedPrize, setSelectedPrize] = useState('');

  // States สำหรับการสุ่ม
  const [isDrawing, setIsDrawing] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [winnerData, setWinnerData] = useState(null);
  const [currentDisplay, setCurrentDisplay] = useState("ลุ้นรางวัล");

  // States สำหรับเวลา
  const [currentTime, setCurrentTime] = useState(new Date());
  const [countdown, setCountdown] = useState(300); // 300 วินาที = 5 นาที
  const [timerActive, setTimerActive] = useState(false);

  const intervalRef = useRef(null);
  const timerRef = useRef(null);

  // นาฬิกาปัจจุบัน
  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  // 🌟 ฟังก์ชันโหลดข้อมูลของรางวัล
  const fetchPrizes = async () => {
    try {
      const res = await listPrizes();
      setPrizes(res.data);
    } catch (err) {
      console.error("Auto-refresh error:", err);
    }
  };

  // 🌟 ระบบ Auto-Refresh ข้อมูลทุกๆ 10 วินาที
  useEffect(() => {
    fetchPrizes();
    const refreshInterval = setInterval(() => {
      fetchPrizes();
    }, 10000);
    return () => clearInterval(refreshInterval);
  }, []);

  // ระบบนับถอยหลัง 5 นาที
  useEffect(() => {
    if (timerActive && countdown > 0) {
      timerRef.current = setInterval(() => setCountdown(prev => prev - 1), 1000);
    } else if (countdown === 0) {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timerActive, countdown]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const startDrawAnimation = (actualWinner) => {
    setIsDrawing(true);
    setShowWinner(false);
    setTimerActive(false);
    setCountdown(300);

    let ticks = 0;
    const maxTicks = 35;

    intervalRef.current = setInterval(() => {
      const randomName = DUMMY_NAMES[Math.floor(Math.random() * DUMMY_NAMES.length)];
      setCurrentDisplay(randomName);
      ticks++;
      if (ticks >= maxTicks) {
        clearInterval(intervalRef.current);
        setCurrentDisplay(actualWinner.name);
        setWinnerData(actualWinner);
        setIsDrawing(false);
        setShowWinner(true);
        setTimerActive(true);
        fetchPrizes();
      }
    }, 100);
  };

  const handleDraw = async () => {
    if (!selectedPrize) return alert("กรุณาเลือกของรางวัลที่จะแจกครับ");
    try {
      const res = await drawPrize(selectedPrize);
      startDrawAnimation(res.data.winner);
    } catch (err) {
      alert(err.response?.data?.error || "เกิดข้อผิดพลาด หรือรางวัลหมดแล้ว");
    }
  };

  // 🌟 ฟังก์ชันจัดการเมื่อคนมารับรางวัล (เคลียร์จออัตโนมัติ)
  const handleConfirmWinner = () => {
    setTimerActive(false);
    alert("ยืนยันการรับรางวัลเรียบร้อย!");

    setTimeout(() => {
      handleReset();
    }, 1000);
  };

  // 🌟 ฟังก์ชันจัดการเมื่อกดสละสิทธิ์
  const handleForfeit = async () => {
    if (!window.confirm("ยืนยันการสละสิทธิ์! ระบบจะดึงโควต้ารางวัลคืน")) return;

    setIsDrawing(true);
    try {
      // 🌟 ตรวจสอบให้แน่ใจว่ามีข้อมูลทั้งสองตัวก่อนส่ง
      if (winnerData && activePrizeObj) {
         // ในกรณีที่ api.js กำหนด cancelPrizeWinner(prizeId, participantId)
         // เราต้องแน่ใจว่าส่ง ID ไม่ใช่ Object ไป
         const winnerId = winnerData._id || winnerData.id; 
         await cancelPrizeWinner(activePrizeObj._id, winnerId);
      } else {
         throw new Error("ไม่พบข้อมูลผู้ได้รับรางวัล");
      }

      setShowWinner(false);
      setWinnerData(null);
      setTimerActive(false);
      setCurrentDisplay("สละสิทธิ์!");

      await fetchPrizes();
    } catch (err) {
      alert(err.response?.data?.error || err.message || "เกิดข้อผิดพลาดในการยกเลิกสิทธิ์");
    } finally {
      setIsDrawing(false);
    }
  };

  // 🌟 ฟังก์ชันรีเซ็ตหน้าจอเตรียมสุ่มใหม่
  const handleReset = () => {
    setShowWinner(false);
    setWinnerData(null);
    setTimerActive(false);
    setCurrentDisplay("พร้อมลุ้นรางวัล?");
    fetchPrizes();
  };

  // 🌟 ฟังก์ชันจัดการ Share หน้า Public
  const handleSharePublic = () => {
    const link = `${window.location.origin}/public/lucky-draw`;
    navigator.clipboard.writeText(link);
    alert('คัดลอกลิงก์ Live สำหรับหน้าจอแสดงผลสำเร็จ!');
  };

  const activePrizeObj = prizes.find(p => p._id === selectedPrize);
  const recentWinners = prizes.flatMap(p => p.winners.map(w => ({ prizeName: p.name, winnerName: w.participantId?.fields?.name || 'ไม่ทราบชื่อ', wonAt: new Date(w.wonAt) }))).sort((a, b) => b.wonAt - a.wonAt).slice(0, 5);

  return (
    <Box sx={{ minHeight: '100vh', background: THEME.bg, color: THEME.text, p: { xs: 2, md: 4 }, fontFamily: 'Prompt, sans-serif', position: 'relative', overflowX: 'hidden' }}>

      {showWinner && <Confetti width={window.innerWidth} height={window.innerHeight} recycle={countdown > 290} numberOfPieces={400} />}

      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
        <Button variant="contained" startIcon={<ArrowBackIcon />} onClick={() => navigate('/dashboard')} sx={{ borderRadius: 3, bgcolor: '#FFF', color: THEME.text, '&:hover': { bgcolor: '#FFECB3' } }}>
          Dashboard
        </Button>
        <Stack alignItems="flex-end">
          <Typography variant="h4" fontWeight={900} color={THEME.accent} display="flex" alignItems="center" gap={1} sx={{ textShadow: '0 2px 4px rgba(255,255,255,0.8)' }}>
            <EmojiEventsIcon fontSize="large" /> เสือเหลืองคืนถิ่นสุ่มผู้โชคดี
          </Typography>
          <Typography variant="h6" fontWeight={700} color={THEME.text} display="flex" alignItems="center" gap={1} mt={0.5}>
            <AccessTimeIcon /> เวลาปัจจุบัน: {currentTime.toLocaleTimeString('th-TH')}
          </Typography>
        </Stack>
        <Button variant="outlined" startIcon={<IosShareIcon />} onClick={handleSharePublic} sx={{ borderRadius: 3, bgcolor: '#FFF', color: THEME.accent, borderColor: THEME.accent, borderWidth: 2, '&:hover': { bgcolor: '#FFFDE7', borderWidth: 2 } }}>
          แชร์จอแสดงผล (Public)
        </Button>
      </Stack>

      {/* 🌟 หน้าต่างลอย (Floating Board) สำหรับคนรับล่าสุด */}
      <Paper elevation={16} sx={{
        position: { xs: 'static', lg: 'absolute' },
        top: { lg: 100 }, right: { lg: 32 },
        width: { xs: '100%', lg: 340 },
        bgcolor: THEME.cardBg, backdropFilter: 'blur(10px)',
        borderRadius: 4, border: '2px solid #FFCA28', overflow: 'hidden', zIndex: 50, mt: { xs: 4, lg: 0 }
      }}>
        <Box sx={{ bgcolor: '#FFB300', p: 1.5, textAlign: 'center' }}>
          <Typography variant="subtitle1" fontWeight={800} color={THEME.text} display="flex" alignItems="center" justifyContent="center" gap={1}>
            <CampaignIcon /> ผู้โชคดีล่าสุด
          </Typography>
        </Box>
        <Box sx={{ p: 2, maxHeight: 400, overflowY: 'auto' }}>
          {recentWinners.length === 0 ? (
            <Typography color="text.secondary" textAlign="center" py={3}>ยังไม่มีผู้ได้รับรางวัล</Typography>
          ) : (
            <Stack spacing={1.5}>
              {recentWinners.map((w, i) => (
                <Box key={i} sx={{ p: 1.5, bgcolor: '#FFF', borderRadius: 2, borderLeft: `4px solid ${THEME.accent}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <Typography variant="caption" color={THEME.accent} fontWeight={800}>{w.prizeName}</Typography>
                  <Typography variant="body1" fontWeight={800} color={THEME.text}>{w.winnerName}</Typography>
                  <Typography variant="caption" color="text.secondary">{w.wonAt.toLocaleTimeString('th-TH')}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Paper>

      {/* Center Stage (Main Draw Area) */}
      <Box sx={{ pr: { lg: '380px' }, position: 'relative', zIndex: 10, maxWidth: 1200, mx: 'auto', mt: { xs: 2, md: 6 } }}>

        {/* ตัวเลือกรางวัล */}
        <FormControl fullWidth sx={{ maxWidth: 500, mx: 'auto', mb: 4, display: 'block', textAlign: 'center' }}>
          <Select
            displayEmpty value={selectedPrize}
            onChange={(e) => { setSelectedPrize(e.target.value); handleReset(); }}
            disabled={isDrawing || (showWinner && timerActive)}
            sx={{ bgcolor: '#FFF', borderRadius: 3, fontSize: '1.2rem', fontWeight: 700, width: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
          >
            <MenuItem value="" disabled><em>-- กรุณาเลือกของรางวัลที่จะแจก --</em></MenuItem>
            {prizes.filter(p => p.remainingQuantity > 0 || p._id === selectedPrize).map(p => (
              <MenuItem key={p._id} value={p._id} sx={{ fontSize: '1.1rem' }}>
                🎁 {p.name} (เหลือ {p.remainingQuantity} รางวัล)
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* จอแสดงผล */}
        <Box textAlign="center">
          <Typography variant="h4" fontWeight={900} color={THEME.accent} mb={2} sx={{ textShadow: '0 2px 5px rgba(255,255,255,0.8)' }}>
            {activePrizeObj ? `รางวัล: ${activePrizeObj.name}` : 'กรุณาเลือกรางวัลเพื่อเริ่มต้น'}
          </Typography>

          <Paper elevation={12} sx={{
            maxWidth: 800, mx: 'auto', p: { xs: 4, md: 6 }, borderRadius: 6,
            background: showWinner ? '#FFF' : 'rgba(255,255,255,0.6)',
            border: showWinner ? `4px solid ${THEME.accent}` : `2px solid #FFF`,
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease', transform: showWinner ? 'scale(1.05)' : 'scale(1)'
          }}>
            {showWinner && <Typography variant="h5" fontWeight={800} color="#FF9800" mb={1}>🎉 ขอแสดงความยินดีกับ 🎉</Typography>}

            <Typography variant="h1" fontWeight={900} sx={{
              color: THEME.text,
              fontSize: { xs: '2.5rem', md: '4.5rem' }, lineHeight: 1.3, mb: showWinner ? 1 : 0
            }}>
              {currentDisplay}
            </Typography>

            {showWinner && winnerData?.department && (
              <Typography variant="h5" fontWeight={700} color="text.secondary">
                ภาควิชา: {winnerData.department}
              </Typography>
            )}
          </Paper>

          {/* ส่วนจับเวลาและปุ่มจัดการ */}
          <Box mt={6} minHeight={120}>
            {showWinner ? (
              <Fade in={showWinner}>
                <Box>
                  <Chip
                    icon={<AccessTimeIcon sx={{ color: countdown <= 60 ? '#fff !important' : '#3E2723 !important' }} />}
                    label={countdown > 0 ? `เวลารายงานตัว: ${formatTime(countdown)}` : "สละสิทธิ์"}
                    sx={{
                      fontSize: '1.5rem', py: 3, px: 3, mb: 4, fontWeight: 900,
                      bgcolor: countdown <= 60 ? '#D32F2F' : '#FFEB3B',
                      color: countdown <= 60 ? '#FFF' : '#3E2723',
                      border: '2px solid #FFF', boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                      animation: countdown <= 60 && countdown > 0 ? 'pulse 1s infinite' : 'none',
                      '@keyframes pulse': { '0%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.05)' }, '100%': { transform: 'scale(1)' } }
                    }}
                  />

                  <Stack direction="row" spacing={2} justifyContent="center">
                    <Button variant="contained" color="success" size="large" onClick={handleConfirmWinner} startIcon={<CheckCircleOutlineIcon />} sx={{ borderRadius: 50, px: 4, py: 1.5, fontSize: '1.2rem', fontWeight: 800 }}>
                      รับรางวัลแล้ว
                    </Button>
                    <Button variant="contained" color="error" size="large" onClick={handleForfeit} disabled={isDrawing} startIcon={isDrawing ? <CircularProgress size={20} color="inherit" /> : <ReplayIcon />} sx={{ borderRadius: 50, px: 4, py: 1.5, fontSize: '1.2rem', fontWeight: 800 }}>
                      สละสิทธิ์
                    </Button>
                  </Stack>
                </Box>
              </Fade>
            ) : (
              <Button
                variant="contained" disabled={!selectedPrize || isDrawing} onClick={handleDraw}
                sx={{
                  borderRadius: 50, px: 8, py: 2.5, fontSize: '2rem', fontWeight: 900,
                  background: `linear-gradient(45deg, ${THEME.accent}, #FFC107)`,
                  boxShadow: '0 8px 30px rgba(255, 111, 0, 0.4)', color: '#FFF',
                  '&:hover': { transform: 'scale(1.05)', background: `linear-gradient(45deg, #FF9800, #FF5722)` },
                  transition: 'all 0.2s'
                }}
              >
                {isDrawing ? 'กำลังสุ่ม...' : 'กดเพื่อสุ่มรางวัล!'}
              </Button>
            )}
          </Box>
        </Box>

      </Box>
    </Box>
  );
}