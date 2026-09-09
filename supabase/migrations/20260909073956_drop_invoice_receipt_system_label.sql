-- system_label was a denormalized display field. Invoice/receipt flows now
-- read project_types from the related quotation_client_project instead.

ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS system_label;

ALTER TABLE public.receipts
  DROP COLUMN IF EXISTS system_label;
