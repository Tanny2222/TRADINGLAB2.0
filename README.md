# Trading Journal

เว็บแอปบันทึก trading journal แบบละเอียด (ตามเทมเพลต Plan · Execute · Review · Improve) — ใช้งานได้บน iPad, วาดโน้ต/annotate รูปด้วย Apple Pencil ได้, และอัปโหลดรูปขึ้น Google Drive ของคุณเองโดยตรง ไม่มี backend/server ต้องดูแล — เป็น static site ล้วน ๆ ใช้กับ GitHub Pages ได้ทันที

## โครงสร้างไฟล์
```
index.html   หน้าเว็บหลัก
style.css    ดีไซน์
app.js       โลจิกทั้งหมด (ฟอร์ม, canvas วาดรูป, Google Drive)
config.js    ใส่ Google Client ID ของคุณที่นี่ (ขั้นตอนด้านล่าง)
```

## ขั้นตอนที่ 1 — ตั้งค่า Google Cloud (ทำครั้งเดียว)

1. เข้า https://console.cloud.google.com/ แล้วสร้างโปรเจกต์ใหม่ (ชื่ออะไรก็ได้ เช่น `trading-journal`)
2. ไปที่เมนู **APIs & Services > Library** ค้นหา **Google Drive API** แล้วกด **Enable**
3. ไปที่ **APIs & Services > OAuth consent screen**
   - User Type: เลือก **External**
   - กรอกชื่อแอป, อีเมลตัวเอง แล้วกด Save ไปเรื่อย ๆ
   - ในหน้า **Test users** ให้เพิ่มอีเมล Gmail ของคุณเอง (บัญชีที่จะใช้ล็อกอินตอนใช้งานแอป)
   - Publishing status ปล่อยเป็น **Testing** ได้เลย ไม่ต้องส่งให้ Google ตรวจสอบ เพราะสิทธิ์ที่ขอ (`drive.file`) เป็นสิทธิ์ระดับต่ำ (เข้าถึงได้เฉพาะไฟล์ที่แอปสร้างเอง) — ใช้กับ test user สูงสุด 100 คนได้โดยไม่ต้องขอ verify
4. ไปที่ **APIs & Services > Credentials > Create Credentials > OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins ใส่:
     - `https://<ชื่อ-github-username>.github.io` (โดเมนจริงตอน deploy)
     - `http://localhost:5500` (ถ้าอยากทดสอบในเครื่องก่อน เช่นด้วย VSCode Live Server)
   - กด Create แล้ว **คัดลอก Client ID** (จะลงท้ายด้วย `.apps.googleusercontent.com`)
5. เปิดไฟล์ `config.js` แล้ววาง Client ID ลงในบรรทัด:
   ```js
   const GOOGLE_CLIENT_ID = "วาง-client-id-ของคุณที่นี่.apps.googleusercontent.com";
   ```

> หมายเหตุ: แอปขอสิทธิ์แบบ `drive.file` เท่านั้น หมายความว่าแอปจะเข้าถึง **เฉพาะไฟล์ที่แอปนี้อัปโหลดเอง** ไม่สามารถอ่านไฟล์อื่นในไดรฟ์ของคุณได้ และรูปที่อัปโหลดจะถูกตั้งสิทธิ์เป็น "ทุกคนที่มีลิงก์ดูได้" (Anyone with the link) เพื่อให้แอปแสดง thumbnail ได้โดยไม่ต้องล็อกอินใหม่ทุกครั้ง — ถ้าต้องการความเป็นส่วนตัวสูงกว่านี้ สามารถเข้าไปปรับสิทธิ์ไฟล์ในโฟลเดอร์ `TradingJournalImages` บน Drive ได้ภายหลัง

## ขั้นตอนที่ 2 — Deploy ขึ้น GitHub Pages

1. สร้าง repository ใหม่บน GitHub เช่น `trading-journal`
2. อัปโหลดไฟล์ทั้ง 4 ไฟล์ (`index.html`, `style.css`, `app.js`, `config.js`) ขึ้น repo (จะ push ผ่าน git หรือลากไฟล์ขึ้นหน้าเว็บ GitHub ก็ได้)
3. ไปที่ **Settings > Pages**
   - Source: เลือก branch `main`, โฟลเดอร์ `/ (root)`
   - กด Save
4. รอสักครู่ เว็บจะอยู่ที่ `https://<username>.github.io/trading-journal/`
5. ถ้าตอนตั้งค่า OAuth (ขั้นตอนที่ 1) ยังไม่ได้ใส่โดเมนนี้ ให้กลับไปเพิ่มใน **Authorized JavaScript origins** แล้วรอ 1-2 นาทีให้ Google อัปเดต

## วิธีใช้งาน

- เปิดเว็บ (จะดีที่สุดถ้าเปิดจาก Safari บน iPad แล้ว "Add to Home Screen" เพื่อใช้เหมือนแอป)
- กด **เชื่อมต่อ Google Drive** มุมขวาบนครั้งแรก แล้วล็อกอินด้วย Gmail ที่เพิ่มเป็น test user ไว้
- กรอกฟอร์มเทรดตามช่องต่าง ๆ
- แตะช่องรูปภาพ (เช่น "Higher Timeframe") เพื่อเปิดหน้าต่างแนบรูป → เลือกรูปจากคลังภาพ/ถ่ายรูป หรือ paste รูปที่ copy มา → ใช้นิ้วหรือ Apple Pencil วาดทับรูปได้เลย (เลือกสี/ขนาดปากกาได้) → กด **☁ อัปโหลดขึ้น Drive**
- ปุ่ม **✏ วาดโน้ตมือ** ใต้ช่อง Notes ใช้เขียนโน้ตด้วยลายมือแทนการพิมพ์ได้เช่นกัน
- ให้คะแนน Trade Review ด้วยดาว, เลือก Tags, แล้วกด **💾 บันทึกเทรด**
- ดูเทรดทั้งหมดที่หน้า **รายการเทรด** ค้นหาด้วยชื่อ asset หรือ tag ได้
- ปุ่ม **Export JSON** ใช้สำรองข้อมูลฟอร์มทั้งหมด (ไม่รวมตัวไฟล์รูป เพราะรูปเก็บอยู่บน Drive อยู่แล้ว)

## ข้อควรรู้ / ข้อจำกัด

- **ข้อมูลฟอร์ม** (ตัวเลข, ข้อความ, tag, คะแนน) เก็บอยู่ใน localStorage ของเบราว์เซอร์เครื่องนั้น ๆ เท่านั้น — ถ้าเปลี่ยนเครื่อง/เบราว์เซอร์ หรือล้าง cache จะหายไป แนะนำให้กด Export JSON สำรองไว้เป็นระยะ
- **รูปภาพ** เก็บบน Google Drive จริง ปลอดภัยกว่าและใช้พื้นที่ browser storage น้อย
- Token การเข้าถึง Drive จะหมดอายุประมาณ 1 ชั่วโมง กด "เชื่อมต่อ Google Drive" ซ้ำได้ทุกเมื่อถ้าอัปโหลดไม่ผ่าน
- ต้องการหลายคนใช้งานพร้อมกัน/sync ข้ามเครื่องแบบเรียลไทม์ — เวอร์ชันนี้ยังไม่รองรับ (เป็น local-only + Drive สำหรับรูป) หากต้องการ sync ข้อมูลฟอร์มข้ามเครื่องด้วย แจ้งได้ เดี๋ยวต่อยอดให้ใช้ Google Sheets หรือ Firebase เป็นฐานข้อมูลกลาง
