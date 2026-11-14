# Database Request & Query Efficiency Audit
**Project:** eFootball Tournament Platform  
**Target:** Elimination of N+1 Queries & Redundant Server Roundtrips  
**Date:** 2026-11-12T21:42:00+05:30  

---

## 1. Remote Supabase Calls per Page View

| Section | Route | Supabase HTTP Requests (Client) | Server-Side Query Optimizations |
|:---|:---|:---:|:---|
| **Public** | `/` | 0 | Rendered with in-memory 60s CMS section cache |
| **Public** | `/tournaments` | 0 | SWR ISR 30s revalidation |
| **Public** | `/live` | 0 | Reusable TanStack Query cache (`useLiveMatchesQuery`) |
| **Dashboard**| `/dashboard` | 1 | Auth user check cached via React 19 `cache(getAuthenticatedUser)` |
| **Dashboard**| `/dashboard/tournaments`| 2 | Enrolled tournaments cached in `tournamentsCache` (30s TTL) |
| **Dashboard**| `/dashboard/matches` | 1 | Active player matches cached in `matchesCache` (20s TTL) |
| **Dashboard**| `/dashboard/wallet` | 2 | Player balance and transactions cached in `walletCache` (30s TTL) |
| **Dashboard**| `/dashboard/career` | 1 | Player career records cached in `careerCache` (60s TTL) |
| **Dashboard**| `/dashboard/notifications`| 1 | Notifications cached in `notificationsCache` (30s TTL) |
| **Dashboard**| `/dashboard/tickets` | 1 | Player tickets cached in `playerTicketsCache` (30s TTL) |
| **Admin** | `/admin/dashboard` | 0 | Layout and user authentication cached |
| **Admin** | `/admin/tickets` | 0 | Consolidated unified tickets query; 30s TTL |
| **Admin** | `/admin/matches` | 2 | Consolidated match dashboard query with preloaded matches |
| **Admin** | `/admin/payouts` | 0 | Admin financial stats & payout queue cached (30s TTL) |
| **Admin** | `/admin/avatars` | 0 | Full avatar list & usage count cached (60s TTL) |
| **Admin** | `/admin/media` | 0 | Media overview metrics cached (30s TTL) |

---

## 2. Invalidation & Mutation Triggers
All caches maintain strict invalidation hooks on state mutations:
- `invalidatePlayerDashboardCache(userId)`: Triggered on match check-in, score submission, tournament registration.
- `invalidateWalletCache()`: Triggered on payout approval, transaction ledger update, bank details change.
- `invalidateTicketOverviewStatsCache()` / `invalidatePlayerTicketsCache()`: Triggered on ticket resolution, reply submission.
- `invalidateAvatarCache()`: Triggered on avatar upload, edit, delete.
- `invalidateAdminMatchesCache()`: Triggered on match result submission, score update, walkover.
- `clearHomepageSectionsCache()`: Triggered on CMS draft update, publishing, reordering.
