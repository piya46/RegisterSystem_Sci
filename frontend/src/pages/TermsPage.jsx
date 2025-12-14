import React from "react";
import { Box, Container, Typography, Paper, Button, Divider, List, ListItem, ListItemText } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5", py: 4 }}>
      <Container maxWidth="md">
        <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
            ย้อนกลับ
          </Button>
          
          <Typography variant="h4" fontWeight="bold" gutterBottom color="primary">
            ข้อกำหนดและเงื่อนไขการใช้งาน (Terms of Service)
          </Typography>
          <Typography variant="caption" color="text.secondary" paragraph>
            เวอร์ชัน 1.0 | มีผลบังคับใช้ตั้งแต่วันที่: 15 ธันวาคม 2568
          </Typography>

          <Typography paragraph sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
            ข้อกำหนดและเงื่อนไขนี้ ("ข้อตกลง") เป็นสัญญาตามกฎหมายระหว่าง ท่าน ("ผู้ใช้งาน") และ คณะผู้จัดงานและทีมผู้พัฒนาระบบ ("ผู้ให้บริการ") เกี่ยวกับการเข้าถึงและการใช้งานระบบลงทะเบียนงาน "เสือเหลืองคืนถิ่น" ("บริการ") โปรดอ่านข้อตกลงนี้อย่างละเอียดก่อนใช้งาน
          </Typography>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            1. การยอมรับข้อกำหนด
          </Typography>
          <Typography paragraph>
            การเข้าถึงหรือใช้งานบริการนี้ ถือว่าท่านได้อ่าน ทำความเข้าใจ และตกลงที่จะผูกพันตามข้อกำหนดและเงื่อนไขเหล่านี้ รวมถึงนโยบายความเป็นส่วนตัว หากท่านไม่ตกลงตามข้อกำหนดเหล่านี้ กรุณาระงับการใช้งานทันที
          </Typography>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            2. การใช้งานที่ได้รับอนุญาตและข้อห้ามตามกฎหมาย
          </Typography>
          <Typography paragraph>
            ท่านตกลงที่จะใช้งานบริการนี้เพื่อวัตถุประสงค์ในการลงทะเบียนเข้าร่วมงานและสนับสนุนกิจกรรมเท่านั้น และตกลงที่จะไม่กระทำการใดๆ ที่ขัดต่อพระราชบัญญัติว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์ พ.ศ. 2550 (และที่แก้ไขเพิ่มเติม) ดังนี้:
          </Typography>
          <List dense sx={{ listStyleType: 'disc', pl: 4 }}>
            <ListItem sx={{ display: 'list-item' }}><ListItemText primary="ห้ามเจาะระบบ แฮก หรือพยายามเข้าถึงข้อมูลส่วนหนึ่งส่วนใดของระบบโดยไม่ได้รับอนุญาต" /></ListItem>
            <ListItem sx={{ display: 'list-item' }}><ListItemText primary="ห้ามนำเข้าข้อมูลที่เป็นเท็จ บิดเบือน หรือปลอมแปลงเข้าสู่ระบบคอมพิวเตอร์ ซึ่งอาจก่อให้เกิดความเสียหายแก่ผู้อื่น" /></ListItem>
            <ListItem sx={{ display: 'list-item' }}><ListItemText primary="ห้ามรบกวน หรือขัดขวางการทำงานของระบบ (Denial of Service)" /></ListItem>
          </List>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            3. ข้อมูลบัญชีและการลงทะเบียน
          </Typography>
          <Typography paragraph>
            ท่านรับรองว่าข้อมูลทั้งหมดที่ท่านให้ไว้ในขั้นตอนการลงทะเบียนเป็นความจริง ถูกต้อง และเป็นปัจจุบัน หากตรวจพบว่าท่านให้ข้อมูลเท็จ ผู้ให้บริการขอสงวนสิทธิ์ในการระงับสิทธิ์การเข้าร่วมงานและยึดเงินสนับสนุนโดยไม่ต้องแจ้งให้ทราบล่วงหน้า
          </Typography>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            4. นโยบายการชำระเงินและการไม่คืนเงิน (No Refund Policy)
          </Typography>
          <Typography paragraph>
            การโอนเงินเพื่อสนับสนุนกิจกรรมหรือสั่งจองของที่ระลึกผ่านระบบนี้ ถือเป็นการทำธุรกรรมที่สมบูรณ์เมื่อผู้ให้บริการได้รับยอดเงิน <b>ผู้ให้บริการขอสงวนสิทธิ์ในการไม่คืนเงินทุกกรณี</b> (Non-refundable) ยกเว้นในกรณีที่เกิดจากความผิดพลาดทางเทคนิคของระบบที่ผู้ให้บริการตรวจสอบแล้วว่าเป็นความจริง
          </Typography>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            5. ทรัพย์สินทางปัญญา
          </Typography>
          <Typography paragraph>
            เนื้อหา ซอร์สโค้ด (Source Code) การออกแบบ กราฟิก และองค์ประกอบอื่นๆ บนระบบนี้ เป็นทรัพย์สินทางปัญญาของผู้พัฒนาระบบและ/หรือผู้จัดงาน ห้ามมิให้ผู้ใดคัดลอก ดัดแปลง ทำซ้ำ หรือนำไปใช้เพื่อการพาณิชย์โดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษร
          </Typography>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            6. ข้อจำกัดความรับผิด (Limitation of Liability)
          </Typography>
          <Typography paragraph>
            ในขอบเขตสูงสุดที่กฎหมายอนุญาต:
          </Typography>
          <List dense sx={{ listStyleType: 'decimal', pl: 4 }}>
            <ListItem sx={{ display: 'list-item' }}><ListItemText primary="ผู้พัฒนาระบบให้บริการในลักษณะ &quot;ตามสภาพ&quot; (As is) และไม่รับประกันว่าระบบจะทำงานโดยปราศจากข้อผิดพลาด หรือพร้อมใช้งานตลอดเวลา" /></ListItem>
            <ListItem sx={{ display: 'list-item' }}><ListItemText primary="ผู้พัฒนาระบบจะไม่รับผิดชอบต่อความเสียหายใดๆ (รวมถึงแต่ไม่จำกัดเพียง การสูญหายของข้อมูล หรือความเสียหายจากการใช้ผิดวิธี) ที่เกิดขึ้นจากการใช้งานระบบนี้" /></ListItem>
            <ListItem sx={{ display: 'list-item' }}><ListItemText primary="ผู้พัฒนาระบบเป็นเพียงผู้ให้บริการเครื่องมือทางเทคนิค ไม่เกี่ยวข้องกับการบริหารจัดการงานอีเวนต์ หรือการจัดการเงินสนับสนุน ความรับผิดชอบดังกล่าวเป็นของคณะผู้จัดงานแต่เพียงผู้เดียว" /></ListItem>
          </List>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            7. เหตุสุดวิสัย (Force Majeure)
          </Typography>
          <Typography paragraph>
            ผู้จัดงานจะไม่รับผิดชอบต่อความล่าช้า การระงับ หรือการยกเลิกงาน อันเนื่องมาจากเหตุการณ์ที่อยู่นอกเหนือการควบคุมของผู้จัดงาน (เหตุสุดวิสัย) ซึ่งรวมถึงแต่ไม่จำกัดเพียง:
          </Typography>
          <List dense sx={{ listStyleType: 'disc', pl: 4 }}>
            <ListItem sx={{ display: 'list-item' }}><ListItemText primary="ภัยธรรมชาติ อุทกภัย พายุ หรือแผ่นดินไหว" /></ListItem>
            <ListItem sx={{ display: 'list-item' }}><ListItemText primary="โรคระบาด หรือคำสั่งปิดสถานที่จากภาครัฐ" /></ListItem>
            <ListItem sx={{ display: 'list-item' }}><ListItemText primary="เหตุการณ์ความไม่สงบทางการเมือง หรือการจลาจล" /></ListItem>
            <ListItem sx={{ display: 'list-item' }}><ListItemText primary="ระบบไฟฟ้า หรืออินเทอร์เน็ตขัดข้องเป็นวงกว้าง" /></ListItem>
          </List>
          <Typography paragraph>
            ในกรณีที่เกิดเหตุสุดวิสัย ผู้จัดงานสงวนสิทธิ์ในการพิจารณาเลื่อนการจัดงาน หรือปรับเปลี่ยนรูปแบบงานตามความเหมาะสม โดยไม่ต้องชดเชยค่าเสียหายใดๆ แก่ผู้เข้าร่วมงาน
          </Typography>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            8. การเปลี่ยนแปลงข้อกำหนด
          </Typography>
          <Typography paragraph>
            ผู้ให้บริการขอสงวนสิทธิ์ในการแก้ไข เปลี่ยนแปลง หรือยกเลิกข้อกำหนดบางประการได้ตลอดเวลา โดยจะประกาศให้ทราบผ่านหน้าเว็บไซต์ การที่ท่านใช้งานระบบต่อหลังจากมีการเปลี่ยนแปลง ถือว่าท่านยอมรับข้อกำหนดใหม่นั้น
          </Typography>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            9. กฎหมายที่ใช้บังคับ
          </Typography>
          <Typography paragraph>
            ข้อตกลงนี้อยู่ภายใต้บังคับของกฎหมายแห่งราชอาณาจักรไทย หากมีข้อพิพาทใดๆ ให้เข้าสู่กระบวนการระงับข้อพิพาทตามกฎหมายไทย
          </Typography>

        </Paper>
      </Container>
    </Box>
  );
}