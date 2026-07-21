import React from 'react';
import { TableContainer, Paper, Table, TableHead, TableRow, TableCell, TableBody, Typography } from '@mui/material';

const SIZE_CHART_DATA = [
  { size: "SS", chest: 34, length: 23 }, { size: "S",  chest: 36, length: 24 },
  { size: "M",  chest: 38, length: 25 }, { size: "L",  chest: 40, length: 26 },
  { size: "XL", chest: 42, length: 27 }, { size: "2XL", chest: 44, length: 28 },
  { size: "3XL", chest: 46, length: 29 }, { size: "4XL", chest: 48, length: 30 },
  { size: "5XL", chest: 50, length: 31 }, { size: "6XL", chest: 52, length: 32 },
  { size: "7XL", chest: 54, length: 33 }
];

export default function SizeChart() {
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ mt: 2, bgcolor: "#fff", maxWidth: 400 }}>
      <Table size="small" sx={{ "& .MuiTableCell-root": { px: 1, py: 0.5, fontSize: "0.9rem" } }}>
        <TableHead>
          <TableRow sx={{ bgcolor: "#eee" }}>
            <TableCell align="center" sx={{ fontWeight: "bold" }}>Size</TableCell>
            <TableCell align="center" sx={{ fontWeight: "bold" }}>รอบอก (นิ้ว)</TableCell>
            <TableCell align="center" sx={{ fontWeight: "bold" }}>ความยาว (นิ้ว)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {SIZE_CHART_DATA.map((r) => (
            <TableRow key={r.size}>
              <TableCell align="center" sx={{ fontWeight: "bold", color: "primary.main" }}>{r.size}</TableCell>
              <TableCell align="center">{r.chest}</TableCell>
              <TableCell align="center">{r.length}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" display="block" sx={{ p: 1, textAlign: "center", bgcolor: "#fff8e1", color: "#f57f17" }}>
        * ขนาดอาจมีความคลาดเคลื่อน +/- 1 นิ้ว
      </Typography>
    </TableContainer>
  );
}
