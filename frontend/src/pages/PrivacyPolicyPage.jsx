import React from "react";
import { Box, Container, Typography, Paper, Button, Divider, List, ListItem, ListItemText } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5", py: 4 }}>
      <Container maxWidth="md">
        <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
            ย้อนกลับ
          </Button>
          
          <Typography variant="h4" fontWeight="bold" gutterBottom color="primary">
            นโยบายความเป็นส่วนตัว (Privacy Policy)
          </Typography>
          <Typography variant="caption" color="text.secondary" paragraph>
            เวอร์ชัน 1.0 | อัปเดตล่าสุด: 15 ธันวาคม 2568
          </Typography>

          <Typography paragraph>
            คณะผู้จัดงาน "เสือเหลืองคืนถิ่น" และสมาคมนิสิตเก่าวิทยาศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย ("เรา") ตระหนักถึงความสำคัญของการคุ้มครองข้อมูลส่วนบุคคลของท่าน เราจึงจัดทำนโยบายความเป็นส่วนตัวฉบับนี้ขึ้นเพื่อให้สอดคล้องกับ <b>พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</b> โดยมีรายละเอียดดังนี้
          </Typography>

          <Divider sx={{ my: 2 }} />

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            1. ข้อมูลส่วนบุคคลที่เราเก็บรวบรวม
          </Typography>
          <Typography paragraph>เราเก็บรวบรวมข้อมูลเท่าที่จำเป็นเพื่อการจัดงานและการยืนยันตัวตน ได้แก่:</Typography>
          <List dense sx={{ pl: 2 }}>
            <ListItem><ListItemText primary={<b>1.1 ข้อมูลระบุตัวตนทั่วไป (General Data):</b>} secondary="ชื่อ-นามสกุล, ชื่อเล่น, รหัสนิสิต (ถ้ามี), ภาควิชา, ปีที่เข้าศึกษา" /></ListItem>
            <ListItem><ListItemText primary={<b>1.2 ข้อมูลการติดต่อ (Contact Data):</b>} secondary="หมายเลขโทรศัพท์, อีเมล, ที่อยู่ (สำหรับสมาชิกสมาคมฯ)" /></ListItem>
            <ListItem><ListItemText primary={<b>1.3 ข้อมูลทางการเงิน (Financial Data):</b>} secondary="หลักฐานการโอนเงิน, วันเวลาที่โอน, จำนวนเงิน (เราไม่มีการเก็บข้อมูลเลขหน้าบัตรเครดิตโดยตรง)" /></ListItem>
            <ListItem><ListItemText primary={<b>1.4 ข้อมูลที่มีความอ่อนไหว (Sensitive Data):</b>} secondary="ข้อมูลสุขภาพที่จำเป็นต่อการอำนวยความสะดวก (เช่น การแพ้อาหาร, การใช้วีลแชร์) ซึ่งเราจะเก็บรวบรวมเมื่อได้รับความยินยอมโดยชัดแจ้งจากท่านผ่านการกรอกแบบฟอร์มนี้เท่านั้น" /></ListItem>
            <ListItem><ListItemText primary={<b>1.5 ข้อมูลทางเทคนิค (Technical Data):</b>} secondary="IP Address, ข้อมูลการเข้าใช้งาน (Log), Cookies เพื่อความปลอดภัยและตรวจสอบการใช้งานระบบ" /></ListItem>
          </List>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            2. ฐานทางกฎหมายและวัตถุประสงค์การประมวลผลข้อมูล
          </Typography>
          <Typography paragraph>เราประมวลผลข้อมูลของท่านภายใต้ฐานทางกฎหมายต่อไปนี้:</Typography>
          <List dense sx={{ listStyleType: 'disc', pl: 4 }}>
            <ListItem sx={{ display: 'list-item' }}><ListItemText primary={<b>ฐานความจำเป็นเพื่อการปฏิบัติตามสัญญา (Contractual Basis):</b>} secondary="เพื่อการลงทะเบียน, การออกบัตรเข้างาน (E-Ticket), และการส่งมอบของที่ระลึก" /></ListItem>
            <ListItem sx={{ display: 'list-item' }}><ListItemText primary={<b>ฐานความยินยอม (Consent):</b>} secondary="สำหรับการเก็บข้อมูลสุขภาพ (แพ้อาหาร/วีลแชร์) และการสมัครสมาชิกสมาคมฯ" /></ListItem>
            <ListItem sx={{ display: 'list-item' }}>
                <ListItemText 
                    primary={<b>ฐานประโยชน์โดยชอบด้วยกฎหมาย (Legitimate Interest):</b>} 
                    secondary={
                        <React.Fragment>
                            - เพื่อการรักษาความปลอดภัยของระบบ และการป้องกันการทุจริต<br/>
                            - <b>เพื่อการวิเคราะห์ ประเมินผล และนำข้อมูลไปใช้ในการวางแผนการจัดงานในปีถัดไป รวมถึงการปรับปรุงรูปแบบกิจกรรมให้ดียิ่งขึ้น</b>
                        </React.Fragment>
                    } 
                />
            </ListItem>
          </List>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            3. การเปิดเผยและส่งต่อข้อมูล
          </Typography>
          <Typography paragraph>
            ข้อมูลของท่านจะถูกเก็บเป็นความลับ และจะไม่มีการขายข้อมูลแก่บุคคลภายนอก เราอาจเปิดเผยข้อมูลเฉพาะในกรณีดังต่อไปนี้:
          </Typography>
          <List dense>
            <ListItem><ListItemText primary="• เปิดเผยต่อสมาคมนิสิตเก่าวิทยาศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย เพื่อการปรับปรุงฐานข้อมูลสมาชิก (ตามที่ท่านได้เลือก)" /></ListItem>
            <ListItem><ListItemText primary="• เปิดเผยต่อเจ้าหน้าที่หน้างาน (Staff) เพื่อการตรวจสอบสิทธิ์และอำนวยความสะดวก" /></ListItem>
            <ListItem><ListItemText primary="• เปิดเผยต่อคณะกรรมการจัดงานชุดต่อไป เพื่อวัตถุประสงค์ในการวางแผนงาน (เฉพาะข้อมูลที่จำเป็นและไม่ระบุตัวตน หากทำได้)" /></ListItem>
            <ListItem><ListItemText primary="• เปิดเผยต่อหน่วยงานราชการ หากมีคำสั่งตามกฎหมาย" /></ListItem>
          </List>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            4. มาตรการรักษาความมั่นคงปลอดภัย
          </Typography>
          <Typography paragraph>
            เราใช้มาตรการทางเทคนิคและการบริหารจัดการที่เหมาะสมเพื่อปกป้องข้อมูลของท่าน เช่น การเข้ารหัสข้อมูล (Encryption), การจำกัดสิทธิ์การเข้าถึง (Access Control), และการใช้ระบบยืนยันตัวตน เพื่อป้องกันการสูญหาย เข้าถึง ทำลาย ใช้ ดัดแปลง แก้ไข หรือเปิดเผยข้อมูลโดยมิชอบ
          </Typography>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            5. คุกกี้และเทคโนโลยีการติดตาม (Cookies & Tracking Technologies)
          </Typography>
          <Typography paragraph>
            เว็บไซต์นี้มีการใช้คุกกี้และเทคโนโลยีที่คล้ายคลึงกัน เพื่อวัตถุประสงค์ดังนี้:
          </Typography>
          <List dense sx={{ pl: 2 }}>
            <ListItem><ListItemText primary="• เพื่อความปลอดภัย:" secondary="เราใช้บริการ Cloudflare Turnstile เพื่อตรวจสอบและป้องกันการโจมตีจากบอท (Bot) หรือสแปม" /></ListItem>
            <ListItem><ListItemText primary="• เพื่อการทำงานของระบบ:" secondary="เราใช้คุกกี้เพื่อจดจำสถานะการเข้าสู่ระบบของเจ้าหน้าที่ (Session Management) เพื่อให้ท่านใช้งานเว็บไซต์ได้อย่างต่อเนื่อง" /></ListItem>
          </List>
          <Typography paragraph>
            ท่านไม่สามารถปิดการทำงานของคุกกี้เหล่านี้ได้ เนื่องจากเป็นสิ่งจำเป็นต่อความปลอดภัยและการทำงานหลักของระบบ
          </Typography>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            6. ระยะเวลาในการจัดเก็บข้อมูล
          </Typography>
          <Typography paragraph>
            เราจะจัดเก็บข้อมูลของท่านไว้ตามระยะเวลาที่จำเป็นเพื่อบรรลุวัตถุประสงค์ที่ระบุไว้ในนโยบายนี้:
          </Typography>
          <List dense sx={{ pl: 2 }}>
            <ListItem><ListItemText primary="• ข้อมูลสำหรับการลงทะเบียนและตรวจสอบบัญชี: จะถูกเก็บไว้จนกว่าจะเสร็จสิ้นกระบวนการตรวจสอบบัญชีหลังจบงาน (คาดว่าไม่เกิน 90 วัน)" /></ListItem>
            <ListItem><ListItemText primary={<b>• ข้อมูลสำหรับการวางแผนงานในปีถัดไป:</b>} secondary="จะถูกจัดเก็บรวบรวมไว้เป็นระยะเวลาไม่เกิน 2 ปี หรือจนกว่าการวางแผนงานครั้งถัดไปจะเสร็จสิ้น เพื่อใช้เป็นฐานข้อมูลอ้างอิงในการดำเนินงานของสมาคมฯ" /></ListItem>
            <ListItem><ListItemText primary="• ข้อมูลสมาชิกสมาคมฯ: จะถูกจัดเก็บถาวรในฐานข้อมูลสมาชิกของสมาคมฯ (ตามความประสงค์ของท่าน) เพื่อสิทธิประโยชน์ของสมาชิก" /></ListItem>
          </List>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            7. สิทธิ์ของท่านตาม PDPA
          </Typography>
          <Typography paragraph>
            ท่านมีสิทธิ์ในการขอเข้าถึง ขอรับสำเนา ขอแก้ไข หรือขอให้ลบข้อมูลส่วนบุคคลของท่านได้ (เว้นแต่การลบนั้นจะขัดต่อกฎหมายหรือกระทบต่อสัญญา) โดยสามารถติดต่อผู้ควบคุมข้อมูลส่วนบุคคล
          </Typography>
          <Typography paragraph>
            นอกจากนี้ หากท่านเห็นว่าการประมวลผลข้อมูลส่วนบุคคลของเราไม่สอดคล้องกับ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 ท่านมีสิทธิ์ที่จะร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.) ได้
          </Typography>

          <Typography variant="h6" fontWeight="bold" gutterBottom>
            8. ช่องทางการติดต่อ
          </Typography>
          <Box sx={{ p: 2, bgcolor: '#e3f2fd', borderRadius: 2, border: '1px dashed #1976d2' }}>
            <Typography variant="subtitle2" fontWeight="bold">ผู้ควบคุมข้อมูลส่วนบุคคล (Data Controller):</Typography>
            <Typography variant="body2">คณะผู้จัดงาน "เสือเหลืองคืนถิ่น" และ สมาคมนิสิตเก่าวิทยาศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</Typography>
            <Typography variant="body2">สถานที่: คณะวิทยาศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</Typography>
          </Box>

        </Paper>
      </Container>
    </Box>
  );
}