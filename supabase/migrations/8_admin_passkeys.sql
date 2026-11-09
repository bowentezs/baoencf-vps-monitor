-- Admin WebAuthn passkeys
set local search_path = public;

create table if not exists public.admin_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_uuid text not null references public.users(uuid) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports jsonb not null default '[]'::jsonb,
  name text not null default '通行密钥',
  aaguid text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_admin_passkeys_user_uuid on public.admin_passkeys(user_uuid);

alter table public.admin_passkeys enable row level security;
alter table public.admin_passkeys force row level security;

revoke all on public.admin_passkeys from public;
revoke all on public.admin_passkeys from anon;
revoke all on public.admin_passkeys from authenticated;
grant all on public.admin_passkeys to service_role;

comment on table public.admin_passkeys is 'CF Monitor admin WebAuthn passkeys. Do not expose through Supabase Data API.';

create or replace function public.cfm_passkey_list(input_user_uuid text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'created_at', p.created_at,
        'last_used_at', p.last_used_at,
        'transports', p.transports
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  from admin_passkeys p
  where p.user_uuid = input_user_uuid;
$$;

create or replace function public.cfm_passkeys_by_user(input_user_uuid text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(to_jsonb(p) order by p.created_at asc),
    '[]'::jsonb
  )
  from admin_passkeys p
  where p.user_uuid = input_user_uuid;
$$;

create or replace function public.cfm_passkey_create(
  input_user_uuid text,
  input_credential_id text,
  input_public_key text,
  input_counter bigint,
  input_transports jsonb,
  input_name text,
  input_aaguid text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  created admin_passkeys%rowtype;
begin
  if nullif(trim(coalesce(input_user_uuid, '')), '') is null
    or nullif(trim(coalesce(input_credential_id, '')), '') is null
    or nullif(trim(coalesce(input_public_key, '')), '') is null
    or input_counter < 0
    or jsonb_typeof(input_transports) is distinct from 'array'
  then
    raise exception 'invalid passkey data';
  end if;

  insert into admin_passkeys (
    user_uuid,
    credential_id,
    public_key,
    counter,
    transports,
    name,
    aaguid
  ) values (
    input_user_uuid,
    input_credential_id,
    input_public_key,
    input_counter,
    input_transports,
    coalesce(nullif(trim(input_name), ''), '通行密钥'),
    coalesce(input_aaguid, '')
  )
  returning * into created;

  return to_jsonb(created);
exception
  when unique_violation then
    return null;
  when foreign_key_violation then
    return null;
end;
$$;

create or replace function public.cfm_passkey_delete(input_user_uuid text, input_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  delete from admin_passkeys
  where id = input_id
    and user_uuid = input_user_uuid;
  return found;
end;
$$;

create or replace function public.cfm_passkey_update_counter(
  input_user_uuid text,
  input_credential_id text,
  input_counter bigint
)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update admin_passkeys
  set counter = input_counter,
      last_used_at = now()
  where user_uuid = input_user_uuid
    and credential_id = input_credential_id
    and counter <= input_counter;
  return found;
end;
$$;

revoke all on function public.cfm_passkey_list(text) from public;
revoke all on function public.cfm_passkey_list(text) from anon;
revoke all on function public.cfm_passkey_list(text) from authenticated;
grant execute on function public.cfm_passkey_list(text) to service_role;

revoke all on function public.cfm_passkeys_by_user(text) from public;
revoke all on function public.cfm_passkeys_by_user(text) from anon;
revoke all on function public.cfm_passkeys_by_user(text) from authenticated;
grant execute on function public.cfm_passkeys_by_user(text) to service_role;

revoke all on function public.cfm_passkey_create(text, text, text, bigint, jsonb, text, text) from public;
revoke all on function public.cfm_passkey_create(text, text, text, bigint, jsonb, text, text) from anon;
revoke all on function public.cfm_passkey_create(text, text, text, bigint, jsonb, text, text) from authenticated;
grant execute on function public.cfm_passkey_create(text, text, text, bigint, jsonb, text, text) to service_role;

revoke all on function public.cfm_passkey_delete(text, uuid) from public;
revoke all on function public.cfm_passkey_delete(text, uuid) from anon;
revoke all on function public.cfm_passkey_delete(text, uuid) from authenticated;
grant execute on function public.cfm_passkey_delete(text, uuid) to service_role;

revoke all on function public.cfm_passkey_update_counter(text, text, bigint) from public;
revoke all on function public.cfm_passkey_update_counter(text, text, bigint) from anon;
revoke all on function public.cfm_passkey_update_counter(text, text, bigint) from authenticated;
grant execute on function public.cfm_passkey_update_counter(text, text, bigint) to service_role;

insert into settings (key, value)
values ('schema_bootstrap_version', 'postgres-2026-11-09-admin-passkeys')
on conflict (key) do update set value = excluded.value;

notify pgrst, 'reload schema';
