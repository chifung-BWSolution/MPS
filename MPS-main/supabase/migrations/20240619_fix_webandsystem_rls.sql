-- Allow authenticated users to insert and update webandsystem_list
-- (previously only service_role could write, causing new entries to be lost on refresh)

CREATE POLICY "Allow insert for authenticated users"
  ON public.webandsystem_list FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users"
  ON public.webandsystem_list FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
