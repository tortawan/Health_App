-- Cleanup old storage objects (older than 30 days)
create extension if not exists pg_cron;

DO $$
begin
  if not exists (select 1 from cron.job where jobname = 'cleanup_storage_objects') then
    perform cron.schedule(
      'cleanup_storage_objects',
      '0 2 * * *',
      $cmd$delete from storage.objects where created_at < now() - interval '30 days';$cmd$
    );
  end if;
end $$;