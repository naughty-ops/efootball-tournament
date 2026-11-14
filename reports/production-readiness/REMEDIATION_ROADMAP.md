# REMEDIATION ROADMAP: Phased Implementation Plan (P0 – P5)
**Project:** eFootball Tournament Platform  
**Target:** Production Readiness & Security Hardening  
**Scope:** Actionable Technical Steps to Achieve Full Production "GO"  

---

## 1. Executive Implementation Priority Summary

```
[ P0: CRITICAL IMMEDIATE BLOCKERS ] (Day 1)
  ├── 1. Create root `middleware.ts` linking to `lib/supabase/proxy.ts`
  ├── 2. Patch Next.js critical vulnerability (GHSA-673q-mjm6-r5xr) to >=16.4.6
  └── 3. Purge QA test accounts & generate real fixtures for kickoff tournament

[ P1: HIGH SECURITY & DATABASE HARDENING ] (Days 2 - 3)
  ├── 4. Add covering indexes for 32 unindexed foreign keys
  ├── 5. Optimize 59 RLS policies with `(SELECT auth.uid())` subqueries
  ├── 6. Revoke `EXECUTE` on 15 SECURITY DEFINER functions from `anon` role
  ├── 7. Fix `tournament_participants_public` view with `security_invoker = true`
  ├── 8. Enable Leaked Password Protection in Supabase Auth
  └── 9. Deploy atomic slot reservation RPC / check trigger to prevent TOCTOU

[ P2: CI/CD & RELIABILITY HARDENING ] (Days 4 - 5)
  ├── 10. Provision Upstash Redis credentials for distributed edge rate limiting
  ├── 11. Create `.github/workflows/ci.yml` with typecheck, lint, and audit gates
  ├── 12. Fix ESLint link error in `app/global-error.tsx` (line 55)
  └── 13. Install `@sentry/nextjs` for centralized error alerting

[ P3: PERFORMANCE & RENDER PURITY ] (Days 6 - 7)
  ├── 14. Refactor 55 React 19 hook warnings (avoid synchronous setState in useEffect)
  ├── 15. Fix impure `Date.now()` during render in `PlayerPayoutsTracker.tsx`
  └── 16. Add Vitest unit test suite for `leagueService.ts` and `crypto.ts`

[ P4: OPERATIONAL MATURITY ] (Week 2)
  ├── 17. Configure external synthetic uptime ping on `/api/health`
  └── 18. Setup Vercel log drain to Axiom or Datadog for compliance retention

[ P5: FUTURE FEATURE ENHANCEMENTS ] (Post-Launch)
  └── 19. Webhook-based LiveKit viewer presence aggregation in Redis
```

---

## 2. Detailed Technical Remediation Steps

### Step 1: Create Root `middleware.ts` (P0)
Create `D:\Project\middleware.ts`:
```ts
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

### Step 2: Database Foreign Key Index Migration (P1)
Create and apply migration `add_missing_foreign_key_indexes.sql`:
```sql
CREATE INDEX IF NOT EXISTS idx_matches_walkover_requested_by ON public.matches(walkover_requested_by);
CREATE INDEX IF NOT EXISTS idx_match_disputes_reporter_participant_id ON public.match_disputes(reporter_participant_id);
CREATE INDEX IF NOT EXISTS idx_match_disputes_opponent_participant_id ON public.match_disputes(opponent_participant_id);
CREATE INDEX IF NOT EXISTS idx_match_disputes_resolved_by ON public.match_disputes(resolved_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_tournament_id ON public.support_tickets(tournament_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_match_id ON public.support_tickets(match_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_id ON public.ticket_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_ticket_audit_logs_admin_id ON public.ticket_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_payout_transactions_payment_method_id ON public.payout_transactions(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payout_transactions_processed_by ON public.payout_transactions(processed_by);
CREATE INDEX IF NOT EXISTS idx_prize_distributions_participant_id ON public.prize_distributions(participant_id);
CREATE INDEX IF NOT EXISTS idx_prize_distributions_approved_by ON public.prize_distributions(approved_by);
CREATE INDEX IF NOT EXISTS idx_tournaments_champion_id ON public.tournaments(champion_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_runner_up_id ON public.tournaments(runner_up_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_third_place_id ON public.tournaments(third_place_id);
CREATE INDEX IF NOT EXISTS idx_match_activity_logs_tournament_id ON public.match_activity_logs(tournament_id);
CREATE INDEX IF NOT EXISTS idx_match_submissions_tournament_id ON public.match_submissions(tournament_id);
CREATE INDEX IF NOT EXISTS idx_match_submissions_user_id ON public.match_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_restream_jobs_source_id ON public.restream_jobs(source_id);
CREATE INDEX IF NOT EXISTS idx_restream_jobs_youtube_account_id ON public.restream_jobs(youtube_account_id);
```

### Step 3: Revoke Public Execute on Sensitive Procedures (P1)
```sql
REVOKE EXECUTE ON FUNCTION public.admin_approve_manual_registration FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_reject_manual_registration FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_under_verification FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancel_manual_registration FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.evaluate_overdue_matches FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.sync_missing_profiles FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_approve_manual_registration TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_manual_registration TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_under_verification TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_manual_registration TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_overdue_matches TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_missing_profiles TO authenticated, service_role;
```

### Step 4: Fix Security Definer View (P1)
```sql
ALTER VIEW public.tournament_participants_public SET (security_invoker = true);
```

### Step 5: Establish GitHub Actions CI Workflow (P2)
Create `.github/workflows/ci.yml`:
```yaml
name: CI Pipeline

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - name: TypeScript Typecheck
        run: npx tsc --noEmit
      - name: ESLint
        run: npm run lint
      - name: Security Audit
        run: npm audit --audit-level=high
```

---

## 3. Post-Remediation Verification Checklist

Once steps P0 through P2 are executed:
- [ ] Root `middleware.ts` applies `X-Frame-Options: DENY` on `curl -I https://efootball-tournament-cyan.vercel.app/dashboard`.
- [ ] Supabase Performance Advisor reports 0 unindexed foreign keys and 0 InitPlan warnings.
- [ ] Supabase Security Advisor reports 0 security errors.
- [ ] Target tournament has real competitor accounts registered and 190 matches persisted via `generateLeagueFixtures`.
- [ ] GitHub Actions passes all checks on commit push.
- [ ] Platform is cleared for full commercial public kickoff.
