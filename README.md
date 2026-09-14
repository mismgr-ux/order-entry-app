# Order Entry App — Form → MySQL → Google Sheets

## Kaise kaam karta hai
1. User form fill karke submit karta hai (Party Name, Order Image/PDF, Sales Person, Remarks).
2. File server ke `uploads/` folder mein save hoti hai.
3. Data pehle **MySQL** table `orders` mein insert hota hai — yeh hamesha ka reliable record hai.
4. Insert successful hone ke baad, wahi row automatically **Google Sheet** mein append ho jaati hai.
5. Agar Sheet sync fail ho jaaye (internet issue, quota, etc.) to bhi data SQL mein safe rehta hai — `synced_to_sheet` column FALSE rahega, jise baad mein retry karke sync kiya ja sakta hai.

## Setup Steps

### 1. Project install karein
```bash
cd order-entry-app
npm install
```

### 2. PostgreSQL Database banayein
1. [PostgreSQL installer](https://www.postgresql.org/download/windows/) download aur install karein (isme pgAdmin bhi saath aata hai).
2. pgAdmin kholein, apne server se connect karein, aur ek nayi database banayein naam `order_entry`.
3. Us database ke andar **Query Tool** kholein aur `schema.sql` file ka content paste karke run (▶) karein — isse `orders` table ban jayega.

(Agar command line prefer karti hain: `psql -U postgres -d order_entry -f schema.sql`)

### 3. Google Sheets API setup karein
1. [Google Cloud Console](https://console.cloud.google.com/) mein jaayein, ek naya project banayein.
2. **APIs & Services → Library** mein jaake **Google Sheets API** enable karein.
3. **APIs & Services → Credentials → Create Credentials → Service Account** banayein.
4. Service account ke andar jaake **Keys → Add Key → JSON** se ek key file download karein — isko `credentials.json` naam dekar project folder mein rakh dein.
5. Ek naya Google Sheet banayein, uska pehla row header rakhein: `ID, Party Name, Sales Person, Remarks, File Path, Timestamp`.
6. Sheet ko **Share** karein us service account ke email address ke saath (jo `credentials.json` file ke andar `client_email` field mein milega) — **Editor** access dein.
7. Sheet ke URL se **Spreadsheet ID** copy karein (URL mein `/d/` aur `/edit` ke beech ka hissa).

### 4. `.env` file banayein
`.env.example` ko copy karke `.env` naam dein, aur apni values bharein:
```bash
cp .env.example .env
```

### 5. Server start karein
```bash
npm start
```
Browser mein kholein: `http://localhost:3000`

## Files
- `server.js` — main backend logic (upload, SQL insert, Sheets sync)
- `schema.sql` — MySQL table structure
- `public/index.html` — form UI
- `.env.example` — configuration template
- `uploads/` — uploaded order images/PDFs yahan save hoti hain

## Production notes
- `.env` aur `credentials.json` ko kabhi git mein commit na karein.
- Agar deploy kar rahe hain to `uploads/` folder ke bajaye S3/Cloud Storage use karna better rahega.
- Failed Sheet syncs ke liye ek cron job/retry script bana sakte hain jo `synced_to_sheet = FALSE` waale rows ko dobara try kare.
