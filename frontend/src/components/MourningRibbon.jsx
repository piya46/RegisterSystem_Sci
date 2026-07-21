import React from 'react';
import { Box } from '@mui/material';

export default function MourningRibbon() {
  return (
    <Box sx={{ position: "absolute", top: 0, left: 0, zIndex: 9999, pointerEvents: "none", width: { xs: 80, md: 120 }, height: { xs: 80, md: 120 } }}>
      <img src="/ribbon.svg" alt="Mourning Ribbon" style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(2px 2px 3px rgba(0,0,0,0.5))" }} />
    </Box>
  );
}
