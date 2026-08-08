-- Enable RLS and public SELECT policy for group_participants table
ALTER TABLE public.group_participants ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'group_participants' 
        AND policyname = 'Allow public read access on group_participants'
    ) THEN
        CREATE POLICY "Allow public read access on group_participants"
            ON public.group_participants FOR SELECT USING (true);
    END IF;
END $$;
