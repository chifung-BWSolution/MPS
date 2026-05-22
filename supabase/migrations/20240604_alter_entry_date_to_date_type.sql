-- Change entry_date column from TEXT to DATE type for proper date operations
-- First, convert any existing text values to proper date format
ALTER TABLE public.staff_directory 
  ALTER COLUMN entry_date TYPE DATE USING (
    CASE 
      WHEN entry_date IS NOT NULL AND entry_date != '' 
      THEN entry_date::DATE 
      ELSE NULL 
    END
  );
