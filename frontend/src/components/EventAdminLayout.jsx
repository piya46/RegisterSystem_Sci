import React, { useEffect, useState } from 'react';
import { Alert, Avatar, Box, Button, CircularProgress, Divider, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import PeopleIcon from '@mui/icons-material/People';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import DevicesIcon from '@mui/icons-material/Devices';
import { getEventById } from '../utils/api';

const drawerWidth = 260;

export default function EventAdminLayout() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let entryTimer;
    setEvent(null);
    setLoading(true);
    setError('');
    getEventById(eventId)
      .then((res) => {
        if (!alive) return;
        const verifiedEvent = res.data?.data;
        if (!verifiedEvent || String(verifiedEvent._id || verifiedEvent.id) !== String(eventId)) {
          setError('ข้อมูลกิจกรรมไม่สอดคล้องกับลิงก์ที่เปิด');
          setLoading(false);
          return;
        }
        setEvent(verifiedEvent);
        entryTimer = window.setTimeout(() => {
          if (alive) setLoading(false);
        }, 300);
      })
      .catch((requestError) => {
        if (!alive) return;
        const status = requestError?.response?.status;
        setEvent(null);
        setError(status === 403
          ? 'คุณไม่มีสิทธิ์เข้าถึงกิจกรรมนี้'
          : status === 404
            ? 'ไม่พบกิจกรรม'
            : 'ไม่สามารถโหลดข้อมูลกิจกรรมได้');
        setLoading(false);
      });

    return () => {
      alive = false;
      if (entryTimer) window.clearTimeout(entryTimer);
    };
  }, [eventId]);

  const managementItems = [
    { label: 'ภาพรวม (Dashboard)', path: 'dashboard', icon: <DashboardIcon /> },
    { label: 'ผู้เข้าร่วม (Participants)', path: 'participants', icon: <PeopleIcon /> },
    { label: 'เงินสนับสนุน (Donations)', path: 'donations', icon: <VolunteerActivismIcon /> },
    { label: 'สุ่มรางวัล (Lucky Draw)', path: 'lucky-draw', icon: <EmojiEventsIcon /> },
  ];

  const settingsItems = [
    { label: 'ตั้งค่ากิจกรรม', path: 'settings', icon: <SettingsIcon /> },
    { label: 'ออกแบบหน้า (Layouts)', path: 'layouts', icon: <ViewQuiltIcon /> },
  ];

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height="calc(100vh - 68px)" bgcolor="#f8fafc">
        <Box sx={{ position: 'relative', display: 'inline-flex', mb: 3 }}>
          <CircularProgress size={130} thickness={2} sx={{ color: 'primary.main', position: 'absolute', top: -15, left: -15, zIndex: 1 }} />
          <Avatar
            src={event?.branding?.logoUrl || '/logo.svg'}
            sx={{
              width: 100,
              height: 100,
              border: '3px solid #fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              bgcolor: '#fff',
              animation: event ? 'eventLogoSpin 1.6s linear infinite' : 'none',
              '@keyframes eventLogoSpin': {
                from: { transform: 'rotate(0deg)' },
                to: { transform: 'rotate(360deg)' },
              },
            }}
          >
            {event?.name?.[0] || 'E'}
          </Avatar>
        </Box>
        <Typography variant="h6" fontWeight={700} color="text.secondary">
          {event ? (
            <>กำลังเข้าสู่ระบบจัดการของ Event: <Box component="span" color="primary.main">{event.name}</Box></>
          ) : 'กำลังตรวจสอบกิจกรรมและสิทธิ์การเข้าถึง'}
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
          กรุณารอสักครู่...
        </Typography>
      </Box>
    );
  }

  if (error || !event) {
    return (
      <Box p={4} sx={{ maxWidth: 560, mx: 'auto' }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error || 'ไม่พบกิจกรรม'}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/admin/events')}>
          กลับหน้ารวมกิจกรรม
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 68px)' }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
            position: 'relative',
            bgcolor: '#f8fafc',
            borderRight: '1px solid #e2e8f0',
            zIndex: 1
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/admin/events')}
            sx={{ color: 'text.secondary', mb: 2, '&:hover': { bgcolor: '#e2e8f0' } }}
          >
            กลับหน้ารวมกิจกรรม
          </Button>
          <Typography variant="h6" fontWeight={800} color="primary.main" noWrap title={event.name}>
            {event.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            ปี {event.eventYear} · {event.status}
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          <List sx={{ px: 2, pt: 2 }}>
            <Typography variant="overline" color="text.secondary" sx={{ px: 2, fontWeight: 700 }}>Management</Typography>
            {managementItems.map((item) => {
              const itemPath = `/admin/events/${eventId}/${item.path}`;
              const isActive = location.pathname.startsWith(itemPath) || (item.path === 'dashboard' && location.pathname === `/admin/events/${eventId}`);

              return (
                <ListItem key={item.path} disablePadding sx={{ mb: 1 }}>
                  <ListItemButton
                    onClick={() => navigate(itemPath)}
                    selected={isActive}
                    sx={{
                      borderRadius: 2,
                      '&.Mui-selected': {
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        '&:hover': { bgcolor: 'primary.dark' },
                        '& .MuiListItemIcon-root': { color: 'inherit' }
                      }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40, color: isActive ? 'inherit' : 'text.secondary' }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: isActive ? 700 : 500, fontSize: '0.9rem' }} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>

          <Divider sx={{ my: 1 }} />

          <List sx={{ px: 2 }}>
            <Typography variant="overline" color="text.secondary" sx={{ px: 2, fontWeight: 700 }}>Settings</Typography>
            {settingsItems.map((item) => {
              const itemPath = `/admin/events/${eventId}/${item.path}`;
              const isActive = location.pathname.startsWith(itemPath);

              return (
                <ListItem key={item.path} disablePadding sx={{ mb: 1 }}>
                  <ListItemButton
                    onClick={() => navigate(itemPath)}
                    selected={isActive}
                    sx={{
                      borderRadius: 2,
                      '&.Mui-selected': {
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        '&:hover': { bgcolor: 'primary.dark' },
                        '& .MuiListItemIcon-root': { color: 'inherit' }
                      }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40, color: isActive ? 'inherit' : 'text.secondary' }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: isActive ? 700 : 500, fontSize: '0.9rem' }} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>

          <Divider sx={{ my: 1 }} />

          <List sx={{ px: 2, pb: 4 }}>
            <Typography variant="overline" color="text.secondary" sx={{ px: 2, fontWeight: 700 }}>Operational Tools</Typography>
            <ListItem disablePadding sx={{ mb: 1 }}>
              <ListItemButton
                onClick={() => window.open(`/kiosk?eventId=${eventId}&eventYear=${event?.eventYear}`, '_blank')}
                sx={{ borderRadius: 2 }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
                  <DevicesIcon />
                </ListItemIcon>
                <ListItemText primary="Kiosk เช็คอิน" primaryTypographyProps={{ fontSize: '0.9rem' }} />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding sx={{ mb: 1 }}>
              <ListItemButton
                onClick={() => window.open(`/staff?eventId=${eventId}&eventYear=${event?.eventYear}`, '_blank')}
                sx={{ borderRadius: 2 }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
                  <QrCodeScannerIcon />
                </ListItemIcon>
                <ListItemText primary="Staff สแกน QR" primaryTypographyProps={{ fontSize: '0.9rem' }} />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: '#f1f5f9', minWidth: 0 }}>
        <Outlet context={{ event, setEvent }} />
      </Box>
    </Box>
  );
}
