# Mobile & Responsive Viewport Performance Report
**Project:** eFootball Tournament Platform  
**Target Viewports:** 
- Mobile: 390x844 (iPhone 14 Pro profile, touch enabled)
- Tablet: 768x1024 (iPad profile)
**Date:** 2026-11-12T21:42:00+05:30  

---

## 1. Mobile Responsiveness Benchmark (390x844)

| Category | Route | Initial Load | Repeat Load | Touch Targets | Mobile UI Stability |
|:---|:---|:---:|:---:|:---:|:---:|
| **Public** | `/` | 158 ms | 33 ms | ≥ 44px pill nav | Fully fluid |
| **Public** | `/tournaments` | 49 ms | 125 ms | Virtualized list | Stable |
| **Public** | `/live` | 25 ms | 47 ms | Ticker badge | Realtime sync |
| **Dashboard** | `/dashboard` | 1,769 ms | 1,070 ms | Tab pills | Zero layout shift |
| **Dashboard** | `/dashboard/tournaments` | 512 ms | 547 ms | Card CTA | Instant |
| **Dashboard** | `/dashboard/matches` | 356 ms | 741 ms | Action triggers | Clean |
| **Dashboard** | `/dashboard/wallet` | 552 ms | 868 ms | Transaction rows | Responsive |
| **Dashboard** | `/dashboard/career` | 844 ms | 395 ms | Stat cards | Responsive |
| **Dashboard** | `/dashboard/notifications` | 341 ms | 732 ms | Dismiss buttons | Touch-optimized |
| **Dashboard** | `/dashboard/settings` | 359 ms | 400 ms | Form controls | Mobile inputs |
| **Dashboard** | `/dashboard/tickets` | 669 ms | 1,049 ms | Ticket list | Touch scroll |
| **Admin** | `/admin/dashboard` | 1,321 ms | 1,364 ms | Mobile drawer | Clean sidebar |
| **Admin** | `/admin/matches` | 709 ms | 741 ms | Action modals | Responsive |
| **Admin** | `/admin/tickets` | 2,789 ms | 1,824 ms | Desk filter | Filter drawer |

---

## 2. Tablet Responsiveness Benchmark (768x1024)

| Category | Route | Initial Load | Repeat Load | Experience |
|:---|:---|:---:|:---:|:---:|
| **Dashboard** | `/dashboard` | 1,474 ms | 407 ms | Native tablet layout |
| **Dashboard** | `/dashboard/tournaments` | 523 ms | 546 ms | Grid 2-column cards |
| **Dashboard** | `/dashboard/matches` | 705 ms | 407 ms | Split vs view |
| **Dashboard** | `/dashboard/wallet` | 568 ms | 529 ms | Financial chart active |

---

## 3. Native App Feel Optimizations Verified
1. **Overscroll Behavior:** Set to `contain` on modal bodies and drawers to prevent accidental pull-to-refresh on mobile Safari / Chrome.
2. **Touch-Action Manipulation:** `touch-action: manipulation` applied to buttons to eliminate 300ms tap delays.
3. **Safe Area Insets:** `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` respected on fixed navigation bars.
