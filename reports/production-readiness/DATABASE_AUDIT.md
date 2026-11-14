# DATABASE AUDIT REPORT: PostgreSQL Schema, Indexes, Functions & RLS
**Project:** eFootball Tournament Platform  
**Target Database:** Supabase PostgreSQL 17 (`cqgbeafenavkeirwsxbg`, AWS `ap-northeast-2`)  
**Scope:** 42 Public Tables, 117 RLS Policies, 22 Functions & Triggers, Foreign Keys, Indexes, Advisory Reports  

---

## 1. Executive Summary

The database layer consists of 42 relational tables hosting tournaments, participants, matches, disputes, wallets, and streaming records.
All 42 tables have Row-Level Security enabled (`rls_enabled: true`). Core transaction workflows utilize atomic stored procedures with explicit `search_path` declarations.
However, **32 unindexed foreign keys** and **59 RLS policies with subquery re-evaluation warnings** represent severe performance and concurrency bottlenecks under tournament peak traffic.

---

## 2. Database Schema Metrics

| Attribute | Metric | Evaluation |
| :--- | :--- | :--- |
| **Total Public Tables** | 42 tables | Clean relational structure with audit logs |
| **RLS Coverage** | 42 / 42 (100%) | Every table has RLS enabled |
| **Total RLS Policies** | 117 policies | Granular role and ownership policies |
| **Public Routines** | 22 functions | 17 `SECURITY DEFINER`, 5 `SECURITY INVOKER` |
| **Covering Foreign Keys** | 32 unindexed FKs | Identifies missing indexes on critical relations |
| **Policy Re-evaluations** | 59 warnings | `auth_rls_initplan` lint flags |
| **Realtime Publications** | `supabase_realtime` | Public tables enrolled; WebSocket connectivity validated |

---

## 3. Unindexed Foreign Keys Analysis

The Supabase Performance Advisor identified 32 foreign key constraints without covering indexes. In PostgreSQL, missing indexes on foreign key columns lead to full sequential scans during `DELETE` or `UPDATE` cascades on parent tables, as well as degraded join performance.

### Critical Foreign Keys Requiring Immediate Indexes:
1. `matches.walkover_requested_by -> participants(id)`: Evaluated frequently during match lifecycle and walkover resolution.
2. `match_disputes.reporter_participant_id -> participants(id)`: Scanned during dispute retrieval and profile match history.
3. `match_disputes.opponent_participant_id -> participants(id)`
4. `match_disputes.resolved_by -> auth.users(id)`
5. `support_tickets.tournament_id -> tournaments(id)`: Filtering tickets by tournament requires sequential table scan.
6. `support_tickets.match_id -> matches(id)`
7. `ticket_messages.sender_id -> auth.users(id)`: Message threads require fast index lookups.
8. `ticket_audit_logs.admin_id -> auth.users(id)`
9. `payout_transactions.payment_method_id -> player_payment_methods(id)`
10. `payout_transactions.processed_by -> auth.users(id)`
11. `prize_distributions.participant_id -> participants(id)`
12. `prize_distributions.approved_by -> auth.users(id)`
13. `tournaments.champion_id -> participants(id)`
14. `tournaments.runner_up_id -> participants(id)`
15. `tournaments.third_place_id -> participants(id)`
16. `match_activity_logs.tournament_id -> tournaments(id)`
17. `match_submissions.tournament_id -> tournaments(id)`
18. `match_submissions.user_id -> auth.users(id)`
19. `restream_jobs.source_id -> restream_sources(id)`
20. `restream_jobs.youtube_account_id -> youtube_accounts(id)`

---

## 4. Row-Level Security (RLS) Optimization (`auth_rls_initplan`)

### The Issue:
Supabase Security and Performance Advisors flagged 59 policies with `auth_rls_initplan`.
When an RLS policy directly invokes:
```sql
auth.uid() = user_id
```
PostgreSQL re-evaluates `auth.uid()` for every single row evaluated in the query filter plan (InitPlan vs SubPlan).

### The Fix:
Wrap all auth function calls in subqueries:
```sql
(SELECT auth.uid()) = user_id
```
This forces PostgreSQL to evaluate `auth.uid()` exactly once per statement execution and cache the scalar result, improving query execution speeds by up to 100x on large tables like `wallet_transactions`, `matches`, and `player_notifications`.

---

## 5. Stored Procedures & Functions Security

All 17 `SECURITY DEFINER` functions were inspected for `search_path` configuration:

| Function Name | `prosecdef` | `proconfig` (search_path) | Vulnerability Status |
| :--- | :--- | :--- | :--- |
| `is_admin` | `true` | `search_path=pg_catalog, public, pg_temp` | **SECURE** |
| `has_admin_role` | `true` | `search_path=pg_catalog, public, pg_temp` | **SECURE** |
| `get_admin_role` | `true` | `search_path=pg_catalog, public, pg_temp` | **SECURE** |
| `reserve_tournament_slot` | `true` | `search_path=public, auth, pg_temp` | **SECURE** |
| `lock_tournament_financial_terms` | `true` | `search_path=public, pg_temp` | **SECURE** |
| `record_player_checkin` | `true` | `search_path=public, pg_temp` | **SECURE** |
| `evaluate_overdue_matches` | `true` | `search_path=public, pg_temp` | **SECURE** |
| `admin_approve_manual_registration` | `true` | `search_path=public, auth, pg_temp` | **SECURE** |
| `admin_reject_manual_registration` | `true` | `search_path=public, auth, pg_temp` | **SECURE** |
| `admin_set_under_verification` | `true` | `search_path=public, auth, pg_temp` | **SECURE** |
| `cancel_manual_registration` | `true` | `search_path=public, auth, pg_temp` | **SECURE** |
| `submit_manual_payment` | `true` | `search_path=public, auth, pg_temp` | **SECURE** |
| `handle_new_user` | `true` | `search_path=public` | **SECURE** |
| `sync_missing_profiles` | `true` | `search_path=public` | **SECURE** |
| `request_match_walkover` | `true` | `search_path=public, pg_temp` | **SECURE** |
| `start_player_match` | `true` | `search_path=public, pg_temp` | **SECURE** |
| `submit_match_screenshot_proof` | `true` | `search_path=public, pg_temp` | **SECURE** |
| `submit_player_score` | `true` | `search_path=public, pg_temp` | **SECURE** |
| `set_updated_at` | `false` | `NULL` | **WARN (Mutable search_path)** |
| `_admin_role_rank` | `false` | `NULL` | **WARN (Mutable search_path)** |
| `set_support_ticket_number` | `false` | `NULL` | **WARN (Mutable search_path)** |
| `set_match_dispute_ticket_number` | `false` | `NULL` | **WARN (Mutable search_path)** |

### Note on Functions with Mutable `search_path`:
The 4 functions with `prosecdef = false` (`SECURITY INVOKER`) trigger warnings in Supabase Advisors. While low risk because they run with invoker privileges, setting `SET search_path = public, pg_temp` on trigger functions is recommended best practice.
