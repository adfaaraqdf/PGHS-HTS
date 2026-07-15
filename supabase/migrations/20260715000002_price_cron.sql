create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'pghs-price-tick';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'pghs-price-tick',
    '* * * * *',
    'select private.run_price_tick()'
  );
end;
$$;
