
create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid references auth.users primary key,
  email text,
  display_name text,
  node_id text unique,
  carrier_pool numeric default 0,
  vault_balance numeric default 0,
  staked_amount numeric default 0,
  stake_unlock_at timestamptz,
  autopilot boolean default false,
  pin_lock_enabled boolean default false,
  pin_hash text,
  payment_status text default 'unpaid',
  payment_utr text,
  payment_reject_reason text,
  created_at timestamptz default now()
);

create table if not exists public.transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  type text,
  amount numeric,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  connected_uid uuid references public.users(id) on delete cascade,
  node_id text,
  display_name text,
  added_at timestamptz default now(),
  unique(user_id, connected_uid)
);

create table if not exists public.payment_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  display_name text,
  email text,
  amount numeric,
  utr text,
  status text default 'pending',
  reviewed_by text,
  reason text,
  submitted_at timestamptz default now(),
  reviewed_at timestamptz
);

alter table public.users enable row level security;
alter table public.transactions enable row level security;
alter table public.connections enable row level security;
alter table public.payment_requests enable row level security;

drop policy if exists "auth_all_users" on public.users;
create policy "auth_all_users" on public.users for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "auth_all_tx" on public.transactions;
create policy "auth_all_tx" on public.transactions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "auth_all_conn" on public.connections;
create policy "auth_all_conn" on public.connections for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "auth_all_pay" on public.payment_requests;
create policy "auth_all_pay" on public.payment_requests for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger as $$
declare new_node_id text; new_display_name text;
begin
  new_node_id := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  new_display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    case when new.email is not null then split_part(new.email, '@', 1) else 'Device-' || new_node_id end
  );
  insert into public.users (id, email, display_name, node_id)
  values (new.id, new.email, new_display_name, new_node_id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- atomic operations
create or replace function public.save_data(amount numeric)
returns void as $$
declare cur record;
begin
  select carrier_pool, payment_status into cur from public.users where id = auth.uid() for update;
  if cur.payment_status is distinct from 'approved' then
    raise exception 'Activation payment approved nahi hai. Pehle ₹50 pay karo.';
  end if;
  if cur.carrier_pool < amount then
    raise exception 'Carrier Pool me itna balance nahi hai.';
  end if;
  update public.users set carrier_pool = carrier_pool - amount, vault_balance = vault_balance + amount where id = auth.uid();
  insert into public.transactions(user_id, type, amount) values (auth.uid(), 'save', amount);
end;
$$ language plpgsql security definer;

create or replace function public.withdraw_data(amount numeric)
returns void as $$
declare cur record;
begin
  select vault_balance, payment_status into cur from public.users where id = auth.uid() for update;
  if cur.payment_status is distinct from 'approved' then
    raise exception 'Activation payment approved nahi hai. Pehle ₹50 pay karo.';
  end if;
  if cur.vault_balance < amount then
    raise exception 'Vault me itna balance nahi hai.';
  end if;
  update public.users set vault_balance = vault_balance - amount, carrier_pool = carrier_pool + amount where id = auth.uid();
  insert into public.transactions(user_id, type, amount) values (auth.uid(), 'withdraw', amount);
end;
$$ language plpgsql security definer;

create or replace function public.send_data(to_uid uuid, amount numeric)
returns void as $$
declare my_bal numeric; their_name text; my_name text;
begin
  select vault_balance into my_bal from public.users where id = auth.uid() for update;
  if my_bal < amount then
    raise exception 'Vault me itna balance nahi hai.';
  end if;
  update public.users set vault_balance = vault_balance - amount where id = auth.uid();
  update public.users set vault_balance = vault_balance + amount where id = to_uid;
  select display_name into their_name from public.users where id = to_uid;
  select display_name into my_name from public.users where id = auth.uid();
  insert into public.transactions(user_id, type, amount, note) values (auth.uid(), 'send', amount, their_name);
  insert into public.transactions(user_id, type, amount, note) values (to_uid, 'receive', amount, my_name);
end;
$$ language plpgsql security definer;

create or replace function public.stake_data(amount numeric)
returns void as $$
declare cur record;
begin
  select vault_balance, staked_amount into cur from public.users where id = auth.uid() for update;
  if cur.staked_amount > 0 then
    raise exception 'Pehle se ek staking chal rahi hai.';
  end if;
  if cur.vault_balance < amount then
    raise exception 'Vault me itna balance nahi hai.';
  end if;
  update public.users set vault_balance = vault_balance - amount, staked_amount = amount, stake_unlock_at = now() + interval '30 days' where id = auth.uid();
  insert into public.transactions(user_id, type, amount) values (auth.uid(), 'stake', amount);
end;
$$ language plpgsql security definer;

create or replace function public.claim_stake_bonus()
returns void as $$
declare cur record; bonus numeric;
begin
  select staked_amount, stake_unlock_at into cur from public.users where id = auth.uid() for update;
  if cur.staked_amount is null or cur.staked_amount <= 0 then return; end if;
  if cur.stake_unlock_at is null or cur.stake_unlock_at > now() then return; end if;
  bonus := cur.staked_amount * 0.05;
  update public.users set vault_balance = vault_balance + cur.staked_amount + bonus, staked_amount = 0, stake_unlock_at = null where id = auth.uid();
  insert into public.transactions(user_id, type, amount) values (auth.uid(), 'unstake_bonus', bonus);
end;
$$ language plpgsql security definer;

create or replace function public.add_connection(target_node_id text)
returns void as $$
declare target record; my_node text; my_name text;
begin
  select id, node_id, display_name into target from public.users where node_id = target_node_id;
  if target.id is null then
    raise exception 'Ye Node ID nahi mila.';
  end if;
  if target.id = auth.uid() then
    raise exception 'Apna khud ka Node ID add nahi kar sakte.';
  end if;
  select node_id, display_name into my_node, my_name from public.users where id = auth.uid();
  insert into public.connections(user_id, connected_uid, node_id, display_name)
    values (auth.uid(), target.id, target.node_id, target.display_name)
    on conflict (user_id, connected_uid) do nothing;
  insert into public.connections(user_id, connected_uid, node_id, display_name)
    values (target.id, auth.uid(), my_node, my_name)
    on conflict (user_id, connected_uid) do nothing;
end;
$$ language plpgsql security definer;

create or replace function public.reset_app_data()
returns void as $$
begin
  update public.users set carrier_pool=0, vault_balance=0, staked_amount=0, stake_unlock_at=null where id=auth.uid();
  delete from public.transactions where user_id=auth.uid();
end;
$$ language plpgsql security definer;

create or replace function public.clear_history()
returns void as $$
begin
  delete from public.transactions where user_id=auth.uid();
end;
$$ language plpgsql security definer;

create or replace function public.approve_payment(req_id uuid, target_uid uuid)
returns void as $$
begin
  update public.payment_requests set status='approved', reviewed_at=now(), reviewed_by=(select email from auth.users where id=auth.uid()) where id=req_id;
  update public.users set payment_status='approved' where id=target_uid;
end;
$$ language plpgsql security definer;

create or replace function public.reject_payment(req_id uuid, target_uid uuid, reason_text text)
returns void as $$
begin
  update public.payment_requests set status='rejected', reviewed_at=now(), reviewed_by=(select email from auth.users where id=auth.uid()), reason=reason_text where id=req_id;
  update public.users set payment_status='rejected', payment_reject_reason=reason_text where id=target_uid;
end;
$$ language plpgsql security definer;

-- enable realtime
alter publication supabase_realtime add table public.users, public.transactions, public.connections, public.payment_requests;
