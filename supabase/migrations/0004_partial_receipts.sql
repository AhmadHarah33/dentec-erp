-- Partial purchase receipts: how much of each line has arrived so far.
-- Stock itself is still the ledger; this is the running tally per line so a
-- second delivery knows what is still outstanding. Nullable on purpose: a
-- writer that does not know the field leaves it empty, and the app reads
-- empty as zero.

begin;
alter table erp.purchase_order_lines
  add column received_qty numeric default 0 check (received_qty is null or received_qty >= 0);
commit;
