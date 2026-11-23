-- Tidnote 운영 런북 (신고 처리). 사이트 코드에서는 쓰지 않는 파일입니다.
-- 사용법: Supabase 대시보드 → SQL Editor 에서 **아래 블록 하나만 마우스로 선택**한 뒤 Run 을 누릅니다.
--         (파일 전체를 한 번에 실행하지 마세요. 값이 자리표시자(0, 0000…)라 전체를 실행해도 아무것도 바뀌지는 않지만 의미가 없습니다.)
-- 값을 바꾸는 곳: 번호는 0 → 실제 번호, 사용자 ID 는 00000000-… → 실제 ID, '사유' → 짧은 사유(군·개인정보 금지).
-- 이 파일에는 비밀번호·키·개인 정보를 적지 않습니다(저장소가 공개).

-- @@0 처음 한 번: 정지 기능에 필요한 열과 표가 있는지 확인 (2줄이 나와야 함: banned_until / sessions)
select column_name as 확인 from information_schema.columns
 where table_schema = 'auth' and table_name = 'users' and column_name = 'banned_until'
union all
select table_name from information_schema.tables
 where table_schema = 'auth' and table_name = 'sessions';

-- @@1 매일 한 번: 열린 신고 목록 (자해 우려가 맨 위, 그다음 오래된 순)
select id, created_at, reason as 사유, target_type as 대상, coalesce(target_id::text, target_user::text) as 대상번호, left(details, 80) as 상세
  from reports
 where status = 'open'
 order by (reason = 'self_harm') desc, created_at;

-- @@2a 신고 대상 보기: 글 (신고의 대상번호를 0 자리에)
select p.id, p.title, left(p.content, 300) as 내용, p.author_id, pr.nickname, p.category, p.images, p.created_at
  from posts p join profiles pr on pr.id = p.author_id
 where p.id = 0;

-- @@2b 신고 대상 보기: 댓글
select c.id, c.post_id, c.content, c.author_id, pr.nickname, c.created_at
  from comments c join profiles pr on pr.id = c.author_id
 where c.id = 0;

-- @@2c 신고 대상 보기: 프로필 (대상번호는 사용자 ID)
select id, nickname, bio, avatar_path, is_private, created_at
  from profiles
 where id = '00000000-0000-0000-0000-000000000000';

-- @@2d 연락할 이메일 보기: 신고한 사람 (신고 번호를 0 자리에)
select r.id as 신고번호, u.email as 신고자
  from reports r join auth.users u on u.id = r.reporter_id
 where r.id = 0;

-- @@2e 연락할 이메일 보기: 대상 글쓴이 (글 번호를 0 자리에)
select p.id as 글번호, u.email as 글쓴이
  from posts p join auth.users u on u.id = p.author_id
 where p.id = 0;

-- @@3 신고 닫기: 문제 없음(기각)은 'dismissed', 조치 후 마무리는 'resolved' (신고 번호를 0 자리에)
update reports
   set status = 'dismissed', handled_at = now(), handled_note = '사유'
 where id = 0 and status = 'open';

-- @@4a 글 삭제: 사본을 저장하고 지우며, 그 글의 열린 신고를 모두 '처리됨'으로 닫음 (글 번호를 0 자리에, '사유' 2곳도 바꿈)
with target as (select * from posts where id = 0),
snap as (
  select p.id, p.author_id,
         jsonb_build_object(
           'post', to_jsonb(p),
           'comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from comments c where c.post_id = p.id), '[]'::jsonb)
         ) as s
    from target p
),
logged as (
  insert into moderation_log (action, target_user, target_type, target_id, snapshot, note)
  select 'remove_post', author_id, 'post', id, s, '사유' from snap
  returning id
),
removed as (delete from posts where id in (select id from target) returning id)
update reports
   set status = 'resolved', handled_at = now(), handled_note = '글 삭제: 사유'
 where target_type = 'post' and target_id in (select id from removed) and status = 'open';

-- @@4b 댓글 삭제: 사본 저장 후 삭제, 그 댓글의 열린 신고를 닫음 (댓글 번호를 0 자리에)
with target as (select * from comments where id = 0),
logged as (
  insert into moderation_log (action, target_user, target_type, target_id, snapshot, note)
  select 'remove_comment', author_id, 'comment', id, to_jsonb(target), '사유' from target
  returning id
),
removed as (delete from comments where id in (select id from target) returning id)
update reports
   set status = 'resolved', handled_at = now(), handled_note = '댓글 삭제: 사유'
 where target_type = 'comment' and target_id in (select id from removed) and status = 'open';

-- @@5 삭제 기록 보기 (복구할 때 기록 번호를 찾는 용도)
select id, created_at, action, target_type, target_id, note,
       jsonb_array_length(coalesce(snapshot -> 'comments', '[]'::jsonb)) as 댓글수
  from moderation_log
 where action in ('remove_post', 'remove_comment')
 order by id desc
 limit 20;

-- @@6a 글 복구: 삭제 기록 번호를 0 자리에. 글과 그 댓글을 원래 번호·작성 시각 그대로 되돌림 (좋아요는 복구되지 않음)
begin;
alter table posts disable trigger limit_post_rate_trigger;
alter table posts disable trigger protect_post_columns_trigger;
alter table comments disable trigger limit_comment_rate_trigger;
alter table comments disable trigger set_comment_created_at_trigger;
with l as (select snapshot from moderation_log where id = 0 and action = 'remove_post'),
restored as (
  insert into posts overriding system value
  select (jsonb_populate_record(null::posts, l.snapshot -> 'post')).* from l
  returning id
)
insert into comments overriding system value
select (jsonb_populate_record(null::comments, c)).*
  from l, jsonb_array_elements(l.snapshot -> 'comments') c;
alter table posts enable trigger limit_post_rate_trigger;
alter table posts enable trigger protect_post_columns_trigger;
alter table comments enable trigger limit_comment_rate_trigger;
alter table comments enable trigger set_comment_created_at_trigger;
commit;

-- @@6b 댓글 복구: 삭제 기록 번호를 0 자리에
begin;
alter table comments disable trigger limit_comment_rate_trigger;
alter table comments disable trigger set_comment_created_at_trigger;
insert into comments overriding system value
select (jsonb_populate_record(null::comments, snapshot)).*
  from moderation_log where id = 0 and action = 'remove_comment';
alter table comments enable trigger limit_comment_rate_trigger;
alter table comments enable trigger set_comment_created_at_trigger;
commit;

-- @@6c 복구 뒤 점검: 4줄 모두 상태가 O 이면 정상 (O = 켜짐, D = 꺼짐. D 가 보이면 6a·6b 끝의 enable 줄을 다시 실행)
select tgrelid::regclass as 표, tgname as 이름, tgenabled as 상태
  from pg_trigger
 where tgname in ('limit_post_rate_trigger', 'protect_post_columns_trigger', 'limit_comment_rate_trigger', 'set_comment_created_at_trigger')
 order by 1, 2;

-- @@7a 계정 정지(30일): 로그인을 막고 로그인 상태(세션)를 끊음. 글은 그대로 보임 (사용자 ID를 0000… 자리에, '사유'도 바꿈)
with u as (
  update auth.users set banned_until = now() + interval '30 days'
   where id = '00000000-0000-0000-0000-000000000000'
  returning id
),
s as (delete from auth.sessions where user_id in (select id from u) returning id)
insert into moderation_log (action, target_user, note)
select 'suspend_user', id, '사유: 30일' from u where exists (select 1 from profiles pr where pr.id = u.id);

-- @@7b 정지 해제
with u as (
  update auth.users set banned_until = null
   where id = '00000000-0000-0000-0000-000000000000'
  returning id
)
insert into moderation_log (action, target_user, note)
select 'unsuspend_user', id, '사유' from u where exists (select 1 from profiles pr where pr.id = u.id);

-- @@7c 정지 상태 확인
select u.id, pr.nickname, u.banned_until
  from auth.users u join profiles pr on pr.id = u.id
 where u.banned_until is not null and u.banned_until > now();

-- @@8 계정 영구 삭제: 글을 먼저 지우고 계정을 지움(글이 있으면 계정이 안 지워짐). 사진 파일은 아래 안내대로 따로 지워야 함
begin;
delete from posts where author_id = '00000000-0000-0000-0000-000000000000';
delete from auth.users where id = '00000000-0000-0000-0000-000000000000';
commit;
-- 사진 파일 정리: 대시보드 → Storage → post-images(또는 avatars) → 그 사용자 ID 이름의 폴더 → 파일 선택 → Delete.
-- (SQL 로 storage.objects 를 지우면 파일은 남고 목록만 사라집니다. 공식 문서: 파일 삭제는 Storage 화면/API 로 하세요.)

-- @@9 오래된 삭제·정지 기록 정리(90일): 날짜를 "오늘 - 90일" 로 바꿔서 실행 (예: 오늘이 2027-04-10 이면 '2027-01-10')
delete from moderation_log where created_at < '2000-01-01';

-- @@10 저장공간 사용량 (무료 플랜 사진 저장 1 GB): 합계가 700 MB 를 넘으면 정리·대책을 생각하세요. 한 달에 한 번 확인
select bucket_id as 저장소, count(*) as 파일수, round(sum((metadata ->> 'size')::bigint) / 1048576.0, 1) as MB
  from storage.objects
 group by bucket_id
union all
select '합계', count(*), round(coalesce(sum((metadata ->> 'size')::bigint), 0) / 1048576.0, 1)
  from storage.objects;

-- @@11 글에 연결되지 않은 사진 찾기 (올리고 글을 저장하지 않은 것 등. 하루 지난 것만, 삭제 기록에 남은 글의 사진은 제외)
-- 찾은 파일은 SQL 이 아니라 대시보드 → Storage → post-images → 해당 폴더에서 직접 지웁니다(SQL 로 지우면 파일이 남음)
select o.name as 경로, o.created_at, round(((o.metadata ->> 'size')::bigint) / 1024.0) as KB
  from storage.objects o
 where o.bucket_id = 'post-images'
   and o.created_at < now() - interval '1 day'
   and not exists (select 1 from posts p where o.name = any (p.images))
   and not exists (select 1 from moderation_log m where m.action = 'remove_post' and m.snapshot -> 'post' -> 'images' @> to_jsonb(o.name))
 order by o.created_at
 limit 50;

-- @@12 매일 한 번(신고와 함께): 새 의견 보기 (최근 50건, 새 것이 위). 읽은 뒤 처리할 것은 따로 메모하세요
select f.id, f.created_at, f.kind as 종류, pr.nickname as 보낸이, f.message as 내용
  from feedback f
  left join profiles pr on pr.id = f.user_id
 order by f.created_at desc
 limit 50;

-- @@13 의견 지우기: 처리가 끝났거나 개인정보가 적혀 있는 의견 한 건 (번호는 블록 12 의 id, 0 → 실제 번호). 지우면 되돌릴 수 없습니다
delete from feedback where id = 0;

-- @@14 베타 전 보안 점검 ①(읽기 전용): RLS 가 꺼진 public 표. 0줄이어야 정상
select tablename as rls_꺼짐
  from pg_tables
 where schemaname = 'public' and not rowsecurity;

-- @@15 베타 전 보안 점검 ②(읽기 전용): 표마다 정책 수. schema.sql 과 비교 (reports·feedback 은 insert 만, moderation_log 는 0 개가 정상)
select c.relname as 표, count(p.policyname) as 정책수, string_agg(p.cmd, ',' order by p.cmd) as 종류
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
 where c.relkind = 'r'
 group by c.relname
 order by c.relname;

-- @@16 베타 전 보안 점검 ③(읽기 전용): 로그인 안 한 사람(anon)도 쓰기(insert/update/delete)가 되는 정책. 0줄이어야 정상
select tablename as 표, policyname as 정책, cmd as 종류, roles as 대상
  from pg_policies
 where schemaname in ('public', 'storage')
   and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
   and (roles @> array['public']::name[] or roles @> array['anon']::name[])
   and coalesce(qual, '') not like '%auth.uid()%'
   and coalesce(with_check, '') not like '%auth.uid()%';

-- @@17 베타 전 보안 점검 ④(읽기 전용): 약관 버전. '2027-01-01' 한 줄이어야 정상 (nav.js TERMS_VERSION, terms.html, privacy.html 과 같아야 함)
select public.current_terms_version() as 약관버전;
