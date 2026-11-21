-- Tidnote database schema (recovery reference)
-- Run top to bottom on a NEW Supabase project (SQL Editor).
-- Never put passwords, API keys, or personal data in this file.
-- When you change the database later, append the new SQL at the bottom with a date.

-- ===== 1. posts =====
create table posts (
  id bigint generated always as identity primary key,
  title text not null,
  content text not null,
  author_id uuid default auth.uid() references auth.users(id),
  created_at timestamptz default now()
);

alter table posts enable row level security;

create policy "anyone can read posts"
  on posts for select using (true);

create policy "users can insert own posts"
  on posts for insert to authenticated
  with check (auth.uid() = author_id);

create policy "users can update own posts"
  on posts for update to authenticated
  using (auth.uid() = author_id);

create policy "users can delete own posts"
  on posts for delete to authenticated
  using (auth.uid() = author_id);

-- ===== 2. profiles =====
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 20),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "anyone can read profiles"
  on profiles for select using (true);

create policy "users can update own profile"
  on profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, 'user_' || substr(new.id::text, 1, 8));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table posts
  add constraint posts_author_profile_fkey
  foreign key (author_id) references profiles(id);

-- ===== 3. post images =====
alter table posts add column image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images', 'post-images', true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "anyone can view post images"
  on storage.objects for select
  using (bucket_id = 'post-images');

create policy "users can upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users can delete own images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ===== 4. comments =====
create table comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz default now()
);

create index comments_post_id_idx on comments (post_id, created_at);

alter table comments enable row level security;

create policy "anyone can read comments"
  on comments for select using (true);

create policy "users can add own comments"
  on comments for insert to authenticated
  with check (auth.uid() = author_id);

create policy "author or post owner can delete comments"
  on comments for delete to authenticated
  using (
    auth.uid() = author_id
    or exists (
      select 1 from posts p
      where p.id = comments.post_id and p.author_id = auth.uid()
    )
  );

-- ===== 5. constraints, anti-forgery, rate limits =====
alter table posts
  add constraint posts_title_length check (char_length(title) between 1 and 100);

alter table posts
  add constraint posts_content_length check (char_length(content) between 1 and 20000);

alter table posts
  add constraint posts_image_path_owner
  check (image_path is null or image_path like author_id::text || '/%');

create or replace function public.protect_post_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
    new.author_id := old.author_id;
  end if;
  return new;
end;
$$;

create trigger protect_post_columns_trigger
  before insert or update on public.posts
  for each row execute function public.protect_post_columns();

create or replace function public.set_comment_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

create trigger set_comment_created_at_trigger
  before insert on public.comments
  for each row execute function public.set_comment_created_at();

create or replace function public.limit_post_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*) from public.posts
    where author_id = new.author_id
      and created_at > now() - interval '1 minute'
  ) >= 3 then
    raise exception 'Too many posts. Please wait a moment.';
  end if;
  return new;
end;
$$;

create trigger limit_post_rate_trigger
  before insert on public.posts
  for each row execute function public.limit_post_rate();

create or replace function public.limit_comment_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*) from public.comments
    where author_id = new.author_id
      and created_at > now() - interval '1 minute'
  ) >= 5 then
    raise exception 'Too many comments. Please wait a moment.';
  end if;
  return new;
end;
$$;

create trigger limit_comment_rate_trigger
  before insert on public.comments
  for each row execute function public.limit_comment_rate();

  -- 2026-10-30: block '@' in nicknames (avoid exposing email addresses)
alter table profiles
  add constraint profiles_nickname_no_at check (nickname !~ '@');

  -- 2026-11-01: reports and account deletion

create table reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id bigint not null,
  reason text not null check (reason in ('spam', 'harassment', 'privacy', 'illegal', 'other')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

alter table reports enable row level security;

create policy "users can create reports"
  on reports for insert to authenticated
  with check (auth.uid() = reporter_id and status = 'open');

create or replace function public.prepare_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := now();

  if (
    select count(*) from public.reports
    where reporter_id = new.reporter_id
      and created_at > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'Too many reports. Please wait a moment.';
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_report_trigger on public.reports;

create trigger prepare_report_trigger
  before insert on public.reports
  for each row execute function public.prepare_report();

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.posts where author_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 2026-11-05: add 'self_harm' to report reasons

alter table reports drop constraint if exists reports_reason_check;

alter table reports
  add constraint reports_reason_check
  check (reason in ('spam', 'harassment', 'privacy', 'illegal', 'self_harm', 'other'));

-- 2026-11-08: F1 follow, private account, block

-- 1. profiles: account privacy
alter table profiles add column if not exists is_private boolean not null default false;

-- 2. unique nickname (case-insensitive)
create unique index if not exists profiles_nickname_lower_idx on profiles (lower(nickname));

-- 3. blocks
create table if not exists blocks (
  blocker_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table blocks enable row level security;

create policy "blocker can read own blocks"
  on blocks for select to authenticated
  using (auth.uid() = blocker_id);

create policy "users can create own blocks"
  on blocks for insert to authenticated
  with check (auth.uid() = blocker_id);

create policy "blocker can delete own blocks"
  on blocks for delete to authenticated
  using (auth.uid() = blocker_id);

-- 4. follows
create table if not exists follows (
  follower_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_following_idx on follows (following_id, status);

alter table follows enable row level security;

create policy "parties can read follows"
  on follows for select to authenticated
  using (auth.uid() = follower_id or auth.uid() = following_id);

create policy "users can create own follows"
  on follows for insert to authenticated
  with check (auth.uid() = follower_id);

create policy "followed user can update follows"
  on follows for update to authenticated
  using (auth.uid() = following_id)
  with check (auth.uid() = following_id);

create policy "parties can delete follows"
  on follows for delete to authenticated
  using (auth.uid() = follower_id or auth.uid() = following_id);

-- 5. follow triggers
create or replace function public.prepare_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_private boolean;
begin
  if exists (
    select 1 from public.blocks b
    where b.blocker_id = new.following_id and b.blocked_id = new.follower_id
  ) then
    raise exception 'Unable to follow this user.';
  end if;

  select is_private into target_private
  from public.profiles where id = new.following_id;

  new.status := case when coalesce(target_private, true) then 'pending' else 'accepted' end;
  new.created_at := now();

  if (
    select count(*) from public.follows
    where follower_id = new.follower_id
      and created_at > now() - interval '10 minutes'
  ) >= 30 then
    raise exception 'Too many follow actions. Please wait a moment.';
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_follow_trigger on public.follows;

create trigger prepare_follow_trigger
  before insert on public.follows
  for each row execute function public.prepare_follow();

create or replace function public.protect_follow_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.follower_id := old.follower_id;
  new.following_id := old.following_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists protect_follow_columns_trigger on public.follows;

create trigger protect_follow_columns_trigger
  before update on public.follows
  for each row execute function public.protect_follow_columns();

-- 6. privacy change and block triggers
create or replace function public.handle_privacy_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_private and not new.is_private then
    update public.follows
    set status = 'accepted'
    where following_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_privacy_change on public.profiles;

create trigger on_profile_privacy_change
  after update of is_private on public.profiles
  for each row execute function public.handle_privacy_change();

create or replace function public.handle_block_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists on_block_created on public.blocks;

create trigger on_block_created
  after insert on public.blocks
  for each row execute function public.handle_block_created();

-- 7. who can view an author's content
create or replace function public.can_view_author(author uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() = author
    or (
      not exists (
        select 1 from public.blocks b
        where b.blocker_id = author and b.blocked_id = auth.uid()
      )
      and (
        exists (select 1 from public.profiles p where p.id = author and not p.is_private)
        or exists (
          select 1 from public.follows f
          where f.following_id = author
            and f.follower_id = auth.uid()
            and f.status = 'accepted'
        )
      )
    ),
    false
  );
$$;

-- 8. read rules now follow account privacy
drop policy if exists "anyone can read posts" on posts;

create policy "read posts of viewable authors"
  on posts for select
  using (public.can_view_author(author_id));

drop policy if exists "anyone can read comments" on comments;

create policy "read comments of viewable posts"
  on comments for select
  using (exists (select 1 from posts p where p.id = comments.post_id));

drop policy if exists "users can add own comments" on comments;

create policy "users can add own comments on viewable posts"
  on comments for insert to authenticated
  with check (
    auth.uid() = author_id
    and exists (select 1 from posts p where p.id = comments.post_id)
  );

  -- ============================================
-- 24일차: 프로필 소개글(bio)
-- ============================================
alter table profiles add column if not exists bio text not null default '';

alter table profiles drop constraint if exists profiles_bio_length;
alter table profiles add constraint profiles_bio_length check (char_length(bio) <= 100);

-- ============================================
-- 2026-11-13: 26일차 프로필 사진
-- ============================================

-- 1. profiles: 사진 경로 (본인 폴더 안의 파일만 허용)
alter table profiles add column if not exists avatar_path text;

alter table profiles drop constraint if exists profiles_avatar_path_owner;
alter table profiles
  add constraint profiles_avatar_path_owner
  check (avatar_path is null or avatar_path like id::text || '/%');

-- 2. 공개 저장소 avatars (파일당 512KB, 이미지 형식만)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "anyone can view avatars" on storage.objects;
create policy "anyone can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "users can upload own avatar" on storage.objects;
create policy "users can upload own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can delete own avatar" on storage.objects;
create policy "users can delete own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================
-- 2026-11-13: 26일차 사용자(프로필) 신고
-- ============================================
alter table reports
  add column if not exists target_user uuid references profiles(id) on delete cascade;

alter table reports alter column target_id drop not null;

alter table reports drop constraint if exists reports_target_type_check;
alter table reports
  add constraint reports_target_type_check
  check (target_type in ('post', 'comment', 'profile'));

alter table reports drop constraint if exists reports_target_check;
alter table reports
  add constraint reports_target_check
  check (
    (target_type in ('post', 'comment') and target_id is not null and target_user is null)
    or
    (target_type = 'profile' and target_user is not null and target_id is null
       and target_user <> reporter_id)
  );

create unique index if not exists reports_profile_unique
  on reports (reporter_id, target_user)
  where target_type = 'profile';

 -- 29일차: 차단 보강 (limit_blocks, hidden_user_ids, get_block_relation)

-- 1) 차단 목록 최대 200명
create or replace function public.limit_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.blocks where blocker_id = new.blocker_id) >= 200 then
    raise exception 'Too many blocked accounts.';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_blocks_trigger on public.blocks;
create trigger limit_blocks_trigger
  before insert on public.blocks
  for each row execute function public.limit_blocks();

-- 2) 나와 차단 관계(내가 차단 + 나를 차단)인 사용자 id 목록
create or replace function public.hidden_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select blocked_id from public.blocks where blocker_id = auth.uid()
  union
  select blocker_id from public.blocks where blocked_id = auth.uid();
$$;

-- 3) 특정 사람과의 차단 관계: 'blocking'(내가 차단) / 'blocked'(상대가 나를 차단) / 'none'
create or replace function public.get_block_relation(target uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.blocks where blocker_id = auth.uid() and blocked_id = target) then 'blocking'
    when exists (select 1 from public.blocks where blocker_id = target and blocked_id = auth.uid()) then 'blocked'
    else 'none'
  end;
$$;

-- 4) 로그인한 사용자만 호출 가능
revoke execute on function public.hidden_user_ids() from public, anon;
revoke execute on function public.get_block_relation(uuid) from public, anon;
grant execute on function public.hidden_user_ids() to authenticated;
grant execute on function public.get_block_relation(uuid) to authenticated;

-- 31일차: 글 사진 보호 (post-images 비공개 + can_view_author 규칙)

-- 1) 버킷을 비공개로
update storage.buckets set public = false where id = 'post-images';

-- 2) 예전의 "누구나 읽기" 규칙 제거
drop policy if exists "anyone can view post images" on storage.objects;
drop policy if exists "view post images of viewable authors" on storage.objects;

-- 3) 글을 볼 수 있는 사람만 사진도 볼 수 있다 (폴더 이름 = 작성자 id)
create policy "view post images of viewable authors"
  on storage.objects for select
  using (
    bucket_id = 'post-images'
    and public.can_view_author(((storage.foldername(name))[1])::uuid)
  );

-- 40일차 (2026-11-21): 글 카테고리
-- 1) 열 추가. 기존 글은 모두 'daily'(일상·생각)가 된다
alter table posts add column category text not null default 'daily';

-- 2) 허용하는 9가지 값만 저장 (프로그램 오류·조작 방지)
alter table posts
  add constraint posts_category_check
  check (category in ('daily', 'travel', 'food', 'language', 'it', 'hobby', 'study', 'culture', 'etc'));

-- 3) 카테고리별 최신순 목록을 빠르게
create index posts_category_created_idx on posts (category, created_at desc);

-- 4) API가 새 열을 바로 알도록 새로고침
notify pgrst, 'reload schema';

-- 41일차 (2026-11-21): 글 해시태그
-- 1) 열 추가. 기존 글은 태그 없음(빈 목록)
alter table posts add column tags text[] not null default '{}';

-- 2) 규칙: 최대 5개, 각 1~20자, 공백·#·쉼표 금지 (프로그램 오류·조작 방지)
create or replace function public.validate_post_tags()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tag text;
begin
  if cardinality(new.tags) > 5 then
    raise exception 'Tag limit exceeded';
  end if;
  foreach tag in array new.tags loop
    if tag is null or char_length(tag) not between 1 and 20 or tag ~ '[\s#,]' then
      raise exception 'Invalid tag';
    end if;
  end loop;
  return new;
end;
$$;

create trigger validate_post_tags_trigger
  before insert or update on public.posts
  for each row execute function public.validate_post_tags();

-- 3) 태그로 찾기를 빠르게
create index posts_tags_idx on posts using gin (tags);

-- 4) API가 새 열을 바로 알도록 새로고침
notify pgrst, 'reload schema';

-- 43일차 (2026-11-21): 글 사진 여러 장
-- 1) 열 추가: 글에 올린 사진 경로 목록 (순서 = 글 속 [사진1], [사진2] 번호)
alter table posts add column images text[] not null default '{}';

-- 2) 기존 글: 대표 사진 1장을 사진 목록의 첫 장으로 옮김 (화면 모양은 그대로)
update posts set images = array[image_path] where image_path is not null;

-- 3) 규칙: 최대 10장, 내 폴더의 파일만, 대표 사진은 목록 안의 사진 (프로그램 오류·조작 방지)
create or replace function public.validate_post_images()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p text;
begin
  if cardinality(new.images) > 10 then
    raise exception 'Image limit exceeded';
  end if;
  foreach p in array new.images loop
    if p is null or p !~ ('^' || new.author_id::text || '/[A-Za-z0-9._-]{1,100}$') then
      raise exception 'Invalid image';
    end if;
  end loop;
  if new.image_path is not null and not (new.image_path = any (new.images)) then
    raise exception 'Invalid cover image';
  end if;
  return new;
end;
$$;

create trigger validate_post_images_trigger
  before insert or update on public.posts
  for each row execute function public.validate_post_images();

-- 4) API가 새 열을 바로 알도록 새로고침
notify pgrst, 'reload schema';

-- 44일차 (2026-11-21): 좋아요
-- 1) 좋아요 표: 누가 어느 글에 눌렀는지. 읽기는 "내가 누른 것"만 가능 (남이 누가 눌렀는지는 API로도 알 수 없음)
-- (id 열을 따로 둔 이유: post_id+user_id 를 기본키로 쓰면 API가 이 표를 "글-사용자 연결 표"로 보고
--  글 목록의 profiles(...) 연결이 모호하다며 오류를 냅니다. 중복 방지는 unique 로 합니다)
create table post_likes (
  id bigint generated always as identity primary key,
  post_id bigint not null references posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index post_likes_user_idx on post_likes (user_id, created_at desc);

alter table post_likes enable row level security;

create policy "users can read own likes"
  on post_likes for select
  using (user_id = auth.uid());

create policy "users can like viewable posts"
  on post_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from posts p where p.id = post_likes.post_id)
  );

create policy "users can unlike"
  on post_likes for delete to authenticated
  using (user_id = auth.uid());

-- 2) 좋아요 수 표: 글을 볼 수 있는 사람은 숫자를 볼 수 있다. 쓰기는 아래 트리거만 가능 (숫자 조작 방지)
create table post_like_counts (
  post_id bigint primary key references posts(id) on delete cascade,
  like_count integer not null default 0 check (like_count >= 0)
);

alter table post_like_counts enable row level security;

create policy "read counts of viewable posts"
  on post_like_counts for select
  using (exists (select 1 from posts p where p.id = post_like_counts.post_id));

revoke insert, update, delete on post_like_counts from anon, authenticated;

-- 3) 좋아요를 누르거나 취소하면 숫자를 자동으로 맞춤 (계정·글을 지울 때도 함께 맞춰짐)
create or replace function public.sync_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.post_like_counts (post_id, like_count)
    values (new.post_id, 1)
    on conflict (post_id) do update
      set like_count = public.post_like_counts.like_count + 1;
  else
    update public.post_like_counts
      set like_count = greatest(like_count - 1, 0)
      where post_id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger sync_like_count_trigger
  after insert or delete on public.post_likes
  for each row execute function public.sync_like_count();

-- 4) 1분에 30번까지만 누를 수 있음 (연타·자동 프로그램 방지)
create or replace function public.limit_like_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*) from public.post_likes
    where user_id = new.user_id
      and created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'Too many likes. Please wait a moment.';
  end if;
  return new;
end;
$$;

create trigger limit_like_rate_trigger
  before insert on public.post_likes
  for each row execute function public.limit_like_rate();

-- 5) API가 새 표를 바로 알도록 새로고침
notify pgrst, 'reload schema';

-- 45일차 (2026-11-21): 약관 동의 기록·서버 검증
-- 1) 동의 기록 표: 누가 어느 버전에 언제 동의했는지. 읽기는 본인 것만, 쓰기는 아래 함수들만 가능
create table user_consents (
  user_id uuid not null references profiles(id) on delete cascade,
  terms_version text not null check (terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  agreed_at timestamptz not null default now(),
  primary key (user_id, terms_version)
);

alter table user_consents enable row level security;

create policy "users can read own consents"
  on user_consents for select
  using (user_id = auth.uid());

revoke insert, update, delete on user_consents from anon, authenticated;

-- 2) 지금 시행 중인 약관 버전(사이트 코드의 TERMS_VERSION 과 같아야 함. 약관을 바꿀 때 이 값도 같이 바꿈)
create or replace function public.current_terms_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2027-01-01'::text $$;

-- 3) 기존 계정은 가입 때 약관 동의창을 거쳤으므로 현재 버전에 동의한 것으로 채움
insert into user_consents (user_id, terms_version, agreed_at)
select id, public.current_terms_version(), coalesce(created_at, now())
from profiles
on conflict do nothing;

-- 4) 가입 함수: 약관 버전이 없거나 현재 버전과 다르면 가입을 거부하고, 맞으면 동의 기록을 남김
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'terms_version', '') <> public.current_terms_version() then
    raise exception 'Terms agreement required';
  end if;

  insert into public.profiles (id, nickname)
  values (new.id, 'user_' || substr(new.id::text, 1, 8));

  insert into public.user_consents (user_id, terms_version)
  values (new.id, public.current_terms_version());

  return new;
end;
$$;

-- 5) 재동의: 로그인한 본인이 현재 버전에 동의했다고 기록(같은 버전을 또 눌러도 안전)
create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_version is distinct from public.current_terms_version() then
    raise exception 'Outdated terms version';
  end if;

  insert into public.user_consents (user_id, terms_version)
  values (auth.uid(), p_version)
  on conflict do nothing;
end;
$$;

revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- 6) API가 새 표·함수를 바로 알도록 새로고침
notify pgrst, 'reload schema';

-- 46일차 (2026-11-21): 차단 = 서로 안 보임 (글·댓글·사진·좋아요 숫자까지 같은 규칙)
-- 1) 나와 상대 사이에 차단이 있는지(어느 쪽이 차단했든). 로그아웃 상태에서는 항상 false
create or replace function public.is_blocked_pair(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = other)
         or (b.blocker_id = other and b.blocked_id = auth.uid())
    ),
    false
  );
$$;

revoke all on function public.is_blocked_pair(uuid) from public;
grant execute on function public.is_blocked_pair(uuid) to anon, authenticated;

-- 2) 글을 볼 수 있는 사람: 기존 규칙에서 "상대가 나를 차단함"만 막던 것을 "어느 쪽이든 차단이 있으면 막음"으로
create or replace function public.can_view_author(author uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() = author
    or (
      not public.is_blocked_pair(author)
      and (
        exists (select 1 from public.profiles p where p.id = author and not p.is_private)
        or exists (
          select 1 from public.follows f
          where f.following_id = author
            and f.follower_id = auth.uid()
            and f.status = 'accepted'
        )
      )
    ),
    false
  );
$$;

-- 3) 댓글: 글을 볼 수 있고, 쓴 사람과 나 사이에 차단이 없을 때만 보임
drop policy if exists "read comments of viewable posts" on comments;

create policy "read comments of viewable posts"
  on comments for select
  using (
    exists (select 1 from posts p where p.id = comments.post_id)
    and not public.is_blocked_pair(comments.author_id)
  );

-- 4) API가 바뀐 규칙을 바로 알도록 새로고침
notify pgrst, 'reload schema';
