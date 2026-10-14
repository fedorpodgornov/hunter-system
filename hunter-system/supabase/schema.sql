-- СИСТЕМА: схема для Supabase (Postgres + Row Level Security)
-- Выполнить целиком в SQL Editor проекта Supabase.
-- Ключевые принципы: опыт и уровень считает только сервер, клиент их не пишет;
-- никто не может снять себе бан или заморозку; чужие журналы видны только друзьям.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text unique not null check (char_length(nickname) between 2 and 24),
  cls text not null default 'warrior',
  level int not null default 1,
  total_exp int not null default 0,
  best_streak int not null default 0,
  banned boolean not null default false,
  ban_reason text,
  frozen_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workouts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null,
  type text not null,
  minutes int not null check (minutes between 1 and 600),
  intensity text not null,
  note text,
  exp int not null default 0,
  flag text,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);

create table if not exists public.violations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id text,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists workouts_user_at_idx on public.workouts (user_id, at desc);
create index if not exists violations_user_time_idx on public.violations (user_id, created_at desc);

-- порог уровня совпадает с клиентом: 90 * уровень^1,15
create or replace function public.level_from_exp(p_exp int) returns int
language plpgsql immutable as $$
declare
  lvl int := 1;
  acc int := 0;
begin
  while lvl < 100 and p_exp >= acc + round(90 * power(lvl, 1.15)) loop
    acc := acc + round(90 * power(lvl, 1.15));
    lvl := lvl + 1;
  end loop;
  return lvl;
end $$;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nickname)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nickname', ''), 'Охотник-' || left(new.id::text, 6))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- профиль: клиент может менять только ник и класс
create or replace function public.set_profile(p_nickname text, p_cls text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_nick text := btrim(coalesce(p_nickname, ''));
begin
  if uid is null then raise exception 'нужен вход'; end if;
  if char_length(v_nick) < 2 or char_length(v_nick) > 24 then
    raise exception 'ник должен быть от 2 до 24 символов';
  end if;
  update profiles
     set nickname = v_nick,
         cls = coalesce(p_cls, cls),
         updated_at = now()
   where id = uid;
  return jsonb_build_object('ok', true);
exception
  when unique_violation then raise exception 'такой ник уже занят';
end $$;

-- запись тренировки: опыт считает сервер, нарушения фиксируются, бан ставится автоматически
create or replace function public.log_workout(
  p_id text,
  p_at timestamptz,
  p_type text,
  p_minutes int,
  p_intensity text,
  p_note text,
  p_exp int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof profiles;
  day_min int;
  day_cnt int;
  viol_24 int;
  viol_week int;
  reasons text[] := '{}';
  v_exp int;
  v_flag text := null;
begin
  if uid is null then raise exception 'нужен вход'; end if;

  select * into prof from profiles where id = uid;
  if prof.id is null then
    insert into profiles (id, nickname) values (uid, 'Охотник-' || left(uid::text, 6))
    on conflict (id) do nothing;
    select * into prof from profiles where id = uid;
  end if;
  if prof.banned then raise exception 'аккаунт забанен за накрутку опыта'; end if;

  select coalesce(sum(minutes), 0), count(*) into day_min, day_cnt
    from workouts where user_id = uid and (at at time zone 'UTC')::date = (p_at at time zone 'UTC')::date;

  if p_minutes > 240 then reasons := array_append(reasons, 'запись длиннее 240 минут'); end if;
  if day_min + p_minutes > 360 then reasons := array_append(reasons, 'больше 360 минут за день'); end if;
  if day_cnt + 1 > 6 then reasons := array_append(reasons, 'больше 6 записей за день'); end if;
  if prof.frozen_until is not null and prof.frozen_until > now() then
    reasons := array_append(reasons, 'заморозка начисления до ' || to_char(prof.frozen_until, 'DD.MM HH24:MI'));
  end if;

  v_exp := greatest(coalesce(p_exp, 0), 0);

  if array_length(reasons, 1) is not null then
    v_flag := array_to_string(reasons, '; ');
    v_exp := 0;
    insert into violations (user_id, workout_id, reason) values (uid, p_id, v_flag);
  end if;

  insert into workouts (id, user_id, at, type, minutes, intensity, note, exp, flag)
  values (p_id, uid, p_at, p_type, p_minutes, p_intensity, left(coalesce(p_note, ''), 160), v_exp, v_flag)
  on conflict (id) do update
     set exp = excluded.exp,
         flag = excluded.flag,
         minutes = excluded.minutes,
         intensity = excluded.intensity,
         note = excluded.note;

  select count(*) into viol_24 from violations where user_id = uid and created_at > now() - interval '24 hours';
  select count(*) into viol_week from violations where user_id = uid and created_at > now() - interval '7 days';

  update profiles
     set total_exp = greatest(total_exp + v_exp, 0),
         level = level_from_exp(greatest(total_exp + v_exp, 0)),
         frozen_until = case when viol_24 >= 3 then now() + interval '24 hours' else frozen_until end,
         banned = case when viol_week >= 10 then true else banned end,
         ban_reason = case when viol_week >= 10 then 'автобан: 10 нарушений за 7 дней' else ban_reason end,
         updated_at = now()
   where id = uid;

  return jsonb_build_object(
    'exp', v_exp,
    'flag', v_flag,
    'violations24h', viol_24,
    'violations7d', viol_week,
    'level', (select level from profiles where id = uid),
    'total_exp', (select total_exp from profiles where id = uid),
    'frozen_until', (select frozen_until from profiles where id = uid)
  );
end $$;

-- друзья
create or replace function public.send_friend_request(p_nickname text) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  target uuid;
begin
  if uid is null then raise exception 'нужен вход'; end if;
  select id into target from profiles where lower(nickname) = lower(btrim(p_nickname)) and id <> uid;
  if target is null then return 'охотник с таким ником не найден'; end if;
  if are_friends(uid, target) then return 'вы уже друзья'; end if;
  insert into friendships (requester, addressee) values (uid, target)
  on conflict (requester, addressee) do nothing;
  return 'заявка отправлена';
end $$;

create or replace function public.list_friends() returns table (
  id uuid, nickname text, level int, total_exp int, status text, incoming boolean, banned boolean
)
language sql security definer set search_path = public as $$
  select p.id, p.nickname, p.level, p.total_exp, f.status, (f.addressee = auth.uid()) as incoming, p.banned
  from friendships f
  join profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where f.requester = auth.uid() or f.addressee = auth.uid()
  order by f.status, p.nickname;
$$;

create or replace function public.answer_friend_request(p_friend uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'нужен вход'; end if;
  if p_accept then
    update friendships set status = 'accepted'
     where addressee = auth.uid() and requester = p_friend and status = 'pending';
    return 'заявка принята';
  end if;
  delete from friendships
   where addressee = auth.uid() and requester = p_friend and status = 'pending';
  return 'заявка отклонена';
end $$;

create or replace function public.remove_friend(p_friend uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'нужен вход'; end if;
  delete from friendships
   where (requester = auth.uid() and addressee = p_friend)
      or (requester = p_friend and addressee = auth.uid());
  return 'удалено';
end $$;

create or replace function public.leaderboard() returns table (
  id uuid, nickname text, level int, total_exp int, me boolean, banned boolean
)
language sql security definer set search_path = public as $$
  select p.id, p.nickname, p.level, p.total_exp, (p.id = auth.uid()) as me, p.banned
  from profiles p
  where p.id = auth.uid() or are_friends(auth.uid(), p.id)
  order by p.banned, p.total_exp desc
  limit 50;
$$;

create or replace function public.my_state() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'id' from profiles p where p.id = auth.uid()),
    'violations24h', (select count(*) from violations v where v.user_id = auth.uid() and v.created_at > now() - interval '24 hours'),
    'violations', (select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc), '[]'::jsonb)
                     from (select reason, created_at from violations where user_id = auth.uid() order by created_at desc limit 20) v)
  );
$$;

-- доступ
alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.friendships enable row level security;
alter table public.violations enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or are_friends(auth.uid(), id));

drop policy if exists workouts_own on public.workouts;
create policy workouts_own on public.workouts for select
  using (user_id = auth.uid());

drop policy if exists workouts_friends on public.workouts;
create policy workouts_friends on public.workouts for select
  using (are_friends(auth.uid(), user_id));

drop policy if exists friends_read on public.friendships;
create policy friends_read on public.friendships for select
  using (requester = auth.uid() or addressee = auth.uid());

drop policy if exists viol_read on public.violations;
create policy viol_read on public.violations for select
  using (user_id = auth.uid());

-- прямой записи в таблицы у клиента нет: всё идёт через функции выше,
-- поэтому подделать опыт, снять себе бан или вписать чужую тренировку нельзя.
revoke insert, update, delete on public.profiles from authenticated, anon;
revoke insert, update, delete on public.workouts from authenticated, anon;
revoke insert, update, delete on public.friendships from authenticated, anon;
revoke insert, update, delete on public.violations from authenticated, anon;

grant execute on function public.set_profile(text, text) to authenticated;
grant execute on function public.log_workout(text, timestamptz, text, int, text, text, int) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.answer_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.leaderboard() to authenticated;
grant execute on function public.my_state() to authenticated;
