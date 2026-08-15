# YeBet — የቤት ገበያ (Real version)

እውነተኛ የመረጃ ቋት (database)፣ ደህንነቱ የተጠበቀ password (bcrypt)፣ እና login (JWT) ያለው ትክክለኛ ድህረ ገጽ።
This is a real Node.js + Express + PostgreSQL app — not a demo. You need to deploy it yourself using the steps below.

---

## 1. የመረጃ ቋት (Database) መፍጠር — Supabase (ነጻ)

1. ወደ https://supabase.com ሂድ፣ በነጻ አካውንት ተመዝገብ (ካርድ አያስፈልግም)።
2. **New project** ተጫን፣ ስም ስጠው (ለምሳሌ `yebet`)፣ የይለፍ ቃል (database password) አዘጋጅ እና አስቀምጠው።
3. ፕሮጀክቱ ከተፈጠረ በኋላ ወደ **Project Settings → Database** ሂድ።
4. **Connection string** የሚለውን ፈልግ፣ "URI" የሚለውን ምረጥ፣ ኮፒ አድርገው። ይህ እንደዚህ ይመስላል፦
   `postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres`
5. ያንን ሙሉ ሊንክ (link) አስቀምጠው — በሚቀጥለው ደረጃ ያስፈልገናል።

## 2. ኮዱን ወደ GitHub መስቀል

1. https://github.com ላይ አካውንት ካልያዝክ ክፈት።
2. አዲስ repository ፍጠር (ለምሳሌ `yebet`)።
3. ይህን ፎልደር (ሁሉንም ፋይሎች) ወደዚያ repository ስቀል (upload)። ከፈለክ በቀጥታ ከ GitHub ድህረ ገጽ ላይ "Add file → Upload files" ተጠቅመህ ፋይሎቹን መጎተት (drag and drop) ትችላለህ።

## 3. ማስተናገጃ (Hosting) — Render (ነጻ)

1. ወደ https://render.com ሂድ፣ ከ GitHub አካውንትህ ጋር ተመዝገብ (ካርድ አያስፈልግም)።
2. **New → Web Service** ተጫን፣ ያንን GitHub repository ምረጥ።
3. እነዚህን አዘጋጅ፦
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. ወደ **Environment** ትር ሂድ፣ እነዚህን environment variables ጨምር፦
   - `DATABASE_URL` → ከ Supabase ያገኘኸው ሊንክ (ደረጃ 1)
   - `JWT_SECRET` → ማንኛውም ረጅም፣ የዘፈቀደ ጽሁፍ (ለምሳሌ `mySecretKey2026Yebet!`)
5. **Create Web Service** ተጫን። ጥቂት ደቂቃዎችን ይወስዳል።
6. ከጨረሰ በኋላ Render የሚሰጥህን ሊንክ (ለምሳሌ `https://yebet.onrender.com`) ክፈት — ድህረ ገጽህ ላይ ደርሰሃል!

**ማስታወሻ:** Render ነጻ አገልግሎት ለ15 ደቂቃ ጥቅም ላይ ካልዋለ ይተኛል (sleeps)፣ እና ቀጣዩ ጎብኝ ትንሽ (እስከ 30 ሰከንድ) መጠበቅ ይኖርበታል። ይሄ ለጅምር ጥሩ ነው፤ ትራፊክ ሲጨምር ወደ ተከፋይ (paid) እቅድ መቀየር ትችላለህ።

---

## Local testing (optional, if you want to test on your own computer first)

```bash
npm install
cp .env.example .env
# edit .env and paste your real DATABASE_URL and a JWT_SECRET
npm start
```

Then open http://localhost:3000

---

## What's real here

- Passwords are hashed with bcrypt — never stored as plain text
- Login uses signed JWT tokens
- Listings and messages are stored in a real PostgreSQL database
- Each user can only read/send messages in conversations they're part of

## What's still missing for a full production site

- Custom domain (e.g. `yebet.com`) — buy one from a registrar and point it at Render
- Image uploads for listing photos (currently just an icon) — would need a storage service like Cloudflare R2 or Supabase Storage
- Payments/escrow — Ethiopia has no major global payment gateway integration by default; you'd need a local provider
- Admin moderation tools, email verification, phone verification
- Rate limiting and spam protection on signup/messages

Happy to build any of these next — just say which one.
