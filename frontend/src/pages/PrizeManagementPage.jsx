import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Button, Paper, Stack, Select, MenuItem, FormControl, InputLabel, CircularProgress, Fade } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import { useNavigate } from 'react-router-dom';
import { listPrizes, drawPrize } from '../utils/api';
import Confetti from 'react-confetti';

// ธีมสีสำหรับงานเฉลิมฉลอง
const THEME = {
  bg: "radial-gradient(circle at 50% 50%, #1a237e 0%, #000000 100%)", // พื้นหลังสีน้ำเงินเข้มหรูหรา
  gold: "#FFD700",
  text: "#FFFFFF"
};

// รายชื่อจำลองสำหรับทำ Effect สุ่ม (Slot Machine)
const DUMMY_NAMES = [
  "สมชาย รักเรียน", "วิภาวดี สีสด", "ณัฐพงศ์ ใจดี", "พรพิมล คนงาม", 
  "กิตติศักดิ์ ยอดเยี่ยม", "ศิริพร อักษร", "เอกราช เก่งการ", "นภัสสร ดอนเมือง",
  "ธนวัฒน์ จัดให้", "จิราพร สอนดี", "พีรพล คนเก่ง", "สุนิสา น่ารัก"
];

export default function LuckyDrawPage() {
  const navigate = useNavigate();
  const [prizes, setPrizes] = useState([]);
  const [selectedPrize, setSelectedPrize] = useState('');
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [winnerData, setWinnerData] = useState(null);
  
  // State สำหรับลูกเล่นสุ่มชื่อ
  const [currentDisplay, setCurrentDisplay] = useState("พร้อมลุ้นรางวัล?");
  const intervalRef = useRef(null);

  useEffect(() => {
    fetchPrizes();
  }, []);

  const fetchPrizes = async () => {
    try {
      const res = await listPrizes();
      // กรองเฉพาะรางวัลที่ยังเหลืออยู่มาให้พิธีกรเลือก
      setPrizes(res.data.filter(p => p.remainingQuantity > 0));
    } catch (err) {
      console.error(err);
    }
  };

  const startDrawAnimation = (actualWinner) => {
    setIsDrawing(true);
    setShowWinner(false);
    
    let ticks = 0;
    const maxTicks = 30; // รัน Effect ประมาณ 3 วินาที (30 * 100ms)
    
    intervalRef.current = setInterval(() => {
      // สุ่มหยิบชื่อจำลองมาแสดงไวๆ
      const randomName = DUMMY_NAMES[Math.floor(Math.random() * DUMMY_NAMES.length)];
      setCurrentDisplay(randomName);
      ticks++;

      if (ticks >= maxTicks) {
        clearInterval(intervalRef.current);
        // แสดงชื่อผู้ชนะตัวจริง
        setCurrentDisplay(actualWinner.name);
        setWinnerData(actualWinner);
        setIsDrawing(false);
        setShowWinner(true);
        fetchPrizes(); // อัปเดตยอดคงเหลือ
      }
    }, 100);
  };

  const handleDraw = async () => {
    if (!selectedPrize) {
      alert("กรุณาเลือกของรางวัลก่อนครับ!");
      return;
    }

    try {
      // เรียก API ไปสุ่มหลังบ้านก่อน เพื่อให้ได้ชื่อผู้ชนะที่แท้จริง
      const res = await drawPrize(selectedPrize);
      const winner = res.data.winner;
      
      // เริ่มเล่น Effect หน้าจอ
      startDrawAnimation(winner);

    } catch (err) {
      alert(err.response?.data?.error || "เกิดข้อผิดพลาด หรือทุกคนได้รางวัลไปหมดแล้ว");
    }
  };

  const handleReset = () => {
    setShowWinner(false);
    setWinnerData(null);
    setCurrentDisplay("พร้อมลุ้นรางวัล?");
  };

  const activePrizeObj = prizes.find(p => p._id === selectedPrize);

  return (
    <Box sx={{ minHeight: '100vh', background: THEME.bg, color: THEME.text, p: 4, fontFamily: 'Prompt, sans-serif', position: 'relative', overflow: 'hidden' }}>
      
      {/* พลุกระดาษฉลองผู้โชคดี */}
      {showWinner && <Confetti width={window.innerWidth} height={window.innerHeight} recycle={true} numberOfPieces={400} />}

      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={4} sx={{ position: 'relative', zIndex: 10 }}>
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate('/dashboard')} sx={{ borderRadius: 3, color: '#fff', borderColor: 'rgba(255,255,255,0.3)', '&:hover': { borderColor: '#fff' } }}>
          กลับหลังบ้าน
        </Button>
        <Typography variant="h5" fontWeight={800} color={THEME.gold} display="flex" alignItems="center" gap={1}>
          <EmojiEventsIcon fontSize="large" /> LUCKY DRAW
        </Typography>
      </Stack>

      {/* ส่วนเลือกของรางวัล (สำหรับพิธีกร) */}
      <Box sx={{ maxWidth: 600, mx: 'auto', mb: 6, position: 'relative', zIndex: 10, bgcolor: 'rgba(255,255,255,0.1)', p: 3, borderRadius: 4, backdropFilter: 'blur(10px)' }}>
        <FormControl fullWidth variant="filled" sx={{ bgcolor: '#fff', borderRadius: 2 }}>
          <InputLabel>พิธีกร: เลือกของรางวัลที่จะสุ่ม</InputLabel>
          <Select
            value={selectedPrize}
            onChange={(e) => { setSelectedPrize(e.target.value); handleReset(); }}
            disabled={isDrawing}
          >
            <MenuItem value="" disabled><em>-- เลือกรางวัล --</em></MenuItem>
            {prizes.length === 0 && <MenuItem value="" disabled>ไม่มีของรางวัลเหลือให้สุ่ม</MenuItem>}
            {prizes.map(p => (
              <MenuItem key={p._id} value={p._id}>
                {p.name} (เหลือ {p.remainingQuantity} รางวัล)
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* ส่วนแสดงผล (ขึ้นจอโปรเจคเตอร์) */}
      <Box textAlign="center" sx={{ position: 'relative', zIndex: 10, mt: 8 }}>
        
        {/* ชื่อรางวัลที่กำลังสุ่ม */}
        <Fade in={!!activePrizeObj}>
          <Typography variant="h3" fontWeight={900} color={THEME.gold} gutterBottom sx={{ textShadow: '0 4px 20px rgba(255, 215, 0, 0.5)' }}>
             {activePrizeObj ? `รางวัล: ${activePrizeObj.name}` : ''}
          </Typography>
        </Fade>

        {/* กรอบแสดงชื่อ */}
        <Paper elevation={12} sx={{ 
            maxWidth: 800, mx: 'auto', mt: 4, p: 6, borderRadius: 6, 
            background: showWinner ? 'linear-gradient(135deg, #FFD700 0%, #FFA000 100%)' : 'rgba(255,255,255,0.05)',
            border: showWinner ? '4px solid #FFF' : '2px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(20px)',
            transition: 'all 0.5s ease',
            transform: showWinner ? 'scale(1.05)' : 'scale(1)'
        }}>
          
          {showWinner && <Typography variant="h5" fontWeight={800} color="#000" mb={2}>🎉 ผู้โชคดีได้แก่ 🎉</Typography>}
          
          {/* ชื่อที่วิ่งสุ่ม / ชื่อผู้ชนะ */}
          <Typography variant="h1" fontWeight={900} sx={{ 
              color: showWinner ? '#000' : '#FFF', 
              textShadow: showWinner ? 'none' : '0 0 20px rgba(255,255,255,0.5)',
              fontSize: { xs: '3rem', md: '5rem' },
              lineHeight: 1.2,
              mb: showWinner ? 2 : 0
          }}>
            {currentDisplay}
          </Typography>

          {/* ข้อมูลภาควิชาของผู้ชนะ */}
          {showWinner && winnerData?.department && (
            <Typography variant="h4" fontWeight={700} color="#333">
              ภาควิชา: {winnerData.department}
            </Typography>
          )}

        </Paper>

        {/* ปุ่มกดสุ่ม */}
        <Box mt={8}>
          {!showWinner ? (
            <Button 
              variant="contained" 
              disabled={!selectedPrize || isDrawing}
              onClick={handleDraw}
              sx={{ 
                  borderRadius: 50, px: 8, py: 2, fontSize: '2rem', fontWeight: 900,
                  background: 'linear-gradient(45deg, #FF3D00, #FF9100)',
                  boxShadow: '0 8px 30px rgba(255, 61, 0, 0.6)',
                  color: '#fff',
                  '&:hover': { transform: 'scale(1.05)', background: 'linear-gradient(45deg, #FF9100, #FF3D00)' },
                  transition: 'all 0.2s'
              }}
            >
              {isDrawing ? 'กำลังสุ่ม...' : 'กดเพื่อสุ่มรางวัล!'}
            </Button>
          ) : (
            <Button 
              variant="outlined" 
              onClick={handleReset}
              sx={{ borderRadius: 50, px: 6, py: 1.5, fontSize: '1.2rem', color: THEME.gold, borderColor: THEME.gold, '&:hover':{ bgcolor: 'rgba(255,215,0,0.1)' } }}
            >
              เตรียมสุ่มรางวัลถัดไป
            </Button>
          )}
        </Box>

      </Box>
    </Box>
  );
}