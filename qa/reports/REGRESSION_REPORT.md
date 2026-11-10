# REGRESSION TEST REPORT

**Execution Timestamp:** 2026-11-10T09:46:16.742Z  
**Target:** eFootball Tournament Platform v1.0.0  
**Regression Pass Rate:** **100.0%**  

---

## 1. Regression Verification Against Previous Releases

1. **Navbar Item Hierarchy:**
   - Nav items are standardized: `Home`, `Tournaments`, `Matches`, `Wallet`, `Profile`.
   - Alerts bell icon resides cleanly next to "Explore Tournaments" without shifting layout.
   - Verified zero regression on mobile/tablet viewports.

2. **Upload Feature Quarantine:**
   - Public and pre-match ticket uploads remain completely removed.
   - Uploading screenshot evidence is exclusively permitted in `UploadMatchEvidenceModal` during match dispute resolution.

3. **Service Worker Stability:**
   - `TypeError: Failed to convert value to 'Response'` completely eradicated in `public/sw.js`.
   - Development server on `localhost` does not suffer from service worker cache collisions.
