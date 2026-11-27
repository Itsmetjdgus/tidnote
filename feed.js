// 홈 화면의 글 목록: 최신순, 아래로 내리면 계속 불러옴(무한 스크롤), ?q= 검색, ?cat=a,b 카테고리(여러 개), ?tag=a,b 해시태그(여러 개면 하나라도 달린 글), ?q= 는 글 제목에서 찾음, ?view=following 팔로잉 글만
const PAGE_SIZE = 10; // 한 번에 불러오는 글 수
const FOLLOW_LIMIT = 100; // 팔로잉 탭은 최근에 팔로우한 100명까지만 본다(주소가 너무 길어지지 않게)

// 주소의 cat 값("food,travel")을 목록에 있는 카테고리만 남긴 배열로
function parseCats(raw) {
  const out = [];
  String(raw || '').split(',').forEach(function (c) {
    c = c.trim();
    if (isCategory(c) && out.indexOf(c) === -1) out.push(c);
  });
  return out;
}

// 검색어(q)·카테고리(cats 배열)·해시태그(tag)·보기(view)를 담은 홈 주소를 만든다
function feedUrl(q, cats, tag, view) {
  const next = new URLSearchParams();
  if (q) next.set('q', q);
  if (cats && cats.length) next.set('cat', cats.join(','));
  if (tag) next.set('tag', tag);
  if (view === 'following') next.set('view', 'following');
  const text = next.toString().replace(/%2C/g, ',');
  return 'index.html' + (text ? '?' + text : '');
}
// 로그인했을 때만: 목록 맨 위의 [전체 | 팔로잉] 탭. 누르면 검색·카테고리·태그는 지우고 처음 화면으로 간다
function renderFeedTabs(view) {
  const bar = document.getElementById('feed-tabs');
  if (!bar) return;
  bar.innerHTML = '';
  bar.hidden = false;
  bar.setAttribute('aria-label', t('feed.tab_label'));
  [['', t('feed.tab_all')], ['following', t('feed.tab_following')]].forEach(function (item) {
    const a = document.createElement('a');
    a.href = feedUrl('', [], '', item[0]);
    a.textContent = item[1];
    if (item[0] === view) {
      a.className = 'active';
      a.setAttribute('aria-current', 'page');
    }
    bar.append(a);
  });
}

// 목록 위의 카테고리 칩 줄: [전체] + 9개. 칩을 누르면 켜고 끄며 여러 개를 고를 수 있다. [전체]는 모두 해제
function renderCategoryBar(rawQuery, cats, tag, view) {
  const bar = document.getElementById('category-bar');
  if (!bar) return;
  bar.innerHTML = '';
  bar.setAttribute('aria-label', t('cat.nav_label'));

  const all = document.createElement('a');
  all.className = 'chip';
  all.href = feedUrl(rawQuery, [], tag, view);
  all.textContent = t('cat.all');
  if (cats.length === 0) all.setAttribute('aria-current', 'page');
  bar.append(all);

  CATEGORIES.forEach(function (c) {
    const on = cats.indexOf(c) !== -1;
    const next = on ? cats.filter(function (x) { return x !== c; }) : cats.concat([c]);
    const a = document.createElement('a');
    a.className = 'chip' + (on ? ' chip-on' : '');
    a.href = feedUrl(rawQuery, next, tag, view);
    a.textContent = categoryLabel(c);
    a.setAttribute('aria-pressed', on ? 'true' : 'false');
    a.setAttribute('role', 'button');
    bar.append(a);
  });

  // 좁은 화면에서 줄이 옆으로 밀려 있어도 처음 고른 칩이 보이게 한다
  const active = bar.querySelector('.chip-on') || bar.querySelector('[aria-current]');
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// 해시태그로 보고 있을 때, 목록 위에 "#태그 의 글 · 태그 해제" 줄을 보여 준다
function renderTagFilter(rawQuery, cats, tag, view) {
  const box = document.getElementById('tag-filter');
  if (!box) return;
  box.innerHTML = '';
  box.hidden = !tag;
  if (!tag) return;
  box.append(t('tag.filter', { tag: tag.split(',').join(t('tag.or') + '#') }) + ' ');
  const clear = document.createElement('a');
  clear.href = feedUrl(rawQuery, cats, '', view);
  clear.textContent = t('tag.clear');
  box.append(clear);
}

// 숨긴 게시물 번호(로그인했을 때만). 실패하면 빈 목록
async function loadHiddenPostIds(session) {
  if (!session) return [];
  try {
    const { data, error } = await db.from('hidden_posts').select('post_id').limit(1000);
    if (error) return [];
    return (data || []).map(function (r) { return r.post_id; });
  } catch (e) {
    return [];
  }
}

async function loadPosts() {
  const list = document.getElementById('post-list');
  const params = new URLSearchParams(window.location.search);

  const rawQuery = (params.get('q') || '').slice(0, 50);
  const keyword = rawQuery.replace(/[%_,()*\\]/g, ' ').trim();
  const cats = parseCats(params.get('cat')); // 목록에 없는 값은 빼고, 비면 "전체"
  // 71일차: 해시태그 여러 개(쉼표로 구분). tag 는 "여행,맛집" 같은 글자로 두고 쓸 때 나눈다
  const tag = parseSearchTags((params.get('tag') || '').replace(/,/g, ' ')).join(',');

  // 팔로잉 보기는 로그인했을 때만. 로그아웃 상태에서 주소로 들어오면 그냥 전체 보기로 본다
  let session = null;
  try {
    const { data: sessionData } = await db.auth.getSession();
    session = sessionData.session;
  } catch (e) {}
  const view = session && params.get('view') === 'following' ? 'following' : '';

  if (session) renderFeedTabs(view);
  renderCategoryBar(rawQuery, cats, tag, view);
  renderTagFilter(rawQuery, cats, tag, view);

  // 팔로잉 보기: 내가 승인받은 팔로우 상대의 id (최근에 팔로우한 순, 최대 FOLLOW_LIMIT명)
  let followingIds = null;
  let capped = false;
  if (view === 'following') {
    const { data: follows, error: followError } = await db
      .from('follows')
      .select('following_id')
      .eq('follower_id', session.user.id)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(FOLLOW_LIMIT);

    list.innerHTML = '';

    if (followError) {
      console.error(followError);
      list.textContent = t('blog.load_failed');
      return;
    }
    followingIds = (follows || []).map(function (f) { return f.following_id; });
    capped = followingIds.length >= FOLLOW_LIMIT;

    if (followingIds.length === 0) {
      const none = document.createElement('p');
      none.className = 'state-message';
      none.append(t('feed.following_none') + ' ');
      const find = document.createElement('a');
      find.href = 'people.html';
      find.textContent = t('feed.find_people');
      none.append(find);
      list.append(none);
      return;
    }
  }

  const hiddenIds = await loadHiddenPostIds(session);

  // 다음 묶음을 불러올 기준(마지막으로 받은 글의 작성 시각과 번호). 새 글이 올라와도 중복·누락이 없다
  let cursor = null;
  let loading = false;
  let done = false;
  let shown = 0;
  const seen = {};

  const status = document.createElement('p');
  status.className = 'state-message feed-status';
  status.setAttribute('role', 'status');
  const sentinel = document.createElement('div');
  sentinel.className = 'feed-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'secondary feed-more';
  moreBtn.textContent = t('feed.more');
  moreBtn.hidden = true;

  function buildQuery() {
    let query = db
      .from('posts')
      .select('id, title, content, author_id, created_at, image_path, images, category, categories, tags, comments(count), profiles!posts_author_profile_fkey(nickname, avatar_path)');
    if (followingIds) query = query.in('author_id', followingIds);
    if (keyword) query = query.ilike('title', '%' + keyword + '%'); // 71일차: "글 제목" 검색
    if (cats.length) query = query.overlaps('categories', cats);
    if (tag) query = query.overlaps('tags', tag.split(',')); // 73일차: 태그 중 하나라도 달린 글
    if (hiddenIds.length) query = query.not('id', 'in', '(' + hiddenIds.join(',') + ')');
    if (cursor) {
      const at = '"' + cursor.created_at + '"';
      query = query.or('created_at.lt.' + at + ',and(created_at.eq.' + at + ',id.lt.' + cursor.id + ')');
    }
    return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE);
  }

  async function loadMore() {
    if (loading || done) return;
    loading = true;
    moreBtn.hidden = true;
    status.textContent = t('common.loading');

    const { data, error } = await buildQuery();
    loading = false;

    if (error) {
      console.error(error);
      status.textContent = shown === 0 ? t('blog.load_failed') : t('feed.more_failed');
      moreBtn.hidden = shown === 0; // 이어서 불러오기 실패 → "더 보기"로 다시 시도
      return;
    }

    const rows = (data || []).filter(function (p) {
      if (seen[p.id]) return false;
      seen[p.id] = true;
      return true;
    });
    if (data && data.length) cursor = { created_at: data[data.length - 1].created_at, id: data[data.length - 1].id };
    if (!data || data.length < PAGE_SIZE) done = true;

    if (shown === 0 && rows.length === 0) {
      status.textContent = keyword || tag ? t('blog.no_match') : (cats.length ? t('blog.empty_cat') : (view ? t('blog.empty_following') : t('blog.empty')));
      return;
    }

    const chunk = document.createDocumentFragment();
    rows.forEach(function (post) { chunk.append(renderPostCard(post, true)); });
    const holder = document.createElement('div');
    holder.className = 'feed-chunk';
    holder.append(chunk);
    list.insertBefore(holder, status);
    shown += rows.length;
    fillPostImages(holder);
    if (typeof fillLikes === 'function') fillLikes(holder);
    if (typeof attachPostMenus === 'function') attachPostMenus(holder, session);

    status.textContent = done ? t('feed.end') : '';
    if (!done && !('IntersectionObserver' in window)) moreBtn.hidden = false;
    // 화면이 길어서 바닥 표시가 여전히 보이면(관찰자가 다시 알리지 않으므로) 이어서 더 불러온다
    if (!done && sentinel.getBoundingClientRect().top < window.innerHeight + 600) setTimeout(loadMore, 0);
  }

  list.innerHTML = '';
  if (capped) {
    const cap = document.createElement('p');
    cap.className = 'state-message';
    cap.textContent = t('feed.following_cap');
    list.append(cap);
  }
  list.append(status, sentinel, moreBtn);
  moreBtn.addEventListener('click', loadMore);

  await loadMore();

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        if (done) observer.disconnect();
        else loadMore();
      }
    }, { rootMargin: '600px 0px' });
    observer.observe(sentinel);
  }
}

loadPosts();
