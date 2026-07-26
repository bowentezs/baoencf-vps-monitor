set local search_path = public;

create or replace function public.cfm_daily_traffic(input_days integer default 7)
returns jsonb
language sql
stable
set search_path = public
as $$
  with params as (
    select
      least(greatest(coalesce(input_days, 7), 1), 30)::integer as days,
      (timezone('Asia/Shanghai', now()))::date as today
  ),
  bounds as (
    select
      days,
      today,
      ((today - (days - 1))::timestamp at time zone 'Asia/Shanghai') as range_start
    from params
  ),
  boundary_rows as (
    select previous.*
    from clients c
    cross join bounds b
    cross join lateral (
      select r.id, r.client, r.time, r.net_total_up, r.net_total_down
      from records r
      where r.client = c.uuid and r.time < b.range_start
      order by r.time desc, r.id desc
      limit 1
    ) previous
  ),
  selected_rows as (
    select r.id, r.client, r.time, r.net_total_up, r.net_total_down
    from records r
    cross join bounds b
    where r.time >= b.range_start
    union all
    select id, client, time, net_total_up, net_total_down
    from boundary_rows
  ),
  sequenced as (
    select
      selected_rows.*,
      lag(net_total_up) over (partition by client order by time asc, id asc) as previous_up,
      lag(net_total_down) over (partition by client order by time asc, id asc) as previous_down
    from selected_rows
  ),
  deltas as (
    select
      client,
      (timezone('Asia/Shanghai', time))::date as day,
      case
        when previous_up is null then 0
        when net_total_up >= previous_up then net_total_up - previous_up
        else net_total_up
      end as up,
      case
        when previous_down is null then 0
        when net_total_down >= previous_down then net_total_down - previous_down
        else net_total_down
      end as down
    from sequenced
    cross join bounds b
    where time >= b.range_start
  ),
  daily as (
    select client, day, sum(up)::bigint as up, sum(down)::bigint as down
    from deltas
    cross join bounds b
    where day between b.today - (b.days - 1) and b.today
    group by client, day
  ),
  latest as (
    select c.uuid as client, recent.time, recent.net_total_up, recent.net_total_down
    from clients c
    cross join lateral (
      select r.time, r.net_total_up, r.net_total_down
      from records r
      where r.client = c.uuid
      order by r.time desc, r.id desc
      limit 1
    ) recent
  )
  select jsonb_build_object(
    'series', coalesce((
      select jsonb_agg(
        jsonb_build_object('client', client, 'day', day, 'up', up, 'down', down)
        order by client, day
      )
      from daily
    ), '[]'::jsonb),
    'latest', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'client', client,
          'time', time,
          'net_total_up', net_total_up,
          'net_total_down', net_total_down
        )
        order by client
      )
      from latest
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.cfm_daily_traffic(integer) from public;
revoke all on function public.cfm_daily_traffic(integer) from anon;
revoke all on function public.cfm_daily_traffic(integer) from authenticated;
grant execute on function public.cfm_daily_traffic(integer) to service_role;

insert into settings (key, value)
values ('schema_bootstrap_version', 'postgres-2026-07-26-daily-traffic')
on conflict (key) do update set value = excluded.value;

notify pgrst, 'reload schema';
