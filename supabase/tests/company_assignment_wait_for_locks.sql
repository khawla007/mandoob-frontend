\set ON_ERROR_STOP on
select pg_catalog.set_config('task11.session_a_name', :'session_a_name', false);
select pg_catalog.set_config('task11.lock_company_id', :'lock_company_id', false);
select pg_catalog.set_config('task11.lock_pro_a_id', :'lock_pro_a_id', false);
select pg_catalog.set_config('task11.lock_pro_b_id', :'lock_pro_b_id', false);

do $$
declare
  v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '15 seconds';
begin
  loop
    exit when exists (
      select 1
      from pg_catalog.pg_stat_activity activity
      where activity.application_name = pg_catalog.current_setting('task11.session_a_name')
        and not exists (
          select 1
          from (
            values
              (61001::bigint, pg_catalog.hashtext(pg_catalog.current_setting('task11.lock_company_id'))::bigint & 4294967295),
              (61002::bigint, pg_catalog.hashtext(pg_catalog.current_setting('task11.lock_pro_a_id'))::bigint & 4294967295),
              (61002::bigint, pg_catalog.hashtext(nullif(pg_catalog.current_setting('task11.lock_pro_b_id'), ''))::bigint & 4294967295)
          ) expected(classid, objid)
          where expected.objid is not null
            and not exists (
              select 1
              from pg_catalog.pg_locks held
              where held.pid = activity.pid
                and held.locktype = 'advisory'
                and held.granted
                and held.classid::bigint = expected.classid
                and held.objid::bigint = expected.objid
            )
        )
    );

    if pg_catalog.clock_timestamp() >= v_deadline then
      raise exception 'SESSION_A_LIFECYCLE_LOCKS_NOT_READY';
    end if;
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
