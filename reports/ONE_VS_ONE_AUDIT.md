# Comprehensive Project Audit & Implementation Specification: 1 VS 1 Challenge Arena
**eFootball Tournament Platform**  
**Repository:** `D:\Project`  
**Production URL:** `https://efootball-tournament-cyan.vercel.app`  
**Audit Specification Updated:** 2026-11-15T14:22:00+05:30  
**Status:** Approved in Principle with Mandatory Security & Theme Corrections.

---

## 1. Executive Summary & Core Rules

This specification establishes the complete technical and design foundation for integrating the **Admin-Managed 1 VS 1 Challenge Arena** into the existing eFootball Tournament Platform.

### Approved Invariants & Non-Negotiable Directives:
1. **Theme Preservation (Correction Applied):** The UI maintains the exact existing eFootball website design system: premium dark/black surfaces (`#050515`, `#08081A`, `#0B0B24`), esports dark-green accents (`#00E676`, `#00C853`, `#052e16`), high-contrast clean typography, glassy dark cards, and sleek modals. No blue/yellow theme overrides.
2. **FREE / DRY-RUN Mode Exclusively:** `match_mode` is locked to `'free'`. Absolutely zero balance deductions, credits, stakes, fake transactions, or financial ledger entries will occur.
3. **Total Database Isolation:** All new functionality resides in `one_vs_one_*` tables. Zero modification to existing tournament matches (`public.matches`), participants, brackets, or groups.
4. **Exact Player Workflow:**
   - Player selects an admin-created entry card.
   - Player creates a waiting match (`waiting`).
   - Another player selects the same card.
   - Automatic opponent matching occurs (`matched`).
   - Player 1 submits Room ID and Room Password (`room_submitted`).
   - Player 2 receives real-time notification and accesses room details.
   - Both confirm readiness (`ready`).
   - Match begins (`in_progress`).
   - Post-match: Result submitted -> Opponent confirms/disputes -> Admin verifies final outcome.
5. **Hardened Security & Concurrency:**
   - PostgreSQL atomic stored procedure with row-level `FOR UPDATE SKIP LOCKED`.
   - Partial unique index preventing duplicate active match queues per user.
   - Room credentials private to the two participants and verified admins.
   - Verified results immutable to players.
   - Admin authorization enforced at the database level (`public.has_admin_role`).

---

## 2. Existing Matches Tab Integration

### 2.1 Route & View Architecture
- **Location:** `app/dashboard/matches/page.tsx`
- **Current Flow:** Server component authenticates session via `getAuthenticatedUser()`, concurrently loads player profile and tournament fixtures, and renders `PlayerMatchesClient.tsx`.
- **Arena Integration:** An esports dark-themed segmented mode switcher at the top of `/dashboard/matches`:
  - **Tournament Fixtures** (Unchanged existing match schedule and results)
  - **1 VS 1 Challenge Arena** (New entry cards, active room tracker, matchmaking queue, and 1v1 history)
- **Zero Main Navigation Pollution:** No new main navigation or sidebar items created in player-facing routes.

---

## 3. Wallet Architecture & Safety Invariants

- **Read-Only Balance Display:** Player's available balance may be shown for competitive context, but no balance mutation RPCs are called.
- **Zero Ledger Records:** Neither `player_wallets` nor `wallet_transactions` will be altered during 1v1 operations.
- **Dry-Run Audit:** All challenge card display amounts and simulated outcomes are logged solely in `one_vs_one_events`.

---

## 4. UI/UX Design System Specification (Dark Esports Theme)

The 1 VS 1 Arena components strictly adhere to the **existing dark/black & dark-green gaming aesthetics**:

| Element | Specification | Utility / Value |
| :--- | :--- | :--- |
| **Primary Canvas** | Deep dark esports canvas | `bg-[#050515]` / `bg-[#060714]` |
| **Card Surface** | Deep black/dark-slate container | `bg-[#0B0B24]`, `bg-[#08081A]`, `bg-slate-900/90` |
| **Accents & Highlights** | Esports Dark Green | `#00E676` (Primary Neon Green), `#00C853` (Deep Green) |
| **Active States & Badges** | Green glow & badge | `bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30` |
| **Primary Action Buttons**| High-contrast esports green | `bg-[#00E676] hover:bg-[#00C853] text-[#050515] font-black` |
| **Secondary Buttons** | Dark glassy outlines | `bg-white/5 hover:bg-white/10 text-white border-white/15` |
| **Borders** | Subtle white glass | `border-white/10` to `border-white/20` |
| **Modal Overlays** | Deep black glass | `bg-black/80 backdrop-blur-md`, container `bg-[#08081A]` |
| **Card Border Radius** | Match existing cards | `rounded-2xl` / `rounded-[28px]` |
| **Typography** | Athletic Gaming Display | `'Barlow Condensed', 'DIN Alternate', 'Impact', sans-serif`, 900 uppercase |

---

## 5. Database Architecture & Schema (`one_vs_one_*`)

### 5.1 Proposed Isolated Tables

1. **`one_vs_one_cards`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `name TEXT NOT NULL`
   - `entry_amount NUMERIC(10,2) NOT NULL CHECK (entry_amount >= 0)`
   - `advertised_payout NUMERIC(10,2) NOT NULL CHECK (advertised_payout >= 0)`
   - `status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance'))`
   - `display_order INT NOT NULL DEFAULT 0`
   - `max_concurrent_matches INT NOT NULL DEFAULT 50`
   - `max_daily_matches INT NOT NULL DEFAULT 200`
   - `availability_start TIMESTAMPTZ`
   - `availability_end TIMESTAMPTZ`
   - `created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

2. **`one_vs_one_matches`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `match_code TEXT NOT NULL UNIQUE`
   - `card_id UUID NOT NULL REFERENCES public.one_vs_one_cards(id) ON DELETE RESTRICT`
   - `status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'room_submitted', 'ready', 'in_progress', 'result_submitted', 'completed', 'disputed', 'cancelled', 'expired'))`
   - `match_mode TEXT NOT NULL DEFAULT 'free' CHECK (match_mode IN ('free', 'dry_run'))`
   - `room_id TEXT`
   - `room_password TEXT`
   - `room_submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
   - `room_submitted_at TIMESTAMPTZ`
   - `created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
   - `matched_at TIMESTAMPTZ`
   - `started_at TIMESTAMPTZ`
   - `completed_at TIMESTAMPTZ`
   - `expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes')`
   - `cancelled_at TIMESTAMPTZ`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

3. **`one_vs_one_match_players`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `match_id UUID NOT NULL REFERENCES public.one_vs_one_matches(id) ON DELETE CASCADE`
   - `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
   - `player_position INT NOT NULL CHECK (player_position IN (1, 2))`
   - `ready_status TEXT NOT NULL DEFAULT 'pending' CHECK (ready_status IN ('pending', 'ready'))`
   - `joined_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `ready_at TIMESTAMPTZ`
   - `room_viewed_at TIMESTAMPTZ`
   - `CONSTRAINT uq_match_player_pos UNIQUE (match_id, player_position)`
   - `CONSTRAINT uq_match_player_user UNIQUE (match_id, user_id)`

4. **`one_vs_one_results`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `match_id UUID NOT NULL REFERENCES public.one_vs_one_matches(id) ON DELETE CASCADE`
   - `submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
   - `claimed_winner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
   - `player_one_score INT NOT NULL CHECK (player_one_score >= 0)`
   - `player_two_score INT NOT NULL CHECK (player_two_score >= 0)`
   - `screenshot_url TEXT`
   - `status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'confirmed', 'disputed', 'verified'))`
   - `opponent_confirmed_at TIMESTAMPTZ`
   - `verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
   - `verified_at TIMESTAMPTZ`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `CONSTRAINT uq_match_result UNIQUE (match_id)`

5. **`one_vs_one_disputes`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `match_id UUID NOT NULL REFERENCES public.one_vs_one_matches(id) ON DELETE CASCADE`
   - `submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
   - `reason TEXT NOT NULL`
   - `description TEXT NOT NULL`
   - `evidence_url TEXT`
   - `status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed'))`
   - `admin_notes TEXT`
   - `resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
   - `resolved_at TIMESTAMPTZ`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

6. **`one_vs_one_events`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `match_id UUID REFERENCES public.one_vs_one_matches(id) ON DELETE CASCADE`
   - `actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL`
   - `event_type TEXT NOT NULL`
   - `event_payload JSONB NOT NULL DEFAULT '{}'::jsonb`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

7. **`one_vs_one_eligibility_records`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
   - `acknowledgement_timestamp TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `policy_version TEXT NOT NULL`
   - `jurisdiction TEXT NOT NULL DEFAULT 'IN'`
   - `eligibility_status TEXT NOT NULL DEFAULT 'acknowledged'`
   - `CONSTRAINT uq_user_eligibility_version UNIQUE (user_id, policy_version)`

### 5.2 Concurrency Indexes & Safe Stored Procedure
- **Duplicate Prevention Index:**
  ```sql
  CREATE UNIQUE INDEX idx_one_vs_one_active_player
    ON public.one_vs_one_match_players (user_id)
    WHERE ready_status IN ('pending', 'ready');
  ```
  *(Combined with match status checks to ensure no user can participate in two active rooms at once)*
- **Atomic Matchmaker Function:**
  `public.join_or_create_one_vs_one_match(p_card_id UUID, p_user_id UUID)`:
  1. Searches for open room with `SELECT id FROM public.one_vs_one_matches WHERE card_id = p_card_id AND status = 'waiting' AND created_by != p_user_id AND expires_at > now() ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;`
  2. If found, assigns Player 2, updates status to `'matched'`, and logs event.
  3. If none found, inserts new match row with status `'waiting'`, assigns Player 1, and logs event.
  4. Returns match record.

---

## 6. Implementation Plan & Safeguards

### Step 1: Database Migration
- File: `supabase/migrations/20261115010000_create_one_vs_one_arena_system.sql`
- Creates all 7 tables, check constraints, foreign keys, RLS policies, and atomic matchmaking stored procedure.
- Seeds 3 standard challenge cards:
  - ₹10 Entry / ₹15 Winner
  - ₹15 Entry / ₹25 Winner
  - ₹25 Entry / ₹40 Winner

### Step 2: Backend Types, Services & Server Actions
- `types/oneVsOne.ts`: Strict TypeScript models.
- `services/oneVsOneService.ts`: Core data operations, query memoization, safe state transitions.
- `app/actions/oneVsOneActions.ts`: Server Actions (`joinOrCreateMatchAction`, `submitRoomDetailsAction`, `confirmPlayerReadyAction`, `submitMatchResultAction`, `confirmMatchResultAction`, `fileMatchDisputeAction`, `cancelWaitingMatchAction`, `adminResolveDisputeAction`, `adminUpdateCardAction`).

### Step 3: Player UI Components
- Integrated into `app/dashboard/matches/page.tsx` with high-performance tab switching.
- `components/one-vs-one/OneVsOneArenaView.tsx`: Main arena hub.
- `components/one-vs-one/OneVsOneCardGrid.tsx`: Dynamic cards in dark/green style.
- `components/one-vs-one/OneVsOneEligibilityModal.tsx`: Age and rules confirmation.
- `components/one-vs-one/OneVsOneWaitingQueue.tsx`: Smooth waiting state with cancel button.
- `components/one-vs-one/OneVsOneMatchRoom.tsx`: Room ID/Password display, copy buttons, ready toggle, countdown.
- `components/one-vs-one/OneVsOneResultModal.tsx`: Score submission and screenshot upload.
- `components/one-vs-one/OneVsOneDisputeModal.tsx`: Dispute resolution filing.
- `hooks/useRealtimeOneVsOneMatch.ts`: Realtime subscription with channel cleanup.

### Step 4: Admin Management Desk
- Added to `components/admin/AdminSidebar.tsx`: "1 VS 1 Arena" under Tournament Operations.
- `app/admin/one-vs-one/page.tsx`: Route for admin desk.
- `components/admin/one-vs-one/AdminOneVsOneDesk.tsx`: Live match monitor, card manager, and dispute desk.

### Step 5: Verification & Regression Testing
- Multi-viewport visual checks (desktop, tablet, mobile).
- Concurrency simulation (simultaneous matchmaking).
- Zero-wallet impact verification.
- Existing tournament regression verification.
- `npm run build` and `npx tsc --noEmit`.
