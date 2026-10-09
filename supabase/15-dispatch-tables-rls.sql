-- Lock down dispatch_couriers and order_dispatch_events.
-- These tables hold admin-only shipping/courier data (tracking numbers, etc.).
-- The storefront never reads them through the Supabase REST/GraphQL API — all
-- access goes through the direct Postgres connection (DATABASE_URL, drizzle),
-- which is unaffected by RLS policies and grants below. service_role also
-- keeps full access.

alter table public.dispatch_couriers enable row level security;
alter table public.order_dispatch_events enable row level security;

revoke all on public.dispatch_couriers from anon;
revoke all on public.dispatch_couriers from authenticated;

revoke all on public.order_dispatch_events from anon;
revoke all on public.order_dispatch_events from authenticated;
