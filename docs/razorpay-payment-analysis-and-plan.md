# Razorpay Payment Analysis & Robust Fix Plan

Saved: 28 Aug 2026  
Site: thryco.com | Payment: Razorpay (primary)

---

## Aug 26 — Your Best Day (28 checkout starts, 10 paid)

| Time (IST) | Order ID | Status | Razorpay Payment ID |
|------------|----------|--------|---------------------|
| 07:31 | cawm49... | **unpaid** | None — customer didn't open Razorpay |
| 07:32 | ohpx4h... | **unpaid** | None |
| 07:46 | hmp3tf... | **unpaid** | None |
| 07:47 | k7ywp7... | **unpaid** | None |
| 07:53 | h8ze0n... | **canceled** | pay_TUESrj... (PAID on Razorpay, lost here!) |
| 07:58 | ebz06d... | **paid** ✓ | pay_TUEXSu... |
| 09:03 | apv100... | **unpaid** | None |
| 09:18 | yyhjno... | **paid** ✓ | pay_TUFtWN... |
| 10:24 | th5ule... | **paid** ✓ | pay_TUH2Hv... |
| 10:40 | i6rc4r... | **paid** ✓ | pay_TUHIJRo... |
| 10:42 | j1o1g3... | **unpaid** | None |
| 10:43 | w5beqm... | **paid** ✓ | pay_TUHLdW... |
| 10:48 | x0i0th... | **paid** ✓ | pay_TUHRYb... (dispatch was broken) |
| 12:35 | ggx69u... | **canceled** | pay_TUJGKp... (PAID on Razorpay, lost here!) |
| 12:40 | fel3qi... | **unpaid** | None |
| 12:47 | ubyf80... | **canceled** | pay_TUJST8... (PAID on Razorpay, lost here!) |
| 13:05 | l5pn1q... | **unpaid** | None |
| 13:08 | g1eawf... | **unpaid** | None |
| 13:09 | zakgct... | **unpaid** | None |
| 13:19 | wb2fw4... | **paid** ✓ | pay_TUK0ts... |
| 14:25 | mtbolj... | **canceled** | pay_TUL873... (PAID on Razorpay, lost here!) |
| 17:57 | r2ic3c... | **paid** ✓ | pay_TUOnCm... |
| 18:58 | luane2... | **unpaid** | None |
| 19:30 | bzbypg... | **paid** ✓ | pay_TURuWi... |
| 20:04 | qbwqoy... | **unpaid** | None |
| 20:04 | hf7iah... | **unpaid** | None |
| 22:24 | xltr75... | **unpaid** | None |
| 23:58 | k8bdmr... | **paid** ✓ | pay_TUUu0t... |

### Summary for Aug 26:
- **28 checkouts started**
- **10 paid** (successful)
- **14 unpaid, no Razorpay payment** = customer abandoned before/during Razorpay modal
- **4 canceled WITH Razorpay payment ID** = **CUSTOMER PAID BUT SITE DIDN'T CAPTURE IT**

---

## The Core Problems (What Customers Are Facing)

### Problem 1: LOST PAYMENTS (Critical — 4 orders on Aug 26 alone!)

7 orders in last 14 days have **Razorpay payment ID but show unpaid/canceled** in your system.

**What happened:** Customer completed UPI/card payment → Razorpay captured money → but:
- Browser closed before verify callback
- OR verify API timed out (DB connection issues)
- OR webhook failed (signature/connection error)

**Result:** Customer thinks they paid. Money is with Razorpay. But THRY shows "unpaid" → no dispatch → customer contacts you.

### Problem 2: HIGH ABANDONMENT (14/28 = 50% on Aug 26)

14 people started checkout but **never opened Razorpay** or closed it immediately.

**Possible reasons:**
- Razorpay checkout.js slow to load (especially on mobile)
- Total amount higher than expected (shipping/GST surprise)
- No trust signals on checkout page
- Razorpay modal blocked by browser/popup blocker
- Customer just browsing/comparing

### Problem 3: NO RECOVERY MECHANISM

When someone abandons:
- **No WhatsApp/SMS reminder** ("Complete your order!")
- **No email** with cart link
- **No payment link** sent manually
- Recovery cron only catches the rare UPI timeout (not abandonment)

---

## What Razorpay Offers (You're Not Using)

### A. Razorpay Magic Checkout (one-click checkout)
- **One-tap login** with phone number (auto-prefill address/name)
- **Abandoned cart webhook** — Razorpay tells you exactly when/where customer dropped
- **WhatsApp recovery** with payment link — customer clicks → pays without re-entering details
- **COD option** (dynamic, risk-based)
- **Auto-submit OTP** (faster UPI/card approval)
- **Integration:** Requires 3 server APIs (shipping info, get promotions, apply promotions)
- **Status:** On-demand feature — **contact Razorpay team to enable**

### B. Payment Links (manual recovery)
- **Send payment link** via WhatsApp/SMS to unpaid customers
- Customer clicks → pays → order auto-marked paid
- **You can do this NOW from Razorpay Dashboard** (no code needed)
- Also available via API: `POST /v1/payment_links`

### C. Smart Retry (automatic)
- `retry: { enabled: true }` — **already set** in your code ✓
- But only retries within the same modal session
- If customer **closes modal**, no retry happens

### D. Webhooks (you have these — but they may be failing)
- `payment.captured` ✓
- `payment.authorized` ✓
- `order.paid` ✓
- `payment.failed` ✓
- **But:** DB errors (EMAXCONN/onclose) may have caused webhook processing to fail silently

### E. Recovery Cron (you have — but not scheduled)
- `/api/cron/recover-unpaid-razorpay` — polls Razorpay API for captured payments
- **Not on Vercel cron schedule** — only runs manually or lazily from admin

---

## Last 14 Days Payment Stats

| Metric | Count |
|--------|-------|
| Total orders | 77 |
| Paid | 29 (37.6%) |
| Unpaid | 48 (62.4%) |
| **Unpaid WITH Razorpay payment** (money taken, site lost it) | **7** |
| Unpaid without payment attempt | 41 |
| Canceled | 7 |

**Key insight:** Out of 48 unpaid, **7 actually paid on Razorpay** but your site never confirmed them. That's **~24% of your paid orders** getting lost.

---

## Robust Fix Plan (Priority Order)

### Phase 1: STOP LOSING PAID ORDERS (do this week)

| Action | What | Effort |
|--------|------|--------|
| **Schedule Razorpay recovery cron** | Add to `vercel.json`: run `/api/cron/recover-unpaid-razorpay` every 5 min | 5 min (config) |
| **Recover existing 7 lost orders** | Run `scripts/recover-unpaid-razorpay-orders.ts` NOW | 2 min |
| **Harden webhook** | Add withRetry around webhook sync (same as dispatch fix) | 30 min |
| **Add session pooler** to webhook sync | Webhook uses transactions → same onclose bug | Already done for stock; extend to payment sync |

### Phase 2: ABANDONED CART RECOVERY (this week / next week)

| Action | What | Effort |
|--------|------|--------|
| **WhatsApp abandoned cart** | For orders unpaid >15 min with customer phone: send "Complete your order" WhatsApp with payment link | 2–4 hours |
| **Razorpay Payment Links API** | Generate a fresh payment link per unpaid order → embed in WhatsApp/email | 2–3 hours |
| **Abandoned order email** | Same as WhatsApp but via Resend email | 2 hours |
| **Scheduled job** | New cron every 15–30 min: find recent unpaid orders → send recovery message (once only) | 2 hours |

### Phase 3: RAZORPAY MAGIC CHECKOUT (next 2 weeks)

| Action | What | Effort |
|--------|------|--------|
| **Contact Razorpay** | Request Magic Checkout activation on your account | 1 day wait |
| **Build 3 APIs** | Shipping Info, Get Promotions, Apply Promotions | 1–2 days |
| **Switch to magic-checkout.js** | Replace current Razorpay modal with `one_click_checkout: true` | 1 day |
| **Dashboard config** | Register API URLs, enable abandoned cart webhook | 30 min |
| **COD option** (optional) | Dynamic COD via Magic Checkout | Config only |

### Phase 4: TRUST & CONVERSION (ongoing)

| Action | What | Effort |
|--------|------|--------|
| **Meta Pixel** | Track Add-to-Cart, Checkout, Purchase events | 2 hours |
| **Google Ads tag** | Conversion tracking for paid orders | 1 hour |
| **Product reviews** | Enable review submission + display | 1 day |
| **Trust badges on checkout** | "Secure payment", "Free returns", delivery estimate | 2 hours |
| **Faster checkout** | Preload Razorpay, reduce steps, show total early | 1 day |

---

## What Razorpay Standard Checkout Should Have (vs What You Have)

| Razorpay Feature | Your Setup | Status |
|------------------|-----------|--------|
| Standard Checkout (modal) | ✓ Integrated | Working |
| `retry: { enabled: true }` | ✓ Set | Working |
| Webhook signature verify | ✓ Implemented | Working |
| Payment verification (server-side) | ✓ `/api/razorpay/verify` | Working |
| Prefill (name, email, phone) | ✓ `session.prefill` | Working |
| **Automatic payment recovery cron** | Code exists, **NOT scheduled** | ⚠️ FIX NOW |
| **Magic Checkout** | Not integrated | ❌ Missing |
| **Abandoned Cart Webhook** | Not integrated | ❌ Missing |
| **Payment Links (recovery)** | Not used | ❌ Missing |
| **WhatsApp recovery** | Not used for abandoned | ❌ Missing |
| **COD option** | Not available | ❌ Missing |
| **UPI Intent (app-to-app)** | Razorpay handles | ✓ (via modal) |
| **Offers/rewards on checkout** | Not integrated | ❌ Missing |

---

## What Was Fixed (28 Aug 2026)

### Critical Fixes (already applied):
1. **Razorpay recovery cron scheduled** — runs every 5 min, auto-catches missed payments
2. **Abandoned cart recovery cron** — runs every 30 min, sends payment links via WhatsApp
3. **Webhook retry resilience** — all 3 webhooks (Razorpay, Cashfree, PhonePe) now retry 3x on transient DB errors
4. **Verify route** — Razorpay verify now retries 3x on DB failure (was losing payments on timeout)
5. **Checkout session** — switched to session pooler (port 5432) for order creation transaction
6. **UPI dismiss recovery** — when customer closes Razorpay modal, client polls to check if payment went through anyway
7. **Payment Links API** — integrated Razorpay payment_links for abandoned cart recovery
8. **Admin send-recovery-link** — manual button in admin to send payment link to any unpaid order
9. **Payment status endpoint** — lightweight `/api/orders/payment-status` for client-side polling

### Remaining Action (manual):
1. **Run manual recovery** for the 7 lost orders
2. **Verify webhook secret** is correct in admin settings (Razorpay Dashboard → Webhooks)
3. **Check Razorpay Dashboard** → Settings → Webhooks → ensure thryco.com webhook URL is active and showing recent deliveries

---

## Why Customers Say "Payment Failed" (What Actually Happens)

| Customer sees | What actually happened | Your system shows |
|---------------|----------------------|-------------------|
| "I paid but order not confirmed" | UPI completed → browser closed → webhook failed | unpaid/canceled |
| "Payment deducted but no order" | Same as above — money captured, sync lost | unpaid with rzp_payment_id |
| "Checkout not working" | Razorpay modal didn't open (slow CDN / popup blocker) | order created, never paid |
| "Error on payment page" | DB timeout during verify → generic error to customer | unpaid |

**Fix:** Recovery cron (catches UPI close), better webhook resilience (catches failed sync), abandoned cart WhatsApp (catches abandoners).

---

## Bottom Line

**Aug 26 you could have had 14 paid orders instead of 10** — 4 were genuinely paid but lost.  
**You could recover 30–50% of abandoners** with WhatsApp payment links.  
**Magic Checkout would further cut abandonment** with one-click + COD + auto-prefill.

Priority: **Recovery cron → WhatsApp abandoned cart → Magic Checkout**
