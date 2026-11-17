-- ==============================================================================
-- Migration: 20261118080000_storage_payment_proofs_rls_hardening.sql
-- Description: Harden and fix storage RLS policies for 'payment-proofs' bucket
--              to ensure authenticated users can reliably upload payment receipts
--              under their own folder, 1v1 dispute screenshots, and admins can manage.
-- ==============================================================================

-- 1. Ensure bucket 'payment-proofs' exists and is properly configured
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payment-proofs',
    'payment-proofs',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 2. Drop existing restrictive policies on payment-proofs
DROP POLICY IF EXISTS "Users can upload own payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users and financial admins view payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins and service can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Financial admins manage payment proofs" ON storage.objects;

-- 3. Comprehensive INSERT policy for payment-proofs
CREATE POLICY "Users can upload own payment proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'payment-proofs' AND (
        -- User uploading to their own user folder: <user_id>/filename.ext
        LOWER((storage.foldername(name))[1]) = LOWER((auth.uid())::text)
        OR
        -- Match/1v1 dispute screenshot uploads: 1v1/<match_id>/...
        (storage.foldername(name))[1] = '1v1'
        OR
        -- Financial admin or service role
        public.is_financial_admin()
        OR
        COALESCE(auth.role(), '') = 'service_role'
    )
);

-- 4. Comprehensive SELECT policy for payment-proofs
CREATE POLICY "Users and financial admins view payment proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'payment-proofs' AND (
        -- User viewing their own files
        LOWER((storage.foldername(name))[1]) = LOWER((auth.uid())::text)
        OR
        -- 1v1 match screenshots
        (storage.foldername(name))[1] = '1v1'
        OR
        -- Financial admin or service role
        public.is_financial_admin()
        OR
        COALESCE(auth.role(), '') = 'service_role'
    )
);

-- 5. Financial admins and service role DELETE / UPDATE policy
CREATE POLICY "Financial admins manage payment proofs"
ON storage.objects FOR ALL
TO authenticated
USING (
    bucket_id = 'payment-proofs' AND (
        public.is_financial_admin()
        OR
        COALESCE(auth.role(), '') = 'service_role'
    )
)
WITH CHECK (
    bucket_id = 'payment-proofs' AND (
        public.is_financial_admin()
        OR
        COALESCE(auth.role(), '') = 'service_role'
    )
);
