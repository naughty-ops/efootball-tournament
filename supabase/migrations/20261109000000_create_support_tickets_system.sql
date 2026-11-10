-- Migration: 20261109000000_create_support_tickets_system.sql
-- Description: Create support tickets, ticket messages, and ticket audit logs tables,
-- harmonize match_disputes lifecycle statuses, and add RLS policies.

-- 1. Create ticket number generator sequence
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START WITH 1001;

-- 2. Create support_tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  player_name TEXT NOT NULL,
  player_email TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'match_dispute',
    'match_not_started',
    'score_disagreement',
    'screenshot_evidence',
    'player_complaint',
    'tournament_issue',
    'technical_support',
    'other'
  )),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'pending_review',
    'under_investigation',
    'waiting_for_player',
    'resolved',
    'rejected',
    'closed'
  )),
  assigned_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
  match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  evidence_url TEXT,
  evidence_public_id TEXT,
  resolution_notes TEXT,
  rejection_reason TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Trigger to auto-generate ticket number for support_tickets
CREATE OR REPLACE FUNCTION public.set_support_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'TKT-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.ticket_number_seq')::text, 4, '0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_support_ticket_number ON public.support_tickets;
CREATE TRIGGER trg_set_support_ticket_number
BEFORE INSERT OR UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_support_ticket_number();

-- 4. Extend match_disputes with priority, assignment, ticket_number, and updated statuses
ALTER TABLE public.match_disputes 
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'high' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  ADD COLUMN IF NOT EXISTS assigned_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ticket_number TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.match_disputes DROP CONSTRAINT IF EXISTS match_disputes_status_check;
ALTER TABLE public.match_disputes ADD CONSTRAINT match_disputes_status_check 
  CHECK (status IN (
    'open',
    'pending_review',
    'under_investigation',
    'waiting_for_player',
    'resolved',
    'rejected',
    'closed',
    'under_review'
  ));

-- Auto-populate ticket numbers for any existing disputes without one
UPDATE public.match_disputes 
SET ticket_number = 'DSP-' || to_char(created_at, 'YYYYMM') || '-' || lpad(nextval('public.ticket_number_seq')::text, 4, '0')
WHERE ticket_number IS NULL;

ALTER TABLE public.match_disputes ALTER COLUMN ticket_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_disputes_ticket_number ON public.match_disputes(ticket_number);

-- Trigger to auto-assign ticket number for new match disputes
CREATE OR REPLACE FUNCTION public.set_match_dispute_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'DSP-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.ticket_number_seq')::text, 4, '0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_match_dispute_ticket_number ON public.match_disputes;
CREATE TRIGGER trg_set_match_dispute_ticket_number
BEFORE INSERT OR UPDATE ON public.match_disputes
FOR EACH ROW
EXECUTE FUNCTION public.set_match_dispute_ticket_number();

-- 5. Create ticket_messages table (unified conversation history)
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  dispute_id UUID REFERENCES public.match_disputes(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('player', 'admin', 'system')),
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  evidence_url TEXT,
  evidence_public_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ticket_or_dispute CHECK (ticket_id IS NOT NULL OR dispute_id IS NOT NULL)
);

-- 6. Create ticket_audit_logs table (admin action history)
CREATE TABLE IF NOT EXISTS public.ticket_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  dispute_id UUID REFERENCES public.match_disputes(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_name TEXT,
  action TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_audit_target CHECK (ticket_id IS NOT NULL OR dispute_id IS NOT NULL)
);

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON public.support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON public.support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_admin ON public.support_tickets(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_disputes_priority ON public.match_disputes(priority);
CREATE INDEX IF NOT EXISTS idx_match_disputes_assigned_admin ON public.match_disputes(assigned_admin_id);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_dispute_id ON public.ticket_messages(dispute_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_logs_ticket_id ON public.ticket_audit_logs(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_audit_logs_dispute_id ON public.ticket_audit_logs(dispute_id, created_at DESC);

-- 8. Enable Row Level Security
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for support_tickets
DROP POLICY IF EXISTS "Support tickets select policy" ON public.support_tickets;
CREATE POLICY "Support tickets select policy" ON public.support_tickets
  FOR SELECT TO authenticated, anon
  USING (
    is_admin() OR 
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Support tickets insert policy" ON public.support_tickets;
CREATE POLICY "Support tickets insert policy" ON public.support_tickets
  FOR INSERT TO authenticated, anon
  WITH CHECK (
    is_admin() OR 
    (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Support tickets update policy" ON public.support_tickets;
CREATE POLICY "Support tickets update policy" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (
    is_admin() OR 
    (user_id = auth.uid() AND status IN ('open', 'waiting_for_player'))
  )
  WITH CHECK (
    is_admin() OR 
    (user_id = auth.uid() AND status IN ('open', 'waiting_for_player'))
  );

DROP POLICY IF EXISTS "Support tickets delete policy" ON public.support_tickets;
CREATE POLICY "Support tickets delete policy" ON public.support_tickets
  FOR DELETE TO authenticated
  USING (is_admin());

-- Policies for ticket_messages
DROP POLICY IF EXISTS "Ticket messages select policy" ON public.ticket_messages;
CREATE POLICY "Ticket messages select policy" ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    is_admin() OR (
      is_internal = false AND (
        (ticket_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.support_tickets st 
          WHERE st.id = ticket_messages.ticket_id AND st.user_id = auth.uid()
        ))
        OR
        (dispute_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.match_disputes md
          JOIN public.participants p ON (p.id = md.reporter_participant_id OR p.id = md.opponent_participant_id)
          WHERE md.id = ticket_messages.dispute_id AND p.user_id = auth.uid()
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Ticket messages insert policy" ON public.ticket_messages;
CREATE POLICY "Ticket messages insert policy" ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin() OR (
      is_internal = false AND sender_role = 'player' AND (
        (ticket_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.support_tickets st 
          WHERE st.id = ticket_messages.ticket_id AND st.user_id = auth.uid()
        ))
        OR
        (dispute_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.match_disputes md
          JOIN public.participants p ON (p.id = md.reporter_participant_id OR p.id = md.opponent_participant_id)
          WHERE md.id = ticket_messages.dispute_id AND p.user_id = auth.uid()
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Ticket messages update delete policy" ON public.ticket_messages;
CREATE POLICY "Ticket messages update delete policy" ON public.ticket_messages
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Policies for ticket_audit_logs (Admin Only)
DROP POLICY IF EXISTS "Ticket audit logs select policy" ON public.ticket_audit_logs;
CREATE POLICY "Ticket audit logs select policy" ON public.ticket_audit_logs
  FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Ticket audit logs insert policy" ON public.ticket_audit_logs;
CREATE POLICY "Ticket audit logs insert policy" ON public.ticket_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());
