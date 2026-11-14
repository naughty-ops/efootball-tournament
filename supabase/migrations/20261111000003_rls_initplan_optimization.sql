-- ==============================================================================
-- Migration: 20261111000003_rls_initplan_optimization.sql
-- Description: Phase P1 - Row-Level Security InitPlan Performance Optimization
-- Hardening: Wraps bare auth.uid() and current_setting() in scalar subqueries (SELECT auth.uid())
--            to enable PostgreSQL query planner InitPlan optimization (evaluated once
--            per query rather than once per row), resolving all 59 auth_rls_initplan warnings.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Table: public.financial_audit_logs
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users and admins can insert audit logs" ON public.financial_audit_logs;
CREATE POLICY "Authenticated users and admins can insert audit logs"
    ON public.financial_audit_logs
    FOR INSERT
    TO public
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Only financial admins can view audit logs" ON public.financial_audit_logs;
CREATE POLICY "Only financial admins can view audit logs"
    ON public.financial_audit_logs
    FOR SELECT
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
              AND admin_users.role = ANY (ARRAY['super_admin'::public.admin_role, 'admin'::public.admin_role])
        )
    );

-- ------------------------------------------------------------------------------
-- 2. Table: public.match_disputes
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Disputes insert policy" ON public.match_disputes;
CREATE POLICY "Disputes insert policy"
    ON public.match_disputes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.participants p
            WHERE p.id = match_disputes.reporter_participant_id
              AND p.user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Disputes select policy" ON public.match_disputes;
CREATE POLICY "Disputes select policy"
    ON public.match_disputes
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.participants p
            WHERE (p.id = match_disputes.reporter_participant_id OR p.id = match_disputes.opponent_participant_id)
              AND p.user_id = (SELECT auth.uid())
        )
    );

-- ------------------------------------------------------------------------------
-- 3. Table: public.match_predictions
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own prediction" ON public.match_predictions;
CREATE POLICY "Users can insert own prediction"
    ON public.match_predictions
    FOR INSERT
    TO public
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own prediction before lock" ON public.match_predictions;
CREATE POLICY "Users can update own prediction before lock"
    ON public.match_predictions
    FOR UPDATE
    TO public
    USING (
        (SELECT auth.uid()) = user_id
        AND locked_at IS NULL
        AND result = 'pending'::text
    );

DROP POLICY IF EXISTS "Users can view own prediction" ON public.match_predictions;
CREATE POLICY "Users can view own prediction"
    ON public.match_predictions
    FOR SELECT
    TO public
    USING ((SELECT auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- 4. Table: public.match_streamer_assignments
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "match_streamer_assignments_streamer_select" ON public.match_streamer_assignments;
CREATE POLICY "match_streamer_assignments_streamer_select"
    ON public.match_streamer_assignments
    FOR SELECT
    TO authenticated
    USING (streamer_id = (SELECT auth.uid()));

-- ------------------------------------------------------------------------------
-- 5. Table: public.match_submissions
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Match submissions insert policy" ON public.match_submissions;
CREATE POLICY "Match submissions insert policy"
    ON public.match_submissions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin()
        OR (
            user_id = (SELECT auth.uid())
            AND EXISTS (
                SELECT 1 FROM public.participants p
                WHERE p.id = match_submissions.participant_id
                  AND p.user_id = (SELECT auth.uid())
            )
        )
    );

DROP POLICY IF EXISTS "Match submissions select policy" ON public.match_submissions;
CREATE POLICY "Match submissions select policy"
    ON public.match_submissions
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.matches m
            WHERE m.id = match_submissions.match_id
              AND (
                  m.participant_a IN (SELECT participants.id FROM public.participants WHERE participants.user_id = (SELECT auth.uid()))
                  OR m.participant_b IN (SELECT participants.id FROM public.participants WHERE participants.user_id = (SELECT auth.uid()))
              )
        )
    );

DROP POLICY IF EXISTS "Match submissions update policy" ON public.match_submissions;
CREATE POLICY "Match submissions update policy"
    ON public.match_submissions
    FOR UPDATE
    TO authenticated
    USING (
        public.is_admin()
        OR (
            user_id = (SELECT auth.uid())
            AND EXISTS (
                SELECT 1 FROM public.participants p
                WHERE p.id = match_submissions.participant_id
                  AND p.user_id = (SELECT auth.uid())
            )
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            user_id = (SELECT auth.uid())
            AND EXISTS (
                SELECT 1 FROM public.participants p
                WHERE p.id = match_submissions.participant_id
                  AND p.user_id = (SELECT auth.uid())
            )
        )
    );

-- ------------------------------------------------------------------------------
-- 6. Table: public.media_assets
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Media assets delete policy" ON public.media_assets;
CREATE POLICY "Media assets delete policy"
    ON public.media_assets
    FOR DELETE
    TO authenticated
    USING (
        public.is_admin()
        OR (
            owner_id = (SELECT auth.uid())
            AND entity_type <> ALL (ARRAY['match_evidence'::text, 'dispute_evidence'::text])
        )
    );

DROP POLICY IF EXISTS "Media assets owner update" ON public.media_assets;
CREATE POLICY "Media assets owner update"
    ON public.media_assets
    FOR UPDATE
    TO authenticated
    USING (
        public.is_admin()
        OR (
            owner_id = (SELECT auth.uid())
            AND entity_type <> ALL (ARRAY['match_evidence'::text, 'dispute_evidence'::text])
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            owner_id = (SELECT auth.uid())
            AND entity_type <> ALL (ARRAY['match_evidence'::text, 'dispute_evidence'::text])
        )
    );

DROP POLICY IF EXISTS "Media assets public read" ON public.media_assets;
CREATE POLICY "Media assets public read"
    ON public.media_assets
    FOR SELECT
    TO anon, authenticated
    USING (
        visibility = 'public'::text
        OR public.is_admin()
        OR owner_id = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS "Media assets user insert" ON public.media_assets;
CREATE POLICY "Media assets user insert"
    ON public.media_assets
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin()
        OR owner_id = (SELECT auth.uid())
    );

-- ------------------------------------------------------------------------------
-- 7. Table: public.participants
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "participants_delete_policy" ON public.participants;
CREATE POLICY "participants_delete_policy"
    ON public.participants
    FOR DELETE
    TO authenticated
    USING (
        public.is_admin()
        OR (
            (SELECT auth.uid()) = user_id
            AND EXISTS (
                SELECT 1 FROM public.tournaments t
                WHERE t.id = participants.tournament_id
                  AND t.status = 'registration'::text
            )
        )
    );

DROP POLICY IF EXISTS "participants_insert_policy" ON public.participants;
CREATE POLICY "participants_insert_policy"
    ON public.participants
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin()
        OR (
            (SELECT auth.uid()) = user_id
            AND EXISTS (
                SELECT 1 FROM public.tournaments t
                WHERE t.id = participants.tournament_id
                  AND t.status = 'registration'::text
            )
        )
    );

DROP POLICY IF EXISTS "participants_select_policy" ON public.participants;
CREATE POLICY "participants_select_policy"
    ON public.participants
    FOR SELECT
    TO anon, authenticated
    USING (
        public.is_admin()
        OR ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()))
        OR EXISTS (
            SELECT 1 FROM public.tournaments t
            WHERE t.id = participants.tournament_id
              AND (t.is_private = false OR t.status = ANY (ARRAY['registration'::text, 'ongoing'::text, 'completed'::text]))
        )
    );

DROP POLICY IF EXISTS "participants_update_policy" ON public.participants;
CREATE POLICY "participants_update_policy"
    ON public.participants
    FOR UPDATE
    TO authenticated
    USING (
        public.is_admin()
        OR (
            (SELECT auth.uid()) = user_id
            AND EXISTS (
                SELECT 1 FROM public.tournaments t
                WHERE t.id = participants.tournament_id
                  AND t.status = 'registration'::text
            )
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            (SELECT auth.uid()) = user_id
            AND EXISTS (
                SELECT 1 FROM public.tournaments t
                WHERE t.id = participants.tournament_id
                  AND t.status = 'registration'::text
            )
        )
    );

-- ------------------------------------------------------------------------------
-- 8. Table: public.payout_transactions
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Only admins can update payout transactions" ON public.payout_transactions;
CREATE POLICY "Only admins can update payout transactions"
    ON public.payout_transactions
    FOR UPDATE
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
              AND admin_users.role = ANY (ARRAY['super_admin'::public.admin_role, 'admin'::public.admin_role])
        )
    );

DROP POLICY IF EXISTS "Users and admins can insert payout transactions" ON public.payout_transactions;
CREATE POLICY "Users and admins can insert payout transactions"
    ON public.payout_transactions
    FOR INSERT
    TO public
    WITH CHECK (
        ((SELECT auth.uid()) = player_id AND payout_status = 'PENDING'::text)
        OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
              AND admin_users.role = ANY (ARRAY['super_admin'::public.admin_role, 'admin'::public.admin_role])
        )
    );

DROP POLICY IF EXISTS "Users and admins can view payout transactions" ON public.payout_transactions;
CREATE POLICY "Users and admins can view payout transactions"
    ON public.payout_transactions
    FOR SELECT
    TO public
    USING (
        (SELECT auth.uid()) = player_id
        OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
        )
    );

-- ------------------------------------------------------------------------------
-- 9. Table: public.player_achievements
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "player_achievements_insert_policy" ON public.player_achievements;
CREATE POLICY "player_achievements_insert_policy"
    ON public.player_achievements
    FOR INSERT
    TO public
    WITH CHECK (
        player_id = (SELECT auth.uid())
        OR public.has_admin_role('moderator'::public.admin_role)
    );

DROP POLICY IF EXISTS "player_achievements_read_policy" ON public.player_achievements;
CREATE POLICY "player_achievements_read_policy"
    ON public.player_achievements
    FOR SELECT
    TO public
    USING (
        player_id = (SELECT auth.uid())
        OR public.has_admin_role('moderator'::public.admin_role)
    );

-- ------------------------------------------------------------------------------
-- 10. Table: public.player_notifications
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and service role can insert notifications" ON public.player_notifications;
CREATE POLICY "Admins and service role can insert notifications"
    ON public.player_notifications
    FOR INSERT
    TO public
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.player_notifications;
CREATE POLICY "Users can update own notifications"
    ON public.player_notifications
    FOR UPDATE
    TO public
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own notifications" ON public.player_notifications;
CREATE POLICY "Users can view own notifications"
    ON public.player_notifications
    FOR SELECT
    TO public
    USING (
        (SELECT auth.uid()) = user_id
        OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
        )
    );

-- ------------------------------------------------------------------------------
-- 11. Table: public.player_payment_methods
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users and financial admins can view payment methods" ON public.player_payment_methods;
CREATE POLICY "Users and financial admins can view payment methods"
    ON public.player_payment_methods
    FOR SELECT
    TO public
    USING (
        (SELECT auth.uid()) = user_id
        OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
              AND admin_users.role = ANY (ARRAY['super_admin'::public.admin_role, 'admin'::public.admin_role])
        )
    );

DROP POLICY IF EXISTS "Users can delete own payment methods" ON public.player_payment_methods;
CREATE POLICY "Users can delete own payment methods"
    ON public.player_payment_methods
    FOR DELETE
    TO public
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own payment methods" ON public.player_payment_methods;
CREATE POLICY "Users can insert own payment methods"
    ON public.player_payment_methods
    FOR INSERT
    TO public
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own payment methods" ON public.player_payment_methods;
CREATE POLICY "Users can update own payment methods"
    ON public.player_payment_methods
    FOR UPDATE
    TO public
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- 12. Table: public.player_wallets
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Only admins can update wallets" ON public.player_wallets;
CREATE POLICY "Only admins can update wallets"
    ON public.player_wallets
    FOR UPDATE
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users and admins can insert wallets" ON public.player_wallets;
CREATE POLICY "Users and admins can insert wallets"
    ON public.player_wallets
    FOR INSERT
    TO public
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users and admins can view wallets" ON public.player_wallets;
CREATE POLICY "Users and admins can view wallets"
    ON public.player_wallets
    FOR SELECT
    TO public
    USING (
        (SELECT auth.uid()) = user_id
        OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
        )
    );

-- ------------------------------------------------------------------------------
-- 13. Table: public.prize_distributions
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage prize distributions" ON public.prize_distributions;
CREATE POLICY "Admins can manage prize distributions"
    ON public.prize_distributions
    FOR ALL
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
              AND admin_users.role = ANY (ARRAY['super_admin'::public.admin_role, 'admin'::public.admin_role])
        )
    );

DROP POLICY IF EXISTS "Users and admins can view prize distributions" ON public.prize_distributions;
CREATE POLICY "Users and admins can view prize distributions"
    ON public.prize_distributions
    FOR SELECT
    TO public
    USING (
        (SELECT auth.uid()) = player_id
        OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
        )
    );

-- ------------------------------------------------------------------------------
-- 14. Table: public.profiles
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = id)
    WITH CHECK (
        (SELECT auth.uid()) = id
        AND (
            (NOT (efootball_verification_status IS DISTINCT FROM 'not_submitted'::text))
            OR (NOT (efootball_verification_status IS DISTINCT FROM 'pending'::text))
            OR (efootball_verification_status = (SELECT p.efootball_verification_status FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
        )
        AND (
            (NOT (whatsapp_verification_status IS DISTINCT FROM 'not_submitted'::text))
            OR (NOT (whatsapp_verification_status IS DISTINCT FROM 'pending'::text))
            OR (whatsapp_verification_status = (SELECT p.whatsapp_verification_status FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
        )
        AND (NOT (efootball_verified_at IS DISTINCT FROM (SELECT p.efootball_verified_at FROM public.profiles p WHERE p.id = (SELECT auth.uid()))))
        AND (NOT (efootball_verified_by IS DISTINCT FROM (SELECT p.efootball_verified_by FROM public.profiles p WHERE p.id = (SELECT auth.uid()))))
        AND (NOT (whatsapp_verified_at IS DISTINCT FROM (SELECT p.whatsapp_verified_at FROM public.profiles p WHERE p.id = (SELECT auth.uid()))))
    );

-- ------------------------------------------------------------------------------
-- 15. Table: public.restream_audit_logs
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.restream_audit_logs;
CREATE POLICY "Users can insert own audit logs"
    ON public.restream_audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own audit logs" ON public.restream_audit_logs;
CREATE POLICY "Users can view own audit logs"
    ON public.restream_audit_logs
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- 16. Table: public.restream_jobs
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own restream jobs" ON public.restream_jobs;
CREATE POLICY "Users can manage own restream jobs"
    ON public.restream_jobs
    FOR ALL
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- 17. Table: public.restream_logs
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own restream logs" ON public.restream_logs;
CREATE POLICY "Users can insert own restream logs"
    ON public.restream_logs
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own restream logs" ON public.restream_logs;
CREATE POLICY "Users can view own restream logs"
    ON public.restream_logs
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- 18. Table: public.restream_settings
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own restream settings" ON public.restream_settings;
CREATE POLICY "Users can manage own restream settings"
    ON public.restream_settings
    FOR ALL
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- 19. Table: public.restream_sources
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own restream sources" ON public.restream_sources;
CREATE POLICY "Users can manage own restream sources"
    ON public.restream_sources
    FOR ALL
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- 20. Table: public.support_tickets
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Support tickets insert policy" ON public.support_tickets;
CREATE POLICY "Support tickets insert policy"
    ON public.support_tickets
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        public.is_admin()
        OR user_id IS NULL
        OR user_id = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS "Support tickets select policy" ON public.support_tickets;
CREATE POLICY "Support tickets select policy"
    ON public.support_tickets
    FOR SELECT
    TO anon, authenticated
    USING (
        public.is_admin()
        OR ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "Support tickets update policy" ON public.support_tickets;
CREATE POLICY "Support tickets update policy"
    ON public.support_tickets
    FOR UPDATE
    TO authenticated
    USING (
        public.is_admin()
        OR (
            user_id = (SELECT auth.uid())
            AND status = ANY (ARRAY['open'::text, 'waiting_for_player'::text])
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            user_id = (SELECT auth.uid())
            AND status = ANY (ARRAY['open'::text, 'waiting_for_player'::text])
        )
    );

-- ------------------------------------------------------------------------------
-- 21. Table: public.terms_acceptances
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "terms_acceptances_insert_policy" ON public.terms_acceptances;
CREATE POLICY "terms_acceptances_insert_policy"
    ON public.terms_acceptances
    FOR INSERT
    TO public
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "terms_acceptances_read_policy" ON public.terms_acceptances;
CREATE POLICY "terms_acceptances_read_policy"
    ON public.terms_acceptances
    FOR SELECT
    TO public
    USING (
        user_id = (SELECT auth.uid())
        OR public.has_admin_role('moderator'::public.admin_role)
    );

-- ------------------------------------------------------------------------------
-- 22. Table: public.ticket_messages
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Ticket messages insert policy" ON public.ticket_messages;
CREATE POLICY "Ticket messages insert policy"
    ON public.ticket_messages
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin()
        OR (
            is_internal = false
            AND sender_role = 'player'::text
            AND (
                (
                    ticket_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.support_tickets st
                        WHERE st.id = ticket_messages.ticket_id
                          AND st.user_id = (SELECT auth.uid())
                    )
                )
                OR (
                    dispute_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.match_disputes md
                        JOIN public.participants p ON (p.id = md.reporter_participant_id OR p.id = md.opponent_participant_id)
                        WHERE md.id = ticket_messages.dispute_id
                          AND p.user_id = (SELECT auth.uid())
                    )
                )
            )
        )
    );

DROP POLICY IF EXISTS "Ticket messages select policy" ON public.ticket_messages;
CREATE POLICY "Ticket messages select policy"
    ON public.ticket_messages
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (
            is_internal = false
            AND (
                (
                    ticket_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.support_tickets st
                        WHERE st.id = ticket_messages.ticket_id
                          AND st.user_id = (SELECT auth.uid())
                    )
                )
                OR (
                    dispute_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.match_disputes md
                        JOIN public.participants p ON (p.id = md.reporter_participant_id OR p.id = md.opponent_participant_id)
                        WHERE md.id = ticket_messages.dispute_id
                          AND p.user_id = (SELECT auth.uid())
                    )
                )
            )
        )
    );

-- ------------------------------------------------------------------------------
-- 23. Table: public.tournament_registrations
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own registrations" ON public.tournament_registrations;
CREATE POLICY "Users can insert own registrations"
    ON public.tournament_registrations
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can read own registrations" ON public.tournament_registrations;
CREATE POLICY "Users can read own registrations"
    ON public.tournament_registrations
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own unconfirmed registrations" ON public.tournament_registrations;
CREATE POLICY "Users can update own unconfirmed registrations"
    ON public.tournament_registrations
    FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND (status)::text = ANY (ARRAY['pending_payment'::text, 'payment_submitted'::text, 'cancelled'::text])
    );

-- ------------------------------------------------------------------------------
-- 24. Table: public.wallet_transactions
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Only admins can insert wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Only admins can insert wallet transactions"
    ON public.wallet_transactions
    FOR INSERT
    TO public
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users and admins can view wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users and admins can view wallet transactions"
    ON public.wallet_transactions
    FOR SELECT
    TO public
    USING (
        (SELECT auth.uid()) = user_id
        OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE admin_users.id = (SELECT auth.uid())
        )
    );

-- ------------------------------------------------------------------------------
-- 25. Table: public.youtube_accounts
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own youtube accounts" ON public.youtube_accounts;
CREATE POLICY "Users can manage own youtube accounts"
    ON public.youtube_accounts
    FOR ALL
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
