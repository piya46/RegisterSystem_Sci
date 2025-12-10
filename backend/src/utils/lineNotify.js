const axios = require('axios');

exports.sendLineDonationAlert = async (donationData) => {
  try {
    // 1. ดึงข้อมูลที่จำเป็นออกมา (รวมถึงข้อมูล Package)
    const { 
      firstName, 
      lastName, 
      amount, 
      transferDateTime, 
      source,
      isPackage,
      packageType,
      size
    } = donationData;
    
    // 2. แปลงวันที่เป็น format ไทย
    const dateStr = new Date(transferDateTime).toLocaleString('th-TH', { 
      timeZone: 'Asia/Bangkok',
      dateStyle: 'medium', 
      timeStyle: 'short' 
    });

    // 3. แปลง source เป็นคำที่เข้าใจง่าย
    let sourceText = source;
    switch (source) {
      case 'PRE_REGISTER':
        sourceText = 'ระบบลงทะเบียน';
        break;
      case 'SUPPORT_SYSTEM':
        sourceText = 'ระบบสนับสนุน';
        break;
      default:
        sourceText = source || 'ไม่ระบุ';
    }

    // 4. [ใหม่] สร้างข้อความรายละเอียดรายการ (Package Details)
    let detailsText = "บริจาคทั่วไป";
    if (isPackage) {
      detailsText = packageType || "แพ็กเกจไม่ระบุชื่อ";
      if (size) {
        detailsText += ` (Size: ${size})`;
      }
    }

    const messagePayload = {
      to: process.env.LINE_GROUP_ID, 
      messages: [
        {
          type: "flex",
          altText: `ได้รับยอดบริจาค ${amount.toLocaleString()} บาท`,
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: "💸 ได้รับการสนับสนุนใหม่", weight: "bold", color: "#1DB446", size: "sm" },
                { type: "text", text: `${amount.toLocaleString()} THB`, weight: "bold", size: "3xl", margin: "md", color: "#000000" },
                { type: "separator", margin: "lg" },
                {
                  type: "box",
                  layout: "vertical",
                  margin: "lg",
                  spacing: "sm",
                  contents: [
                    {
                      type: "box",
                      layout: "baseline",
                      spacing: "sm",
                      contents: [
                        { type: "text", text: "ผู้บริจาค:", color: "#aaaaaa", size: "sm", flex: 2 },
                        { type: "text", text: `${firstName} ${lastName}`, wrap: true, color: "#666666", size: "sm", flex: 5, weight: "bold" }
                      ]
                    },
                    // [ใหม่] เพิ่มแถวแสดงรายการ (Package)
                    {
                      type: "box",
                      layout: "baseline",
                      spacing: "sm",
                      contents: [
                        { type: "text", text: "รายการ:", color: "#aaaaaa", size: "sm", flex: 2 },
                        { type: "text", text: detailsText, wrap: true, color: "#333333", size: "sm", flex: 5 }
                      ]
                    },
                    {
                      type: "box",
                      layout: "baseline",
                      spacing: "sm",
                      contents: [
                        { type: "text", text: "เวลาโอน:", color: "#aaaaaa", size: "sm", flex: 2 },
                        { type: "text", text: dateStr, wrap: true, color: "#666666", size: "sm", flex: 5 }
                      ]
                    },
                    {
                      type: "box",
                      layout: "baseline",
                      spacing: "sm",
                      contents: [
                        { type: "text", text: "ช่องทาง:", color: "#aaaaaa", size: "sm", flex: 2 },
                        { type: "text", text: sourceText, wrap: true, color: "#666666", size: "sm", flex: 5 }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        }
      ]
    };

    await axios.post('https://api.line.me/v2/bot/message/push', messagePayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });
    
    console.log('Line message sent successfully');
  } catch (error) {
    console.error('Line message error:', error.response ? error.response.data : error.message);
  }
};