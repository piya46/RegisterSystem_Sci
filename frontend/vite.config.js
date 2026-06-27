import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


export default defineConfig({
  plugins: [react()],
  server: {

    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      }
    }
  },

  build: {
    outDir: "dist", // โฟลเดอร์ปลายทาง
    emptyOutDir: true, // ล้างไฟล์เก่าก่อน build
    sourcemap: false, // ไม่สร้าง Source map ใน Production (เพื่อความปลอดภัยและลดขนาด)
    chunkSizeWarningLimit: 1000, // ขยายลิมิตการแจ้งเตือนขนาดไฟล์ (optional)
    rollupOptions: {
      output: {
        // แยกไฟล์ Vendor (Library) ออกจากไฟล์ Code หลัก เพื่อการ Cache ที่ดีขึ้น
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@mui')) return 'mui';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('framer-motion')) return 'motion';
            if (id.includes('html5-qrcode') || id.includes('qrcode')) return 'qr';
            return 'vendor';
          }
        }
      }
    }
  }
})
