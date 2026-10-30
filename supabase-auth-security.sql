-- Run this in the Supabase SQL Editor after deploying security updates.
-- It is safe to rerun for this app's current schema and policy definitions.
-- This app uses shared team data: any authenticated user can work with all
-- tickets, schedules, and attachments. These policies do not isolate rows by user.

begin;

-- Secure random codes are generated and hashed in Postgres; only the admin RPC
-- returns a newly issued code, and it is never stored in plaintext.
create extension if not exists pgcrypto with schema extensions;

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

-- Storage access is a separate, one-time-code gate layered on top of app login.
create table if not exists public.storage_access_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    email text not null,
    status text not null default 'pending' check (status in ('pending', 'issued', 'used')),
    requested_at timestamptz not null default now(),
    code_expires_at timestamptz,
    updated_at timestamptz not null default now()
);

create table if not exists public.storage_access_codes (
    id uuid primary key default gen_random_uuid(),
    request_id uuid not null references public.storage_access_requests(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    email text not null,
    code_hash text not null,
    expires_at timestamptz not null,
    redeemed_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.storage_access_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    code_id uuid not null unique references public.storage_access_codes(id) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create index if not exists storage_access_requests_user_requested_at_idx
    on public.storage_access_requests (user_id, requested_at desc);
create index if not exists storage_access_requests_requested_at_idx
    on public.storage_access_requests (requested_at desc);
create index if not exists storage_access_codes_user_hash_idx
    on public.storage_access_codes (user_id, code_hash, expires_at)
    where redeemed_at is null;
create index if not exists storage_access_sessions_user_expiry_idx
    on public.storage_access_sessions (user_id, expires_at desc);

create or replace function public.is_storage_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
    select lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'johnpaulcanopen@gmail.com'
$$;

-- Security-definer lookup lets Storage RLS check the short-lived session table
-- without granting users write access to that table.
create or replace function public.has_active_storage_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.storage_access_sessions as access_session
        where access_session.user_id = (select auth.uid())
          and access_session.expires_at > now()
    )
$$;

create or replace function public.request_storage_access(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_email text := lower(trim(coalesce(p_email, '')));
    v_auth_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
    v_existing public.storage_access_requests%rowtype;
    v_request public.storage_access_requests%rowtype;
begin
    if v_user_id is null then
        raise exception 'Sign in to request Storage access.';
    end if;
    if v_email = '' or v_email <> v_auth_email then
        raise exception 'Enter the email address on your signed-in account.';
    end if;

    select * into v_existing
    from public.storage_access_requests as access_request
    where access_request.user_id = v_user_id
      and (
          (access_request.status = 'pending' and access_request.requested_at > now() - interval '10 minutes')
          or (access_request.status = 'issued' and access_request.code_expires_at > now())
      )
    order by access_request.requested_at desc
    limit 1;

    if found then
        return jsonb_build_object(
            'request_id', v_existing.id,
            'status', v_existing.status,
            'requested_at', v_existing.requested_at,
            'code_expires_at', v_existing.code_expires_at
        );
    end if;

    insert into public.storage_access_requests (user_id, email)
    values (v_user_id, v_auth_email)
    returning * into v_request;

    return jsonb_build_object(
        'request_id', v_request.id,
        'status', v_request.status,
        'requested_at', v_request.requested_at,
        'code_expires_at', v_request.code_expires_at
    );
end;
$$;

create or replace function public.admin_issue_storage_code(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_request public.storage_access_requests%rowtype;
    v_code text;
    v_expiry timestamptz;
begin
    if not public.is_storage_admin() then
        raise exception 'Only the Storage administrator can issue access codes.';
    end if;

    select * into v_request
    from public.storage_access_requests as access_request
    where access_request.id = p_request_id
      and access_request.status in ('pending', 'issued')
    for update;

    if not found then
        raise exception 'This access request is no longer available.';
    end if;

    update public.storage_access_codes
    set expires_at = now(),
        redeemed_at = coalesce(redeemed_at, now())
    where request_id = v_request.id
      and redeemed_at is null;

    v_code := upper(encode(extensions.gen_random_bytes(12), 'hex'));
    v_expiry := now() + interval '10 minutes';

    insert into public.storage_access_codes (request_id, user_id, email, code_hash, expires_at)
    values (
        v_request.id,
        v_request.user_id,
        v_request.email,
        encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex'),
        v_expiry
    );

    update public.storage_access_requests
    set status = 'issued',
        code_expires_at = v_expiry,
        updated_at = now()
    where id = v_request.id;

    return jsonb_build_object(
        'code', substr(v_code, 1, 8) || '-' || substr(v_code, 9, 8) || '-' || substr(v_code, 17, 8),
        'expires_at', v_expiry
    );
end;
$$;

create or replace function public.redeem_storage_access(p_email text, p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_email text := lower(trim(coalesce(p_email, '')));
    v_auth_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
    v_code text := regexp_replace(upper(coalesce(p_code, '')), '[^A-F0-9]', '', 'g');
    v_access_code public.storage_access_codes%rowtype;
    v_expiry timestamptz;
begin
    if v_user_id is null then
        raise exception 'Sign in to unlock Storage.';
    end if;
    if v_email = '' or v_email <> v_auth_email then
        raise exception 'Enter the email address on your signed-in account.';
    end if;
    if length(v_code) <> 24 then
        raise exception 'That access code is invalid or expired.';
    end if;

    select * into v_access_code
    from public.storage_access_codes as access_code
    where access_code.user_id = v_user_id
      and lower(access_code.email) = v_auth_email
      and access_code.code_hash = encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex')
      and access_code.redeemed_at is null
      and access_code.expires_at > now()
    for update;

    if not found then
        raise exception 'That access code is invalid, expired, or already used.';
    end if;

    update public.storage_access_codes
    set redeemed_at = now()
    where id = v_access_code.id;

    update public.storage_access_sessions
    set expires_at = now()
    where user_id = v_user_id
      and expires_at > now();

    insert into public.storage_access_sessions (user_id, code_id, expires_at)
    values (v_user_id, v_access_code.id, now() + interval '10 minutes')
    returning expires_at into v_expiry;

    update public.storage_access_requests
    set status = 'used',
        updated_at = now()
    where id = v_access_code.request_id;

    return v_expiry;
end;
$$;

create or replace function public.lock_storage_access()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        return;
    end if;

    update public.storage_access_sessions
    set expires_at = now()
    where user_id = (select auth.uid())
      and expires_at > now();
end;
$$;

alter table public.storage_files enable row level security;
alter table public.storage_vaults enable row level security;
alter table public.storage_credentials enable row level security;
alter table public.storage_access_requests enable row level security;
alter table public.storage_access_codes enable row level security;
alter table public.storage_access_sessions enable row level security;

revoke all on table public.storage_files, public.storage_vaults, public.storage_credentials, public.storage_access_requests, public.storage_access_codes, public.storage_access_sessions from anon, public, authenticated;
grant select, insert, update, delete on table public.storage_files, public.storage_vaults, public.storage_credentials to authenticated;
grant select on table public.storage_access_requests, public.storage_access_sessions to authenticated;

revoke all on function public.is_storage_admin() from public, anon;
revoke all on function public.has_active_storage_access() from anon;
revoke all on function public.request_storage_access(text) from public, anon;
revoke all on function public.admin_issue_storage_code(uuid) from public, anon;
revoke all on function public.redeem_storage_access(text, text) from public, anon;
revoke all on function public.lock_storage_access() from public, anon;
grant execute on function public.is_storage_admin() to authenticated;
grant execute on function public.has_active_storage_access() to public;
grant execute on function public.request_storage_access(text) to authenticated;
grant execute on function public.admin_issue_storage_code(uuid) to authenticated;
grant execute on function public.redeem_storage_access(text, text) to authenticated;
grant execute on function public.lock_storage_access() to authenticated;

drop policy if exists storage_files_owner_access on public.storage_files;
create policy storage_files_owner_access on public.storage_files
    for all to authenticated
    using ((select auth.uid()) = user_id and (select public.has_active_storage_access()))
    with check ((select auth.uid()) = user_id and (select public.has_active_storage_access()));

drop policy if exists storage_vaults_owner_access on public.storage_vaults;
create policy storage_vaults_owner_access on public.storage_vaults
    for all to authenticated
    using ((select auth.uid()) = user_id and (select public.has_active_storage_access()))
    with check ((select auth.uid()) = user_id and (select public.has_active_storage_access()));

drop policy if exists storage_credentials_owner_access on public.storage_credentials;
create policy storage_credentials_owner_access on public.storage_credentials
    for all to authenticated
    using ((select auth.uid()) = user_id and (select public.has_active_storage_access()))
    with check ((select auth.uid()) = user_id and (select public.has_active_storage_access()));

drop policy if exists storage_access_requests_owner_or_admin_select on public.storage_access_requests;
create policy storage_access_requests_owner_or_admin_select on public.storage_access_requests
    for select to authenticated
    using ((select auth.uid()) = user_id or (select public.is_storage_admin()));

drop policy if exists storage_access_sessions_owner_select on public.storage_access_sessions;
create policy storage_access_sessions_owner_select on public.storage_access_sessions
    for select to authenticated
    using ((select auth.uid()) = user_id);

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
            and (select public.has_active_storage_access())
            and (storage.foldername(name))[1] = (select auth.uid())::text
        )
    )
    with check (
        bucket_id <> 'secure-storage'
        or (
            (select auth.uid()) is not null
            and (select public.has_active_storage_access())
            and (storage.foldername(name))[1] = (select auth.uid())::text
        )
    );

drop policy if exists secure_storage_owner_select on storage.objects;
create policy secure_storage_owner_select on storage.objects
    for select to authenticated
    using (
        bucket_id = 'secure-storage'
        and (select public.has_active_storage_access())
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists secure_storage_owner_insert on storage.objects;
create policy secure_storage_owner_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'secure-storage'
        and (select public.has_active_storage_access())
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists secure_storage_owner_update on storage.objects;
create policy secure_storage_owner_update on storage.objects
    for update to authenticated
    using (
        bucket_id = 'secure-storage'
        and (select public.has_active_storage_access())
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'secure-storage'
        and (select public.has_active_storage_access())
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists secure_storage_owner_delete on storage.objects;
create policy secure_storage_owner_delete on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'secure-storage'
        and (select public.has_active_storage_access())
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

commit;
