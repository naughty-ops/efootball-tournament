# TOURNAMENT LOGIC AUDIT REPORT: Competition Engine & Match Lifecycle
**Project:** eFootball Tournament Platform  
**Target Tournament:** `f8b4c365-ad14-4ef7-b2aa-8a7d1be93dce` (`[QA-AUTONOMOUS] QA MASTER LEAGUE — 20 PLAYERS`)  
**Scope:** Berger Round-Robin Fixture Engine, Knockout Brackets, Two-Player Match Lifecycle, Standings Calculation, Dispute Engine  

---

## 1. Executive Summary

The tournament competition engine supports Single Elimination Knockout, Double Elimination, Group Stage + Knockout, and League (Round-Robin) formats.
The core mathematical logic in `services/leagueService.ts` correctly implements the Berger pairing rotation algorithm, generating 19 matchdays and 190 unique pairings for 20 competitors without duplicate matches or self-pairings.
However, the target tournament `f8b4c365-ad14-4ef7-b2aa-8a7d1be93dce` currently has **zero persisted matches** in the production database, and all 20 registered competitors are synthetic QA accounts.

---

## 2. Target Tournament Deep-Dive Inspection

Direct SQL inspection of `tournaments`, `participants`, `rounds`, and `matches` revealed the following state:

```json
{
  "tournament_id": "f8b4c365-ad14-4ef7-b2aa-8a7d1be93dce",
  "name": "[QA-AUTONOMOUS] QA MASTER LEAGUE — 20 PLAYERS",
  "status": "registration",
  "format": "league",
  "is_private": false,
  "max_participants": 20,
  "confirmed_slots_count": 20,
  "reserved_slots_count": 0,
  "participants_count": 20,
  "rounds_count": 0,
  "matches_count": 0,
  "disputes_count": 0
}
```

### Analysis of Participants:
All 20 participant records are tied to test accounts:
- Emails: `qa_player_01@test.internal` through `qa_player_20@test.internal`
- User IDs: `4426a75f-a44d-4940-a3ac-263abf3dfeeb` through `8e81e502-995d-4611-830f-e216e10fe02b`
- eFootball IDs: `QAPL-100-200-101` through `QAPL-100-200-120`

### Launch Readiness Verdict for Target Tournament:
> **NOT READY FOR PUBLIC KICKOFF:**
> 1. Matches have not been generated in the database.
> 2. The tournament contains synthetic QA accounts that must not participate in live production tournaments.
> 3. Production kickoff requires generating a fresh tournament for genuine competitors or executing an administrative reset.

---

## 3. Mathematical Verification of Berger Round-Robin Engine

The implementation in `services/leagueService.ts` (`generateRoundRobinSchedule`) was audited for algebraic correctness:

1. **Even Competitor Count ($N = 20$):**
   - Rounds per leg: $R = N - 1 = 20 - 1 = 19 \text{ rounds}$
   - Matches per round: $M = N / 2 = 20 / 2 = 10 \text{ matches}$
   - Total fixtures per leg: $T = 19 \times 10 = 190 \text{ matches}$
   - Combinatorial validation: $\binom{20}{2} = \frac{20 \times 19}{2} = 190 \text{ unique matches}$

2. **Algorithm Execution:**
   - A fixed anchor `pool[0]` is retained while the remaining 19 elements rotate circularly.
   - Home and away allocation alternates: `(i + r + leg) % 2 === 0` to balance home/away distribution across rounds.
   - Odd participant counts append a `null` BYE placeholder ($N+1$), discarding pairings with `null`.

3. **Transaction Safety Finding:**
   - `generateLeagueFixtures` executes a series of independent Supabase client calls:
     1. Insert into `rounds`
     2. Insert into `matches`
     3. Update `tournaments.status` to `'ongoing'`
   - If match insertion fails due to timeout or network drop, the newly inserted rounds remain stranded in the database without matches.
   - **Recommendation:** Encapsulate round and match generation inside a PostgreSQL atomic stored procedure `generate_league_fixtures(p_tournament_id uuid)`.

---

## 4. Two-Player Match Lifecycle Engine

The match workflow spans 5 operational phases implemented through atomic database stored procedures:

```
[SCHEDULED / PENDING]
        │
        ▼ (Check-in Grace Period: 10 mins)
[WAITING FOR PLAYERS] ──► (No-Show Timeout) ──► [WALKOVER / DISPUTE]
        │ (Both Checked In)
        ▼
[LIVE / IN_PROGRESS]
        │
        ▼ (Both Submit Matching Scores)
[COMPLETED] ──► Standings Updated
        │
        ▼ (Conflicting Scores Submitted)
[DISPUTED] ──► Screenshot Evidence Upload ──► Admin Resolution
```

### Audited Procedures:
- `record_player_checkin`: Records server-authoritative timestamp for each participant; transitions match to `'waiting_for_players'` or `'in_progress'`.
- `start_player_match`: Marks user as actively playing in the game client.
- `submit_player_score`: Validates that submitting user belongs to the match. Compares reported scores:
  - If both scores match: sets `status = 'completed'`, updates participant stats.
  - If scores conflict: sets `status = 'disputed'`, creates record in `match_disputes`.
- `request_match_walkover`: Validates check-in grace period expiration, caller presence, and opponent absence before awarding walkover.

---

## 5. Tournament Registration & Slot Reservation

### Fallback Concurrency Finding:
In `services/playerDashboardService.ts` (`selfRegisterTournament`):
```ts
// 3. Verify capacity
const { count } = await supabase.from('participants').select('id', { count: 'exact', head: true }).eq('tournament_id', tournamentId);
if (currentCount >= tourney.max_participants) return { success: false, message: 'Tournament capacity is full.' };

// 4. Insert participant
await supabase.from('participants').insert(...);
```
- **Finding:** If the database RPC `register_player_for_tournament` is missing or fails, the code falls back to checking capacity via `select count(*)` and then inserting into `participants`.
- **Risk:** Time-of-Check to Time-of-Use (TOCTOU) race condition during rapid concurrent registrations.
- **Remediation:** Enforce slot reservation using the existing atomic procedure `reserve_tournament_slot` or deploy a PostgreSQL check trigger on `participants` that rejects inserts when `count >= max_participants`.
