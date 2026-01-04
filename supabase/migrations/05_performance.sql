-- 05_performance.sql
create materialized view if not exists public.user_portion_memory as
select 
  user_id,
  lower(food_name) as food_name_lower,
  avg(weight_g) as avg_weight,
  count(*) as frequency,
  max(food_name) as display_name -- keep original casing
from public.food_logs
group by user_id, lower(food_name);

create index portion_memory_user_idx on public.user_portion_memory(user_id);

-- Optional: If using pg_cron to refresh automatically
-- select cron.schedule('refresh_portion_memory', '0 2 * * 0', $$refresh materialized view concurrently user_portion_memory;$$);
