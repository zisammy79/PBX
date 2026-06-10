-- Slice D: invoice status enum extensions (must commit before use in later migration)

ALTER TYPE "invoice_status" ADD VALUE IF NOT EXISTS 'finalized';--> statement-breakpoint
ALTER TYPE "invoice_status" ADD VALUE IF NOT EXISTS 'payment_failed';
