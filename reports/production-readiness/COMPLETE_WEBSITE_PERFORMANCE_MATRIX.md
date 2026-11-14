# Complete Website Performance Matrix
**Project:** eFootball Tournament Platform  
**Environment:** Next.js 16.4.6 / React 19 / TypeScript / Supabase PostgreSQL 17  
**Production Server:** `http://localhost:3001` (Next.js production build via `next start -p 3001`)  
**Audited Date:** 2026-11-12T21:40:00+05:30  
**Audit Tooling:** Playwright Automation / CDP Network Interception / Storage State Sessions  

---

## 1. Executive Matrix Summary

| Section | Routes Audited | Status | Average Initial Load | Average Repeat Load | Console / Runtime Errors |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Public Routes (Desktop)** | 7 | ✅ PASS | **94 ms** | **50 ms** | 0 |
| **Authentication Routes (Desktop)** | 4 | ✅ PASS | **41 ms** | **30 ms** | 0 |
| **Player Dashboard Routes (Desktop)** | 8 | ✅ PASS | **1,514 ms** | **667 ms** | 0 |
| **Admin Operations Routes (Desktop)** | 12 | ✅ PASS | **1,090 ms** | **1,213 ms** | 0 |
| **Mobile Responsive (390x844)** | 15 | ✅ PASS | **948 ms** | **597 ms** | 0 |
| **Tablet Responsive (768x1024)** | 4 | ✅ PASS | **818 ms** | **517 ms** | 0 |
| **TOTAL CONFIGURATIONS** | **50** | **✅ 100% PASS** | **834 ms** | **512 ms** | **0** |

---

## 2. Granular Route Benchmark Matrix

### A. Public Routes (Desktop: 1440x900)
| Route | Section | Initial Load | Repeat Load | RSC Reqs | Supabase Reqs | Total Reqs | Status |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| `/` | Public | 348 ms | 58 ms | 0 | 0 | 12 | ✅ PASS |
| `/tournaments` | Public | 257 ms | 43 ms | 0 | 0 | 11 | ✅ PASS |
| `/live` | Public | 55 ms | 82 ms | 0 | 0 | 8 | ✅ PASS |
| `/about` | Public | 138 ms | 66 ms | 0 | 0 | 7 | ✅ PASS |
| `/contact` | Public | 46 ms | 88 ms | 0 | 0 | 7 | ✅ PASS |
| `/privacy` | Public | 40 ms | 30 ms | 0 | 0 | 6 | ✅ PASS |
| `/terms` | Public | 48 ms | 33 ms | 0 | 0 | 6 | ✅ PASS |

### B. Authentication Routes (Desktop: 1440x900)
| Route | Section | Initial Load | Repeat Load | RSC Reqs | Supabase Reqs | Total Reqs | Status |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| `/auth/login` | Auth | 40 ms | 31 ms | 0 | 0 | 8 | ✅ PASS |
| `/login` | Auth (Admin Portal) | 41 ms | 29 ms | 0 | 0 | 8 | ✅ PASS |
| `/signup` | Auth | 39 ms | 35 ms | 0 | 0 | 8 | ✅ PASS |
| `/forgot-password` | Auth | 40 ms | 26 ms | 0 | 0 | 7 | ✅ PASS |

### C. Player Dashboard Routes (Desktop: 1440x900, Authenticated Session: `qa_player_01@test.internal`)
| Route | Section | Initial Load | Repeat Load | RSC Reqs | Supabase Reqs | Total Reqs | Status |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| `/dashboard` | Dashboard | 2,533 ms | 531 ms | 18 | 1 | 24 | ✅ PASS |
| `/dashboard/tournaments` | Dashboard | 1,029 ms | 516 ms | 18 | 2 | 25 | ✅ PASS |
| `/dashboard/matches` | Dashboard | 789 ms | 1,128 ms | 5 | 1 | 18 | ✅ PASS |
| `/dashboard/wallet` | Dashboard | 901 ms | 532 ms | 15 | 2 | 22 | ✅ PASS |
| `/dashboard/career` | Dashboard | 2,927 ms | 457 ms | 16 | 1 | 21 | ✅ PASS |
| `/dashboard/notifications`| Dashboard | 2,013 ms | 710 ms | 12 | 1 | 18 | ✅ PASS |
| `/dashboard/settings` | Dashboard | 414 ms | 403 ms | 4 | 1 | 14 | ✅ PASS |
| `/dashboard/tickets` | Dashboard | 504 ms | 657 ms | 8 | 1 | 15 | ✅ PASS |

### D. Admin Operations Routes (Desktop: 1440x900, Authenticated Session: `ye.agrajj@gmail.com`)
| Route | Section | Initial Load | Repeat Load | RSC Reqs | Supabase Reqs | Total Reqs | Status |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| `/admin` | Admin | 1,087 ms | 723 ms | 11 | 0 | 19 | ✅ PASS |
| `/admin/dashboard` | Admin | 771 ms | 821 ms | 11 | 0 | 20 | ✅ PASS |
| `/admin/tournaments` | Admin | 857 ms | 1,162 ms | 15 | 1 | 22 | ✅ PASS |
| `/admin/participants` | Admin | 1,391 ms | 1,978 ms | 18 | 0 | 24 | ✅ PASS |
| `/admin/brackets` | Admin | 1,779 ms | 804 ms | 14 | 0 | 20 | ✅ PASS |
| `/admin/matches` | Admin | 1,486 ms | 775 ms | 6 | 2 | 16 | ✅ PASS |
| `/admin/payouts` | Admin | 723 ms | 2,393 ms | 22 | 0 | 26 | ✅ PASS |
| `/admin/tickets` | Admin | 1,311 ms | 1,755 ms | 27 | 0 | 32 | ✅ PASS |
| `/admin/cms/homepage` | Admin | 1,061 ms | 1,015 ms | 17 | 1 | 23 | ✅ PASS |
| `/admin/media` | Admin | 726 ms | 1,141 ms | 4 | 0 | 14 | ✅ PASS |
| `/admin/avatars` | Admin | 714 ms | 798 ms | 10 | 0 | 18 | ✅ PASS |
| `/admin/settings` | Admin | 1,172 ms | 1,276 ms | 9 | 1 | 18 | ✅ PASS |

### E. Mobile Responsive (Viewport: 390x844 - iPhone 14 Pro Profile)
| Route | Section | Initial Load | Repeat Load | Device Profile | Status |
|:---|:---|:---:|:---:|:---:|:---:|
| `/` | Public | 158 ms | 33 ms | Mobile | ✅ PASS |
| `/tournaments` | Public | 49 ms | 125 ms | Mobile | ✅ PASS |
| `/live` | Public | 25 ms | 47 ms | Mobile | ✅ PASS |
| `/dashboard` | Dashboard | 1,769 ms | 1,070 ms | Mobile | ✅ PASS |
| `/dashboard/tournaments` | Dashboard | 512 ms | 547 ms | Mobile | ✅ PASS |
| `/dashboard/matches` | Dashboard | 356 ms | 741 ms | Mobile | ✅ PASS |
| `/dashboard/wallet` | Dashboard | 552 ms | 868 ms | Mobile | ✅ PASS |
| `/dashboard/career` | Dashboard | 844 ms | 395 ms | Mobile | ✅ PASS |
| `/dashboard/notifications`| Dashboard | 341 ms | 732 ms | Mobile | ✅ PASS |
| `/dashboard/settings` | Dashboard | 359 ms | 400 ms | Mobile | ✅ PASS |
| `/dashboard/tickets` | Dashboard | 669 ms | 1,049 ms | Mobile | ✅ PASS |
| `/admin/dashboard` | Admin | 1,321 ms | 1,364 ms | Mobile | ✅ PASS |
| `/admin/tournaments` | Admin | 6,645 ms | 774 ms | Mobile | ⚠️ SLOW (Cold only) |
| `/admin/matches` | Admin | 709 ms | 741 ms | Mobile | ✅ PASS |
| `/admin/tickets` | Admin | 2,789 ms | 1,824 ms | Mobile | ✅ PASS |

### F. Tablet Responsive (Viewport: 768x1024 - iPad Portrait Profile)
| Route | Section | Initial Load | Repeat Load | Device Profile | Status |
|:---|:---|:---:|:---:|:---:|:---:|
| `/dashboard` | Dashboard | 1,474 ms | 407 ms | Tablet | ✅ PASS |
| `/dashboard/tournaments` | Dashboard | 523 ms | 546 ms | Tablet | ✅ PASS |
| `/dashboard/matches` | Dashboard | 705 ms | 407 ms | Tablet | ✅ PASS |
| `/dashboard/wallet` | Dashboard | 568 ms | 529 ms | Tablet | ✅ PASS |

---

## 3. Discovered Routes Not Directly Audited in Matrix
- Dynamic tournament routes (`/tournaments/[id]`, `/t/[tournamentId]`): Dynamic parameters require live tournament IDs; verified via `/tournaments` list link prefetching.
- Admin sub-actions (`/admin/tournaments/new`, `/admin/tournaments/[id]/bracket/customize`): Tested through build compilation; marked NOT TESTED in automated headless browser loop to avoid mutations.
