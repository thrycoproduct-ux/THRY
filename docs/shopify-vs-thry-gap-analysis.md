# THRY vs Shopify Standard — Gap Analysis

Saved: 28 Aug 2026  
Site: thryco.com  
Stack: Next.js + Supabase + Razorpay + Cloudflare + Vercel

---

## Summary

Traffic is **not** the main problem. Cloudflare shows roughly **600–1,400 unique visitors/day**.  
Paid orders are **1–10/day** vs **~30 on Shopify** because **conversion + marketing automation** are weaker, plus site reliability issues (Aug 26–28).

| Metric | Typical Shopify era | THRY now |
|--------|---------------------|----------|
| Daily visitors | Similar traffic assumed | ~591–1,237/day (Cloudflare) |
| Paid orders | ~30 (your usual) | 1–10/day recent |
| Bottleneck | — | Few reach checkout; fewer complete Razorpay |

---

## What THRY Already Has (vs Shopify)

- Guest + login checkout
- Razorpay / Cashfree / PhonePe + webhooks
- Promo codes, GST, flat shipping rules (TN / south / rest of India)
- Order confirmation email + dispatch email (Resend)
- WhatsApp after payment (Meta template)
- Admin: orders, dispatch, tracking, packing slip PDF
- Wishlist, search, collections
- SEO: sitemap, robots, JSON-LD
- Stock reservation + release cron
- Microsoft Clarity (sessions/recordings)
- Dashboard: revenue, orders, low-stock alerts

**Core shop works.** This is a real store, not empty.

---

## What's Missing vs Shopify Standard

### 1. Conversion & checkout (biggest gap)

| Shopify | THRY |
|---------|------|
| Fast, trusted checkout | Custom checkout — more friction |
| Shop Pay / saved cards | Razorpay modal only |
| **Abandoned cart recovery emails** | **Missing** — admin shows outcome only |
| Address autocomplete, upsells | Missing |

### 2. Marketing (Shopify’s main advantage)

| Shopify | THRY |
|---------|------|
| Abandoned cart email/SMS | **Missing** |
| Newsletter / email campaigns | **Missing** |
| Meta Pixel + Google Ads | **Missing** (Clarity only) |
| BOGO, auto discounts, segments | Simple % promo codes only |

### 3. Trust & social proof

| Shopify | THRY |
|---------|------|
| Product reviews (apps) | **Missing** — review UI disabled |
| App ecosystem | Custom build only |
| Testimonials | Admin CMS only (not per-product reviews) |

### 4. Customer experience

| Shopify | THRY |
|---------|------|
| Full account page | Account page is a stub |
| Admin refunds | **No refund API/UI** |
| SMS order updates | Email + WhatsApp at some steps only |

### 5. Shipping

| Shopify | THRY |
|---------|------|
| Carrier rates + labels | Flat rules + manual tracking |
| Auto tracking updates | Dispatch email when admin dispatches |

### 6. Reliability & ops

| Shopify | THRY |
|---------|------|
| Hosted 99.9% uptime | Self-managed (Vercel + Supabase + CF) |
| No DevOps | DB pooler issues hurt sales (Aug 26–28) |

---

## Top 5 Reasons: Shopify ~30 orders vs THRY ~1–10

1. **No abandoned cart recovery** — Shopify emails/WhatsApps people who left; THRY does not.
2. **No Meta Pixel / Google Ads** — harder to run and measure Instagram ads.
3. **Weaker checkout** — more drop-off before Razorpay.
4. **No product reviews** — less trust on custom site vs Shopify themes.
5. **Site bugs this week** — EMAXCONN, dispatch, cart pricing errors (now fixed).

---

## Cloudflare Visit Data (thryco.com)

**Where to see:** dash.cloudflare.com → thryco.com → Analytics & Logs → Traffic  
**Use:** **Unique visitors** (not Requests).

| Date | Unique visitors | Page views | Paid orders (DB) |
|------|-----------------|------------|------------------|
| Aug 21 | 1,210 | 2,981 | 1 |
| Aug 22 | 1,170 | 2,704 | 1 |
| Aug 23 | 1,112 | 2,904 | 3 |
| Aug 24 | 964 | 2,545 | 0 |
| Aug 25 | 1,433 | 3,562 | 1 |
| Aug 26 | 189* | 555 | 10 |
| Aug 27 | 1,237 | 3,019 | 3 |
| Aug 28 | ~591** | ~1,625 | 1 |

\*Aug 26 visitor count unreliable — site had DB/pooler failures.  
\*\*Partial day when captured.

**Today (Aug 28):** ~591 visitors, 2 checkout starts, 1 paid — traffic OK, conversion low.

---

## Where to Count Visits (properly)

| Tool | What it shows | URL |
|------|---------------|-----|
| **Cloudflare Traffic** | Unique visitors, requests | dash.cloudflare.com |
| **Microsoft Clarity** | Sessions, recordings, drop-off | clarity.microsoft.com (project `y96ro8g9cl`) |
| **Vercel Analytics** | Visitors (if enabled) | vercel.com → project → Analytics |
| **Admin orders** | Sales only — **not** visits | thryco.com/admin |

---

## Cron & Stock (current setup)

| Job | How it runs |
|-----|-------------|
| Release expired stock holds | **Vercel cron** every 10 min → `/api/cron/release-expired-stock-reservations` |
| Same sweep at checkout | **Fallback** when customer starts checkout |
| Cart pricing | **No sweep** (read-only — fixed THRY-V) |
| Lifecycle cleanup | API exists; GitHub Action manual only |
| Razorpay unpaid recovery | API exists; not on Vercel schedule |

**CRON_SECRET** must be set in Vercel for cron auth.

---

## Production Fixes Pushed (Aug 28, 2026)

| Commit | Fix |
|--------|-----|
| `dae477e` | Dispatch: atomic SQL (no transaction race) |
| `635799d` | Cart pricing: remove stock sweep; Vercel cron |
| `4089844` | Stock release: session pooler (port 5432) for transactions |

---

## Priority to Close Shopify Gap

1. **Abandoned cart recovery** (WhatsApp or email for unpaid orders)
2. **Meta Pixel** (+ optional Google Ads conversion tag)
3. **Product reviews** (enable + moderate)
4. **Checkout polish** (mobile speed, trust badges, simpler flow)
5. **Stability** (keep monitoring Sentry + Cloudflare)

---

## Bottom Line

**Missing is not “a shop.”**  
**Missing is Shopify’s growth layer:** abandoned cart, ad tracking, reviews, refunds, marketing automation, and always-on reliability.

Fix stability first (done this week). Next: **turn 1,000 visitors into 30 orders** with recovery + ads + reviews.
