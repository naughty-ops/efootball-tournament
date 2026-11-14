# STORAGE & LIVEKIT STREAMING AUDIT REPORT
**Project:** eFootball Tournament Platform  
**Target Modules:** `lib/cloudinary/server.ts`, `app/actions/mediaActions.ts`, `app/api/livekit/token/route.ts`, `lib/livekit/matchRoom.ts`  
**External Services:** Cloudinary Media Storage & LiveKit Cloud Livestreaming  

---

## 1. Executive Summary

Asset storage and livestreaming functionalities rely on Cloudinary and LiveKit Cloud.
Both services are integrated using server-authoritative tokens and cryptographic signatures.
LiveKit token issuance is guarded by a role-based access control engine (`evaluateCallerRole`) that prevents normal players from obtaining broadcasting capabilities.
Cloudinary uploads require signed parameters generated on the server with strict MIME-type and size constraints.

---

## 2. Cloudinary Storage Architecture & Security

### Asset Management Review:
- **Server Module:** `lib/cloudinary/server.ts` uses `import 'server-only'` to guarantee API secrets are never bundled into client bundles.
- **Upload Mechanism:** Two mechanisms supported:
  1. Direct server upload via `uploadMediaAction` (reads buffer and streams to Cloudinary).
  2. Signed direct upload params via `getSignedUploadParamsAction` (generates timestamped HMAC-SHA1 signature).
- **Public ID & URL Sanitization:** Public IDs are validated against strict regex: `^[a-zA-Z0-9_\-\.\/]+$`.
- **Private Evidence Urls:** Dispute screenshots are generated as signed private delivery URLs via `getPrivateEvidenceUrlAction` with short expiration to prevent unauthorized viewing of sensitive dispute proof.

### Recommendations:
1. Ensure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are configured in production. When unconfigured, `getCloudinary()` throws an explicit descriptive error.
2. Configure Cloudinary incoming upload presets with explicit virus scanning (e.g. Cloudinary Anti-Virus add-on) for player screenshot submissions.

---

## 3. LiveKit Cloud Livestreaming Engine

### Token Issuance Endpoint: `app/api/livekit/token/route.ts`

| Security Gate | Implementation Status | Evidence |
| :--- | :--- | :--- |
| **Anonymous Callers** | **VIEWER ONLY** | `canPublish: false`, `canPublishData: false` |
| **Normal Players** | **VIEWER ONLY** | Returns 403 Forbidden if requesting `broadcaster` role |
| **Assigned Streamers** | **BROADCASTER (Conditional)** | Allowed only if assigned to match in `match_streamer_assignments` |
| **Administrators** | **BROADCASTER / ADMIN** | Allowed full broadcast and moderation privileges |
| **Suspended Accounts** | **STRIPPED** | Accounts in `suspended` or `disabled` status lose all elevated roles |
| **Room Identifier Validation** | **ENFORCED** | Room must match active match in `matches` table |
| **Concluded Match Lock** | **ENFORCED** | Rejects broadcasting to `completed` or `walkover` matches |
| **CORS & Rate Limiting** | **ENFORCED** | IP rate-limited to 30 requests/minute |

### Finding on In-Memory Viewer Session Count:
The endpoint and `viewerSessionService.ts` record viewer presence in `public.live_viewer_sessions`.
During massive viewer influxes, inserting a row per viewer heartbeat creates write contention on PostgreSQL.
**Recommendation:** Offload live viewer counts to LiveKit Server Webhooks (`participant_joined`, `participant_left`) aggregated in Redis rather than frequent database inserts from client players.
