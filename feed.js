// 홈 화면의 글 목록: 최신순, 10개씩, ?q= 검색, ?cat= 카테고리, ?tag= 해시태그, ?view=following 팔로잉 글만, ?page= 페이지 이동
const PAGE_SIZE = 10;
const FOLLOW_LIMIT = 100; // 팔로잉 탭은 최근에 팔로우한 100명까지만 본다(주소가 너무 길어지지 않게)

// 검색어(q)·카테고리(cat)·해시태그(tag)·쪽(page)·보기(view)를 담은 홈 주소를 만든다
function feedUrl(q, cat, tag, page, view) {
  const next = new URLSearchParams();
  if (q) next.set('q', q);
  if (cat) next.set('cat', cat);
  if (tag) next.set('tag', tag);
  if (view === 'following') next.set('view', 'following');
  if (page > 1) next.set('page', page);
  const text = next.toString();
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
    a.href = feedUrl('', '', '', 1, item[0]);
    a.textContent = item[1];
    if (item[0] === view) {
      a.className = 'active';
      a.setAttribute('aria-current', 'page');
    }
    bar.append(a);
  });
}

// 목록 위의 카테고리 칩 줄: [전체] + 9개. 검색어·해시태그·보기는 그대로 두고 카테고리만 바꾼다
function renderCategoryBar(rawQuery, cat, tag, view) {
  const bar = document.getElementById('category-bar');
  if (!bar) return;
  bar.innerHTML = '';
  bar.setAttribute('aria-label', t('cat.nav_label'));

  const items = [['', t('cat.all')]].concat(CATEGORIES.map(function (c) { return [c, categoryLabel(c)]; }));
  items.forEach(function (item) {
    const a = document.createElement('a');
    a.className = 'chip';
    a.href = feedUrl(rawQuery, item[0], tag, 1, view);
    a.textContent = item[1];
    if (item[0] === cat) a.setAttribute('aria-current', 'page');
    bar.append(a);
  });

  // 좁은 화면에서 줄이 옆으로 밀려 있어도 지금 고른 칩이 보이게 한다
  const active = bar.querySelector('[aria-current]');
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// 해시태그로 보고 있을 때, 목록 위에 "#태그 의 글 · 태그 해제" 줄을 보여 준다
function renderTagFilter(rawQuery, cat, tag, view) {
  const box = document.getElementById('tag-filter');
  if (!box) return;
  box.innerHTML = '';
  box.hidden = !tag;
  if (!tag) return;
  box.append(t('tag.filter', { tag: tag }) + ' ');
  const clear = document.createElement('a');
  clear.href = feedUrl(rawQuery, cat, '', 1, view);
  clear.textContent = t('tag.clear');
  box.append(clear);
}

async function loadPosts() {
  const list = document.getElementById('post-list');
  const pager = document.getElementById('pager');
  const params = new URLSearchParams(window.location.search);

  const rawQuery = (params.get('q') || '').slice(0, 50);
  const keyword = rawQuery.replace(/[%_,()*\\]/g, ' ').trim();
  const rawCat = params.get('cat') || '';
  const cat = isCategory(rawCat) ? rawCat : ''; // 목록에 없는 값은 "전체"로 본다
  const tag = Array.from((params.get('tag') || '').replace(/[\s#,]/g, '')).slice(0, 20).join('').toLowerCase();
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);

  // 팔로잉 보기는 로그인했을 때만. 로그아웃 상태에서 주소로 들어오면 그냥 전체 보기로 본다
  let session = null;
  try {
    const { data: sessionData } = await db.auth.getSession();
    session = sessionData.session;
  } catch (e) {}
  const view = session && params.get('view') === 'following' ? 'following' : '';

  if (session) renderFeedTabs(view);
  renderCategoryBar(rawQuery, cat, tag, view);
  renderTagFilter(rawQuery, cat, tag, view);

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
    pager.innerHTML = '';

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

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = db
    .from('posts')
    .select('id, title, content, author_id, created_at, image_path, category, tags, comments(count), profiles!posts_author_profile_fkey(nickname, avatar_path)', { count: 'exact' });

  if (followingIds) {
    query = query.in('author_id', followingIds);
  }
  if (keyword) {
    query = query.or('title.ilike.%' + keyword + '%,content.ilike.%' + keyword + '%');
  }
  if (cat) {
    query = query.eq('category', cat);
  }
  if (tag) {
    query = query.contains('tags', [tag]);
  }

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  list.innerHTML = '';
  pager.innerHTML = '';

  if (error) {
    console.error(error);
    list.textContent = page > 1 ? t('blog.no_page') : t('blog.load_failed');
    return;
  }

  if (data.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'state-message';
    empty.textContent = keyword || tag ? t('blog.no_match') : (cat ? t('blog.empty_cat') : (view ? t('blog.empty_following') : t('blog.empty')));
    list.append(empty);
    return;
  }

  data.forEach((post) => list.append(renderPostCard(post, true)));
  fillPostImages(list);
  if (typeof fillLikes === 'function') fillLikes(list);

  if (capped) {
    const cap = document.createElement('p');
    cap.className = 'state-message';
    cap.textContent = t('feed.following_cap');
    list.prepend(cap);
  }

  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  const prev = document.createElement('a');
  prev.textContent = t('blog.prev');
  if (page > 1) prev.href = feedUrl(rawQuery, cat, tag, page - 1, view);
  else {
    prev.className = 'disabled';
    prev.setAttribute('aria-disabled', 'true');
  }

  const info = document.createElement('span');
  info.textContent = t('blog.page_of', { page: page, total: totalPages });

  const next = document.createElement('a');
  next.textContent = t('blog.next');
  if (page < totalPages) next.href = feedUrl(rawQuery, cat, tag, page + 1, view);
  else {
    next.className = 'disabled';
    next.setAttribute('aria-disabled', 'true');
  }

  pager.append(prev, info, next);
}

loadPosts();
