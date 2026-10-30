-- Run this once in the Supabase SQL Editor for the ticketing project.
-- This app uses shared team data: any authenticated user can work with all
-- tickets, schedules, and attachments. These policies do not isolate rows by user.

begin;

alter table public.tickets enable row level security;
alter table public.schedule enable row level security;
alter table public.ticket_images enable row level security;

-- Remove existing policies on these app tables so an older anon/public policy
-- cannot continue to expose the records. Replace them with authenticated-only access.
do $$
declare
    policy_row record;
begin
    for policy_row in
        select schemaname, tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and tablename in ('tickets', 'schedule', 'ticket_images')
    loop
        execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
    end loop;
end
$$;

revoke all on table public.tickets, public.schedule, public.ticket_images from anon, public;
grant select, insert, update, delete on table public.tickets, public.schedule, public.ticket_images to authenticated;

create policy ticketing_authenticated_access on public.tickets
    for all to authenticated
    using (auth.uid() is not null)
    with check (auth.uid() is not null);

create policy ticketing_authenticated_access on public.schedule
    for all to authenticated
    using (auth.uid() is not null)
    with check (auth.uid() is not null);

create policy ticketing_authenticated_access on public.ticket_images
    for all to authenticated
    using (auth.uid() is not null)
    with check (auth.uid() is not null);

-- Ticket and schedule attachments are served through short-lived signed URLs.
-- Private mode prevents public object URLs from bypassing the authentication gate.
update storage.buckets
set public = false
where id in ('ticket-images', 'images');

-- Add a restrictive policy so an existing broad storage policy cannot expose
-- these app buckets to unauthenticated requests. Other buckets are unaffected.
drop policy if exists ticketing_private_buckets_require_auth on storage.objects;
create policy ticketing_private_buckets_require_auth on storage.objects
    as restrictive
    for all to public
    using (bucket_id not in ('ticket-images', 'images') or auth.uid() is not null)
    with check (bucket_id not in ('ticket-images', 'images') or auth.uid() is not null);

drop policy if exists ticketing_authenticated_images_select on storage.objects;
create policy ticketing_authenticated_images_select on storage.objects
    for select to authenticated
    using (bucket_id in ('ticket-images', 'images'));

drop policy if exists ticketing_authenticated_images_insert on storage.objects;
create policy ticketing_authenticated_images_insert on storage.objects
    for insert to authenticated
    with check (bucket_id in ('ticket-images', 'images'));

drop policy if exists ticketing_authenticated_images_update on storage.objects;
create policy ticketing_authenticated_images_update on storage.objects
    for update to authenticated
    using (bucket_id in ('ticket-images', 'images'))
    with check (bucket_id in ('ticket-images', 'images'));

drop policy if exists ticketing_authenticated_images_delete on storage.objects;
create policy ticketing_authenticated_images_delete on storage.objects
    for delete to authenticated
    using (bucket_id in ('ticket-images', 'images'));

commit;
