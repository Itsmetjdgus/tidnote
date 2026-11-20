// 홈 화면의 글 목록: 최신순, 10개씩, ?q= 검색, ?cat= 카테고리, ?page= 페이지 이동
const PAGE_SIZE = 10;

// 검색어(q)·카테고리(cat)·쪽(page)을 담은 홈 주소를 만든다
function feedUrl(q, cat, page) {
  const next = new URLSearchParams();
  if (q) next.set('q', q);
  if (cat) next.set('cat', cat);
  if (page > 1) next.set('page', page);
  const text = next.toString();
  return 'index.html' + (text ? '?' + text : '');
}

// 목록 위의 카테고리 칩 줄: [전체] + 9개. 검색어는 그대로 두고 카테고리만 바꾼다
function renderCategoryBar(rawQuery, cat) {
  const bar = document.getElementById('category-bar');
  if (!bar) return;
  bar.innerHTML = '';
  bar.setAttribute('aria-label', t('cat.nav_label'));

  const items = [['', t('cat.all')]].concat(CATEGORIES.map(function (c) { return [c, categoryLabel(c)]; }));
  items.forEach(function (item) {
    const a = document.createElement('a');
    a.className = 'chip';
    a.href = feedUrl(rawQuery, item[0], 1);
    a.textContent = item[1];
    if (item[0] === cat) a.setAttribute('aria-current', 'page');
    bar.append(a);
  });

  // 좁은 화면에서 줄이 옆으로 밀려 있어도 지금 고른 칩이 보이게 한다
  const active = bar.querySelector('[aria-current]');
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
}

async function loadPosts() {
  const list = document.getElementById('post-list');
  const pager = document.getElementById('pager');
  const params = new URLSearchParams(window.location.search);

  const rawQuery = (params.get('q') || '').slice(0, 50);
  const keyword = rawQuery.replace(/[%_,()*\\]/g, ' ').trim();
  const rawCat = params.get('cat') || '';
  const cat = isCategory(rawCat) ? rawCat : ''; // 목록에 없는 값은 "전체"로 본다
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);

  renderCategoryBar(rawQuery, cat);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = db
    .from('posts')
    .select('id, title, content, author_id, created_at, image_path, category, profiles(nickname)', { count: 'exact' });

  if (keyword) {
    query = query.or('title.ilike.%' + keyword + '%,content.ilike.%' + keyword + '%');
  }
  if (cat) {
    query = query.eq('category', cat);
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
    empty.textContent = keyword ? t('blog.no_match') : (cat ? t('blog.empty_cat') : t('blog.empty'));
    list.append(empty);
    return;
  }

  data.forEach((post) => list.append(renderPostCard(post, true)));
  fillPostImages(list);

  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  const prev = document.createElement('a');
  prev.textContent = t('blog.prev');
  if (page > 1) prev.href = feedUrl(rawQuery, cat, page - 1);
  else prev.className = 'disabled';

  const info = document.createElement('span');
  info.textContent = t('blog.page_of', { page: page, total: totalPages });

  const next = document.createElement('a');
  next.textContent = t('blog.next');
  if (page < totalPages) next.href = feedUrl(rawQuery, cat, page + 1);
  else next.className = 'disabled';

  pager.append(prev, info, next);
}

loadPosts();
