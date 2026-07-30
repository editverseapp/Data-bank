# Data Bank — Real-Time Data Wallet

Ek real-time mobile-data wallet app: app khulte hi real device detection (5s) → Connect (anonymous, no login/password) → Carrier Pool ↔ Vault ke beech data save/withdraw (₹50 one-time activation, UPI, manual admin approval) → Family/P2P sharing → 30-din staking bonus.

Backend: **Supabase** (Postgres + Auth + Realtime). Sab data real hai — koi fake/demo/random number nahi.

## File Structure

```
data-bank-app/
├── index.html        # App markup
├── css/styles.css     # Styles
├── js/app.js          # Poora app logic (Supabase auth, realtime, payments, admin)
├── sql/setup.sql       # Database schema + security rules + functions (Supabase me run karna hai)
└── README.md
```

## Device Connect Flow (login ki jagah)

- App khulte hi **5 second** real device-detection animation chalta hai (browser APIs se genuine info nikalta hai)
- Android par model code (e.g. `RMX3998`) UI se parse hota hai aur Google Play ke public device-database (jsDelivr CDN se live fetch) se marketing name (e.g. "realme 12x 5g") match kiya jaata hai
- iOS/Desktop par exact model number kabhi nahi milta (Apple/browsers ye chhupate hain) — sirf device type/OS/browser dikhta hai, koi fake guess nahi
- "Connect" dabane par **5 second** connect-animation ke baad Supabase **anonymous auth** se real account ban jaata hai (email/password ki zaroorat nahi)
- Ye account us specific browser/device se judaa hota hai — agar user sign out kare ya browser data clear kare, purana data wapas nahi milega (naya anonymous account banega)
- **Admin** (payment approval ke liye) abhi bhi email/password se login karta hai — "Admin Login" link Connect screen ke neeche hai

## Setup (ek baar, ~10 min)

1. **Supabase project banao** — [supabase.com](https://supabase.com) → New Project (free tier)
2. **Database banao** — Supabase Dashboard → SQL Editor → New query → `sql/setup.sql` ka pura content paste karo → Run
3. **Email confirmation off karo** — Authentication → Sign In / Providers → Email → "Confirm email" ko OFF karo → Save
4. **Anonymous sign-ins ON karo** — Authentication → Sign In / Providers → "Allow anonymous sign-ins" ko ON karo → Save (⚠️ zaroori hai, iske bina Connect button fail karega)
5. **API keys lo** — Project Settings → API →
   - Project URL (e.g. `https://xxxxx.supabase.co`)
   - `anon` `public` API key (⚠️ `service_role`/`secret` key kabhi mat use karna client app me)
6. `index.html` browser me kholo (ya kisi static host pe deploy karo — neeche dekho) → setup screen me URL + key paste karo → Connect

## Deploy Karna (public users ke liye)

Ye sirf static files hain (HTML/CSS/JS), koi server-side build step nahi. Kahin bhi free me host ho sakta hai:

- **Netlify / Vercel**: folder drag-and-drop karo (drop zone) ya GitHub repo connect karo
- **GitHub Pages**: repo me push karo, Settings → Pages → branch select karo
- **Cloudflare Pages**: same tarah se direct upload

Deploy karne ke baad Supabase URL/Key waisi hi kaam karengi (public keys hain, client-side use ke liye safe design ki gayi hain — real security row-level policies se aati hai jo `setup.sql` me hai).

## Admin Access

Admin email hardcoded hai `js/app.js` me:
```js
const ADMIN_EMAIL = 'pinverse85@gmail.com';
```
Isi email se signup/login karne par app ke bottom-nav me "Admin" tab dikhega, jahan se ₹50 payment requests (UTR ke saath) approve/reject kar sakte ho. Admin badalna ho toh yahi line edit karo.

## UPI Payment (activation gate)

- UPI ID: `arjutrehman@naviaxis`, Amount: ₹50 (dono `js/app.js` ke top me constants hain — `UPI_ID`, `PAYMENT_AMOUNT`)
- Payment automatic verify nahi hoti (koi bhi web app third-party UPI payment automatically verify nahi kar sakta bina payment-gateway/KYC account ke) — user UTR daalta hai, admin manually approve karta hai, phir turant (real-time) Save/Withdraw unlock ho jaata hai.

## Important Limitations (kisi bhi tech stack se possible nahi)

- **Real SIM/carrier data balance automatically read/modify** karna kisi bhi third-party app (web ya native) se possible nahi hai — sirf telecom company ki khud ki official app ye kar sakti hai. Isliye Carrier Pool manually settings me set karna padta hai.
- **Automatic UPI payment verification** ke liye ek payment-gateway account (Razorpay/Cashfree) chahiye hota hai jisme business KYC hoti hai — abhi manual admin-approval flow hai.

## Security Note

`sql/setup.sql` ki Row Level Security policies kisi bhi logged-in user ko `users`, `transactions`, `connections`, `payment_requests` tables padhne/likhne deti hain (family/P2P transfer feature ke liye zaroori hai, kyunki client-side se doosre user ka balance update karna padta hai). Ye personal/family-scale use ke liye theek hai. Bade production/public app ke liye in policies ko tighten karna chahiye (per-column restrictions, ya Postgres functions ke through hi saara access route karna — jo already `save_data`, `withdraw_data`, `send_data` jaise functions me kiya gaya hai).
