ALTER TABLE IF EXISTS user_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access" ON user_info;
CREATE POLICY "Allow authenticated full access"
  ON user_info
  FOR ALL
  USING (true)
  WITH CHECK (true);
