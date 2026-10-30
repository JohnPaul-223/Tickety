-- Run this once in the Supabase SQL Editor for the ticketing project.
-- This app uses shared team data: any authenticated user can work with all
-- tickets, schedules, and attachments. These policies do not isolate rows by user.

begin;

-- User-owned Storage records and an encrypted credential vault.
create table if not exists public.storage_files (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    object_path text not null unique,
    original_name text not null,
    content_type text not null default 'application/octet-stream',
    size_bytes bigint not null default 0 check (size_bytes >= 0),
    category text not null default 'Other',
    created_at timestamptz not null default now()
);

create table if not exists public.storage_vaults (
    user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
    salt text not null,
    check_iv text not null,
    check_ciphertext text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.storage_credentials (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    ciphertext text not null,
    iv text not null,
    encryption_version smallint not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.storage_files enable row level security;
alter table public.storage_vaults enable row level security;
alter table public.storage_credentials enable row level security;

revoke all on table public.storage_files, public.storage_vaults, public.storage_credentials from anon, public;
grant select, insert, update, delete on table public.storage_files, public.storage_vaults, public.storage_credentials to authenticated;

drop policy if exists storage_files_owner_access on public.storage_files;
create policy storage_files_owner_access on public.storage_files
    for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists storage_vaults_owner_access on public.storage_vaults;
create policy storage_vaults_owner_access on public.storage_vaults
    for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists storage_credentials_owner_access on public.storage_credentials;
create policy storage_credentials_owner_access on public.storage_credentials
    for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('secure-storage', 'secure-storage', false)
on conflict (id) do update set public = false;

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
    using (bucket_id not in ('ticket-images', 'images', 'secure-storage') or auth.uid() is not null)
    with check (bucket_id not in ('ticket-images', 'images', 'secure-storage') or auth.uid() is not null);

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

-- Files live under folders named with their owner's auth user ID. This
-- restrictive fence overrides any broader storage policies for this bucket.
drop policy if exists secure_storage_owner_fence on storage.objects;
create policy secure_storage_owner_fence on storage.objects
    as restrictive
    for all to public
    using (
        bucket_id <> 'secure-storage'
        or (
            (select auth.uid()) is not null
            and (storage.foldername(name))[1] = (select auth.uid())::text
        )
    )
    with check (
        bucket_id <> 'secure-storage'
        or (
            (select auth.uid()) is not null
            and (storage.foldername(name))[1] = (select auth.uid())::text
        )
    );

drop policy if exists secure_storage_owner_select on storage.objects;
create policy secure_storage_owner_select on storage.objects
    for select to authenticated
    using (
        bucket_id = 'secure-storage'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists secure_storage_owner_insert on storage.objects;
create policy secure_storage_owner_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'secure-storage'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists secure_storage_owner_update on storage.objects;
create policy secure_storage_owner_update on storage.objects
    for update to authenticated
    using (
        bucket_id = 'secure-storage'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'secure-storage'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists secure_storage_owner_delete on storage.objects;
create policy secure_storage_owner_delete on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'secure-storage'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

commit;
