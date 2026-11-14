# WALLET & PAYOUT AUDIT REPORT: Financial Integrity, Encryption & State Transitions
**Project:** eFootball Tournament Platform  
**Target Modules:** `services/walletService.ts`, `lib/wallet/crypto.ts`, `app/actions/walletActions.ts`  
**Database Tables:** `player_wallets`, `wallet_transactions`, `player_payment_methods`, `prize_distributions`, `payout_transactions`, `financial_audit_logs`  

---

## 1. Executive Summary

The platform operates an Indian Rupee (INR) financial ledger denominated authoritatively in paise ($1 \text{ INR} = 100 \text{ paise}$) to avoid IEEE 754 floating-point inaccuracies.
Bank account numbers and sensitive payment credentials are encrypted using AES-256-GCM authenticated encryption.
The double-entry audit logging (`financial_audit_logs`) and immutable transaction history provide high compliance assurance.
However, two operational risks were identified regarding environment variable fallback behavior and concurrent payout requests.

---

## 2. Currency & Ledger Design

| Parameter | Specification | Implementation Evidence |
| :--- | :--- | :--- |
| **Base Currency Unit** | **Paise (BigInt / integer)** | All DB columns: `amount_paise`, `prize_amount_paise`, `entry_fee_paise` |
| **Display Currency Unit** | **INR (Float)** | Computed via `paiseToInr()` and formatted with `Intl.NumberFormat` |
| **Floating Point Protection** | **Enforced** | No financial calculation in SQL or TS uses float addition/subtraction |
| **Double-Entry Auditing** | **Enforced** | `financial_audit_logs` records all balance state mutations with `admin_id` |
| **Ledger Immutability** | **Enforced** | `wallet_transactions` table has no `UPDATE` or `DELETE` RLS policies granted |

---

## 3. Cryptographic Implementation (`lib/wallet/crypto.ts`)

### Cryptographic Configuration:
- **Algorithm:** `aes-256-gcm`
- **Key Derivation:** SHA-256 hash derived from dedicated server secret: `crypto.createHash('sha256').update('efootball-wallet-kdf:' + secret).digest()`
- **Initialization Vector:** 12 bytes (96 bits) randomly generated per encryption via `crypto.randomBytes(12)`
- **Authentication Tag:** 16 bytes (128 bits) validated on decryption to prevent ciphertext tampering
- **Storage Format:** `iv:authTag:ciphertext` (hex encoded)

### Validation & Display Masking:
- **Bank Account Number:** Validated against `^\d{9,18}$`
- **IFSC Code:** Validated against `^[A-Z]{4}0[A-Z0-9]{6}$`
- **UPI ID:** Validated against `^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$`
- **Masking:** Output strings format as `XXXX XXXX 1234` or `XXXX 1234`. Full account numbers are never exposed in user-facing client payloads or client logs.

---

## 4. Wallet Balance Calculation & Race Condition Analysis

### Authoritative Balance Calculation:
In `services/walletService.ts` (`getPlayerWalletOverview`):
- Total Earnings: Sum of `prize_distributions` where `status = 'awarded'`.
- Pending Earnings: Sum of `prize_distributions` where `status = 'pending_approval'`.
- Total Paid: Sum of `payout_transactions` where `payout_status = 'PAID'`.
- Processing Payouts: Sum of `payout_transactions` where `payout_status = 'PROCESSING'`.
- Available for Payout: Sum of `payout_transactions` in `APPROVED` or `PENDING` states.
- Client inputs are never trusted; amounts are calculated strictly from authoritative database rows.

### Concurrency Risk in Payout Requests:
In `services/walletService.ts` (`requestPlayerPayout`):
- A user can submit multiple simultaneous payout requests if latency occurs before status changes to `'PROCESSING'`.
- **Finding:** While `wallet_transactions` supports `idempotency_key`, the client submission in `requestPayoutAction` does not generate an authoritative idempotency token from the prize distribution ID.
- **Remediation:** Introduce a database-level unique index on `payout_transactions (prize_distribution_id)` or an atomic RPC procedure with `FOR UPDATE` row-locking on the prize distribution record.

---

## 5. Security & Fallback Findings

1. **`admin.ts` Fallback Suppression:**
   In `lib/supabase/admin.ts`, if `SUPABASE_SERVICE_ROLE_KEY` is undefined, the admin client logs a warning and falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY`. In financial flows, this causes calls to `player_wallets` to run under the `anon` role, resulting in silent RLS rejection and empty balances rather than a fatal fail-fast error.
2. **Missing Production Encryption Secret Guard:**
   `lib/wallet/crypto.ts` throws an error in production if `WALLET_ENCRYPTION_SECRET` is unset. Ensure this secret is explicitly provisioned in the Vercel Production Environment Settings.
