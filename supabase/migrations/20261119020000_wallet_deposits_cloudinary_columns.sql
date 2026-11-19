-- Migration: Add Cloudinary proof columns to wallet_deposits
-- Reversible: DROP COLUMN proof_cloudinary_public_id, DROP COLUMN proof_asset_type

ALTER TABLE public.wallet_deposits
  ADD COLUMN IF NOT EXISTS proof_cloudinary_public_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS proof_asset_type TEXT DEFAULT NULL;

COMMENT ON COLUMN public.wallet_deposits.proof_cloudinary_public_id
  IS 'Cloudinary public_id for payment proof screenshot; NULL for legacy Supabase Storage records';

COMMENT ON COLUMN public.wallet_deposits.proof_asset_type
  IS 'Storage backend: "cloudinary" (new) or "supabase" (legacy). NULL = legacy.';
