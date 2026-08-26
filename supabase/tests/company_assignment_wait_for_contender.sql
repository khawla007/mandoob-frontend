-- Included by session A after its lifecycle mutation has acquired transaction locks.
select pg_catalog.set_config('task11.session_b_name', :'session_b_name', true);
do $$
declare
  v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '15 seconds';
begin
  loop
    perform pg_catalog.pg_stat_clear_snapshot();
    exit when exists (
      select 1
      from pg_catalog.pg_stat_activity contender
      join pg_catalog.pg_locks waiting
        on waiting.pid = contender.pid
       and waiting.locktype = 'advisory'
       and waiting.granted = false
      where contender.application_name = pg_catalog.current_setting('task11.session_b_name')
        and exists (
          select 1
          from pg_catalog.pg_locks held
          where held.pid = pg_catalog.pg_backend_pid()
            and held.locktype = 'advisory'
            and held.granted
            and held.classid = waiting.classid
            and held.objid = waiting.objid
            and held.objsubid = waiting.objsubid
        )
    );

    if pg_catalog.clock_timestamp() >= v_deadline then
      raise exception 'SESSION_B_DID_NOT_CONTEND_FOR_LIFECYCLE_LOCK';
    end if;
    perform pg_catalog.pg_sleep(0.02);
  end loop;
end;
$$;
\set ON_ERROR_STOP off
