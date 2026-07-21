import React from "react";
import { Card, CardContent, Box, Stack, Typography, Skeleton } from "@mui/material";

export default function StatCard({ title, value, subtext, icon, color1, color2, textColor = "#fff", loading }) {
  return (
    <Card sx={{
      flex: 1,
      background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`,
      color: textColor,
      position: 'relative',
      overflow: 'hidden',
      transition: 'all 0.3s ease',
      border: 'none',
      boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
      '&:hover': { transform: 'translateY(-5px)', boxShadow: '0 12px 28px rgba(0,0,0,0.2)' }
    }}>
      <Box sx={{ position: 'absolute', right: -20, bottom: -20, opacity: 0.15, transform: 'rotate(-20deg)', pointerEvents: 'none' }}>
        {icon && React.cloneElement(icon, { sx: { fontSize: 120, color: textColor } })}
      </Box>
      <CardContent sx={{ position: 'relative', zIndex: 1, textAlign: "left", p: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '50%', p: 0.5, display: 'flex' }}>
            {icon && React.cloneElement(icon, { sx: { fontSize: 20, color: textColor } })}
          </Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ opacity: 0.95, letterSpacing: 0.5 }}>{title}</Typography>
        </Stack>
        {loading ? (
          <Skeleton variant="text" width="60%" height={50} sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />
        ) : (
          <Typography variant="h4" fontWeight={900} sx={{ textShadow: '0 2px 4px rgba(0,0,0,0.1)', mt: 0.5 }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </Typography>
        )}
        {subtext && <Typography variant="caption" sx={{ opacity: 0.85, mt: 0.5, display: 'block', fontWeight: 500 }}>{subtext}</Typography>}
      </CardContent>
    </Card>
  );
}
