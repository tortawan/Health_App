-- Meal templates tables
create table if not exists meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table meal_templates drop column if exists items;

create table if not exists meal_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references meal_templates(id) on delete cascade,
  usda_id int not null references usda_library(id),
  grams numeric not null
);

alter table meal_templates enable row level security;
alter table meal_template_items enable row level security;

create policy "Templates are viewable by owner" on meal_templates
  for select using (auth.uid() = user_id);

create policy "Templates are insertable by owner" on meal_templates
  for insert with check (auth.uid() = user_id);

create policy "Templates are updatable by owner" on meal_templates
  for update using (auth.uid() = user_id);

create policy "Templates are deletable by owner" on meal_templates
  for delete using (auth.uid() = user_id);

create policy "Template items are viewable by owner" on meal_template_items
  for select using (
    auth.uid() = (select user_id from meal_templates where id = template_id)
  );

create policy "Template items are insertable by owner" on meal_template_items
  for insert with check (
    auth.uid() = (select user_id from meal_templates where id = template_id)
  );

create policy "Template items are updatable by owner" on meal_template_items
  for update using (
    auth.uid() = (select user_id from meal_templates where id = template_id)
  );

create policy "Template items are deletable by owner" on meal_template_items
  for delete using (
    auth.uid() = (select user_id from meal_templates where id = template_id)
  );
