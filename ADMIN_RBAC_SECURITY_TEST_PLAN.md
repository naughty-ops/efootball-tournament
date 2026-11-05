# Admin RBAC & Security Test Plan (Comprehensive Hardened)

**Project:** eFootball Tournament Platform  
**Target Schema:** Supabase PostgreSQL 17.6.1 (`cqgbeafenavkeirwsxbg`)  
**Designated Super Administrator:** `ye.agrajj@gmail.com` (`30080df7-5188-4630-b597-b8493ebe045d`)  
**Document Version:** 3.0 (Post-Third-Pass Review)  

---

## 1. Overview & Verification Strategy

This test plan defines the complete multi-tiered security verification framework required before and after applying the database-enforced RBAC migration.

Testing is organized into five rigorous test suites:
1. **Database RLS & Direct PostgREST Boundary Tests**
2. **Streamer Match Isolation Tests**
3. **Viewer Session Security & Heartbeat Authentication Tests**
4. **Registration RPC Business Logic & Concurrency Tests**
5. **Function Execution Privileges & RLS Bypass Tests**

---

## 2. Exhaustive Test Execution Matrix

### Suite 1: Database RLS & Direct PostgREST Boundary Tests

| Test ID | Target / Method | Actor | Payload / Action | Expected Result | Pass Criteria |
|---|---|---|---|---|---|
| **RLS-01** | `DELETE /rest/v1/matches` | Anonymous (Anon Key) | `?id=eq.<match_id>` | HTTP 401 / 403 / 0 rows | Match is NOT deleted |
| **RLS-02** | `PATCH /rest/v1/matches` | Anonymous (Anon Key) | `{"score_a": 99}` | HTTP 401 / 403 / 0 rows | Match scores unchanged |
| **RLS-03** | `DELETE /rest/v1/groups` | Anonymous (Anon Key) | `?id=eq.<group_id>` | HTTP 401 / 403 / 0 rows | Group is NOT deleted |
| **RLS-04** | `DELETE /rest/v1/participants` | Anonymous (Anon Key) | `?id=eq.<participant_id>` | HTTP 401 / 403 / 0 rows | Participant is NOT deleted |
| **RLS-05** | `SELECT /rest/v1/participants` | Anonymous (Anon Key) | `?select=*` | HTTP 200 returning `[]` (empty) | Personal phone numbers NOT leaked |
| **RLS-06** | `SELECT /rest/v1/tournament_participants_public` | Anonymous (Anon Key) | `?select=*` | HTTP 200 with public data | Usernames/seeds visible; contacts omitted |
| **RLS-07** | `PATCH /rest/v1/matches` | Authenticated Player | `{"score_a": 5}` | HTTP 403 / 0 rows affected | Non-staff player cannot modify score |
| **RLS-08** | `DELETE /rest/v1/tournaments` | Moderator Role | `?id=eq.<tourney_id>` | HTTP 403 / 0 rows affected | Moderator CANNOT delete tournament |
| **RLS-09** | `DELETE /rest/v1/tournaments` | Admin Role | `?id=eq.<tourney_id>` | HTTP 403 / 0 rows affected | Regular admin CANNOT delete tournament |
| **RLS-10** | `DELETE /rest/v1/tournaments` | Super Admin (`ye.agrajj@gmail.com`) | `?id=eq.<tourney_id>` | HTTP 200 / 1 row affected | Super admin can delete tournament |
| **RLS-11** | `INSERT /rest/v1/admin_users` | Admin Role | `{"id": "<new_uuid>", "role": "admin"}` | HTTP 403 / 0 rows affected | Admin CANNOT appoint other admins |
| **RLS-12** | `INSERT /rest/v1/admin_users` | Super Admin (`ye.agrajj@gmail.com`) | `{"id": "<new_uuid>", "role": "moderator"}` | HTTP 201 Created | Super admin can appoint staff |
| **RLS-13** | `INSERT /rest/v1/admin_audit_logs` | Moderator Role | `{"admin_id": "<super_admin_uuid>"}` | HTTP 403 Forbidden | Cannot forge audit log under another admin |
| **RLS-14** | `UPDATE /rest/v1/admin_audit_logs` | Super Admin | `{"action": "tampered"}` | HTTP 403 / Revoked | Audit logs are strictly immutable |
| **RLS-15** | `DELETE /rest/v1/admin_audit_logs` | Super Admin | `?id=eq.<log_id>` | HTTP 403 / Revoked | Audit logs cannot be deleted |

---

### Suite 2: Streamer Match Isolation Tests

| Test ID | Method / Target | Actor | Payload / Action | Expected Result | Pass Criteria |
|---|---|---|---|---|---|
| **STR-01** | `PATCH /rest/v1/matches` | Streamer Role | Direct table update attempting to set `live_room_name` | **HTTP 403 / 0 rows** | Direct table UPDATE is completely blocked |
| **STR-02** | `RPC update_match_live_room` | Streamer Role | `{"p_match_id": "<id>", "p_live_room_name": "stadium-1"}` | **HTTP 200 OK** | Room name updated successfully |
| **STR-03** | `PATCH /rest/v1/matches` | Streamer Role | Direct table update: `{"score_a": 10}` | **HTTP 403 / 0 rows** | Score modification blocked |
| **STR-04** | `PATCH /rest/v1/matches` | Streamer Role | Direct table update: `{"score_b": 10}` | **HTTP 403 / 0 rows** | Score modification blocked |
| **STR-05** | `PATCH /rest/v1/matches` | Streamer Role | Direct table update: `{"status": "completed"}` | **HTTP 403 / 0 rows** | Status change blocked |
| **STR-06** | `PATCH /rest/v1/matches` | Streamer Role | Direct table update: `{"winner_id": "<id>"}` | **HTTP 403 / 0 rows** | Winner change blocked |
| **STR-07** | `PATCH /rest/v1/matches` | Streamer Role | Direct table update: `{"participant_a": "<id>"}` | **HTTP 403 / 0 rows** | Participant change blocked |
| **STR-08** | `PATCH /rest/v1/matches` | Streamer Role | Direct table update: `{"notes": "tampered"}` | **HTTP 403 / 0 rows** | Notes change blocked |
| **STR-09** | `PATCH /rest/v1/matches` | Moderator Role | Direct table update: `{"score_a": 2, "score_b": 1, "status": "completed"}` | **HTTP 200 / 1 row** | Moderator retains full score management |

---

### Suite 3: Viewer Session Security & Heartbeat Authentication Tests

| Test ID | Scenario | Actor | Action / Payload | Expected Result |
|---|---|---|---|---|
| **VWR-01** | Direct table `SELECT` | Anonymous | `SELECT * FROM live_viewer_sessions` | **Empty response / 0 rows** (Leaking private sessions blocked) |
| **VWR-02** | Direct table `UPDATE` | Anonymous | `UPDATE live_viewer_sessions SET duration_seconds = 9999` | **HTTP 403 / Revoked** (Direct updates revoked) |
| **VWR-03** | Initial session creation | Anonymous | `RPC record_viewer_pulse(p_match_id)` | **200 OK returning `{ sessionId, clientSecret }`** |
| **VWR-04** | Valid session heartbeat | Anonymous | `RPC record_viewer_pulse(p_match_id, sessionId, validSecret)` | **200 OK returning `{ success: true }`** |
| **VWR-05** | Unauthorized session heartbeat | Attacker (Another user) | `RPC record_viewer_pulse(p_match_id, targetSessionId, wrongSecret)` | **`{ success: false, code: 'INVALID_CREDENTIAL' }`** (Tampering rejected) |
| **VWR-06** | Read viewer sessions | Admin Role | `SELECT * FROM live_viewer_sessions` | **200 OK** (Admins can monitor live spectator counts) |

---

### Suite 4: Registration RPC Business Logic & Concurrency Tests

| Test ID | Scenario | Actor / State | Input | Expected Result |
|---|---|---|---|---|
| **REG-01** | Unauthenticated execution | Anonymous | `register_tournament_participant(...)` | `{ success: false, code: 'UNAUTHENTICATED' }` |
| **REG-02** | Unaccepted rules | Player | `p_rules_accepted = false` | `{ success: false, code: 'RULES_NOT_ACCEPTED' }` |
| **REG-03** | Suspended player | Suspended Player | `register_tournament_participant(...)` | `{ success: false, code: 'ACCOUNT_RESTRICTED' }` |
| **REG-04** | Invalid eFootball ID format | Player with ID `ABCD123` | `register_tournament_participant(...)` | `{ success: false, code: 'INVALID_EFOOTBALL_ID_FORMAT' }` |
| **REG-05** | Valid eFootball ID format | Player with ID `ABCD-123-456-789` | `register_tournament_participant(...)` | Format accepted |
| **REG-06** | Missing private tournament password | Player | Private tournament, `p_access_code = NULL` | `{ success: false, code: 'ACCESS_CODE_REQUIRED' }` |
| **REG-07** | Invalid private tournament password | Player | Private tournament, `p_access_code = 'wrong'` | `{ success: false, code: 'INVALID_ACCESS_CODE' }` |
| **REG-08** | Valid private tournament password | Player | Private tournament, `p_access_code = 'secret123'` | Success |
| **REG-09** | Free tournament registration | Player | Open free tournament | `{ success: true, status: 'confirmed' }`, participant active, confirmed slot + 1 |
| **REG-10** | Paid tournament registration | Player | Open paid tournament | `{ success: true, status: 'pending_payment' }`, **NO** active participant, reserved slot + 1 (30 min expiry) |
| **REG-11** | Concurrent eFootball ID collision | 2 simultaneous sessions | Same normalized eFootball ID | Exactly **one** succeeds; second receives `EFOOTBALL_ID_TAKEN` |
| **REG-12** | Concurrent final-slot race | 10 concurrent requests for 1 remaining slot | 10 distinct authenticated players | Exactly **one** receives confirmation; 9 receive `CAPACITY_FULL` |
| **REG-13** | Direct staff insert capacity bypass attempt | Admin direct SQL insert | `INSERT INTO participants` when capacity is full | **Trigger exception thrown:** `Tournament capacity reached` |

---

### Suite 5: Function Execution Privileges & RLS Bypass Tests

| Test ID | Scenario | Actor | Execution Target | Expected Result |
|---|---|---|---|---|
| **FNC-01** | Direct function execute as anon | Anonymous | `SELECT get_admin_role()` | **HTTP 403 / Permission Denied** |
| **FNC-02** | Direct function execute as anon | Anonymous | `SELECT has_admin_role('super_admin')` | **HTTP 403 / Permission Denied** |
| **FNC-03** | Direct function execute as anon | Anonymous | `SELECT is_admin()` | **HTTP 403 / Permission Denied** |
| **FNC-04** | Direct function execute as anon | Anonymous | `SELECT update_match_live_room(...)` | **HTTP 403 / Permission Denied** |
| **FNC-05** | Direct function execute as anon | Anonymous | `SELECT register_tournament_participant(...)` | **HTTP 403 / Permission Denied** |
| **FNC-06** | Sequence tampering | Authenticated | `SELECT nextval('any_seq')` or drop sequence | **Permission Denied** |
| **FNC-07** | Bypass via view joining | Anonymous | Query `tournament_participants_public` joined with `participants` | **Permission Denied on `participants`** |
| **FNC-08** | Legacy policy revival test | Authenticated | Probe using old policy names (`"Allow write access on matches"`) | **Policy does not exist; dynamic purge verified** |
