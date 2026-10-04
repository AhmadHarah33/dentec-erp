-- A fifth working role: head of technical service. Widens the role check on
-- erp.users; no data changes.

begin;
alter table erp.users drop constraint users_role_check;
alter table erp.users add constraint users_role_check
  check (role in ('owner','accountant','sales','technician','service_lead','viewer'));
commit;
