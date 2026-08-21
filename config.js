// ============================================================
// ตั้งค่า Google Drive — ดูขั้นตอนแบบละเอียดใน README.md
// ============================================================
// 1. ไปที่ https://console.cloud.google.com/ -> สร้างโปรเจกต์ใหม่
// 2. เปิดใช้งาน "Google Drive API" และ "Google Sheets API"
// 3. ไปที่ APIs & Services > Credentials > Create Credentials > OAuth client ID
//    - Application type: Web application
//    - Authorized JavaScript origins: ใส่โดเมนเว็บของคุณ เช่น
//         https://<your-username>.github.io
//         http://localhost:5500   (สำหรับทดสอบในเครื่อง)
// 4. คัดลอก Client ID มาใส่ด้านล่างนี้

const GOOGLE_CLIENT_ID = "259856918388-0bb4f9t80imt8tvm1m5eqcqpbtaeurkc.apps.googleusercontent.com";

// ชื่อโฟลเดอร์ใน Google Drive ที่จะใช้เก็บรูปเทรด (จะถูกสร้างอัตโนมัติถ้ายังไม่มี)
const DRIVE_FOLDER_NAME = "TradingJournalImages";
const TRADING_SHEET_NAME = "TradingJournalData";

// ขอบเขตสิทธิ์: Drive สำหรับไฟล์ที่แอปสร้าง และ Sheets สำหรับอ่าน/เขียน TradingJournalData
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
