// 좋아요 단추. 글 카드(목록)와 글 화면에서 같이 쓴다.
// 72일차: [♡ 단추] [숫자 단추] 두 개로 나눴다. ♡ = 좋아요 누르기/취소, 숫자 = 누른 사람 목록.
// 글쓴이가 "좋아요 수 비공개"로 해 두면 글쓴이 본인 말고는 숫자를 받지 못한다(DB가 null 을 준다) → 숫자 단추를 숨긴다.

function likeLabel(btn, count, liked) {
  btn.setAttribute('aria-label', liked ? t('like.remove') : t('like.add'));
  btn.title = liked ? t('like.remove') : t('like.add');
}

// count 가 null 이면 "숫자 비공개"
function applyLike(btn, count, liked) {
  const hidden = count === null || count === undefined;
  btn.dataset.count = hidden ? '' : String(count);
  btn.dataset.liked = liked ? '1' : '';
  btn.classList.toggle('liked', liked);
  btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
  likeLabel(btn, count, liked);
  const wrap = btn.parentNode;
  const countBtn = wrap && wrap.querySelector('.like-count-btn');
  if (countBtn) {
    countBtn.hidden = hidden;
    if (!hidden) {
      countBtn.textContent = String(count);
      countBtn.setAttribute('aria-label', t('like.count', { n: count }) + ' · ' + t('like.who'));
      countBtn.title = t('like.who');
    }
  }
}

async function toggleLike(btn) {
  if (btn.disabled) return;
  btn.disabled = true; // 연타 방지: 가장 먼저 잠근다(아래 await 를 기다리는 사이에 또 눌러도 한 번만 처리)

  const { data } = await db.auth.getSession();
  const session = data && data.session;
  if (!session) {
    btn.disabled = false;
    if (typeof openLogin === 'function') openLogin();
    return;
  }

  const postId = Number(btn.dataset.postId);
  const wasLiked = btn.dataset.liked === '1';
  const hidden = btn.dataset.count === '';
  const count = hidden ? null : Number(btn.dataset.count) || 0;
  const next = hidden ? null : (wasLiked ? Math.max(count - 1, 0) : count + 1);

  // 먼저 화면부터 바꾸고(빠르게 느껴지도록), 실패하면 되돌린다
  applyLike(btn, next, !wasLiked);

  let result;
  if (wasLiked) {
    result = await db.from('post_likes').delete().eq('post_id', postId).eq('user_id', session.user.id);
  } else {
    result = await db.from('post_likes').insert({ post_id: postId });
  }
  const error = result && result.error;

  if (error) {
    if (!wasLiked && error.code === '23505') {
      // 이미 눌러 둔 글(다른 창에서 눌렀거나 화면이 오래됨): 누른 상태로 맞추고 숫자는 그대로
      applyLike(btn, count, true);
    } else {
      applyLike(btn, count, wasLiked);
      alert(error.message && error.message.indexOf('Too many') !== -1 ? t('like.too_many') : t('like.failed'));
    }
  }
  btn.disabled = false;
}

function createLikeButton(postId) {
  const wrap = document.createElement('span');
  wrap.className = 'like-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'like-btn';
  btn.dataset.postId = String(postId);
  if (typeof navIcon === 'function') btn.append(navIcon('heart', 18));
  btn.addEventListener('click', function () { toggleLike(btn); });

  const countBtn = document.createElement('button');
  countBtn.type = 'button';
  countBtn.className = 'like-count-btn';
  countBtn.hidden = true;
  countBtn.addEventListener('click', function () { openLikersDialog(postId); });

  wrap.append(btn, countBtn);
  applyLike(btn, 0, false);
  return wrap;
}

// root 안의 좋아요 단추들에 숫자와 "내가 눌렀는지"를 채운다. 실패해도 글 목록은 그대로 보인다.
async function fillLikes(root) {
  const buttons = Array.from(root.querySelectorAll('.like-btn[data-post-id]'));
  if (buttons.length === 0) return;
  const ids = Array.from(new Set(buttons.map(function (b) { return Number(b.dataset.postId); })));

  const counts = {};
  const mine = {};

  const info = await db.rpc('get_like_info', { p_ids: ids });
  if (!info.error) {
    (info.data || []).forEach(function (row) { counts[row.post_id] = row.like_count; });
  } else {
    // 72일차 SQL을 실행하기 전: 예전처럼 숫자 표에서 읽는다
    const countResult = await db.from('post_like_counts').select('post_id, like_count').in('post_id', ids);
    if (countResult.error) console.error(countResult.error);
    else {
      ids.forEach(function (id) { counts[id] = 0; });
      (countResult.data || []).forEach(function (row) { counts[row.post_id] = row.like_count; });
    }
  }

  const { data } = await db.auth.getSession();
  if (data && data.session) {
    const mineResult = await db.from('post_likes').select('post_id').in('post_id', ids);
    if (mineResult.error) console.error(mineResult.error);
    else (mineResult.data || []).forEach(function (row) { mine[row.post_id] = true; });
  }

  buttons.forEach(function (btn) {
    if (btn.disabled) return;
    const id = Number(btn.dataset.postId);
    applyLike(btn, Object.prototype.hasOwnProperty.call(counts, id) ? counts[id] : null, !!mine[id]);
  });
}

// 좋아요를 누른 사람 목록 창
async function openLikersDialog(postId) {
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'modal likers-modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'likers-title');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', t('common.close'));
  const title = document.createElement('h2');
  title.id = 'likers-title';
  title.textContent = t('like.who');
  const list = document.createElement('ul');
  list.className = 'likers-list';
  const loading = document.createElement('li');
  loading.className = 'state-message';
  loading.textContent = t('common.loading');
  list.append(loading);
  dialog.append(closeBtn, title, list);
  overlay.append(dialog);

  function close() {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    const done = function () { if (previousFocus && previousFocus.focus) previousFocus.focus(); };
    if (typeof removeOverlay === 'function') removeOverlay(overlay, done);
    else { overlay.remove(); done(); }
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key !== 'Tab') return;
    const items = Array.from(dialog.querySelectorAll('button, a[href]'));
    if (!items.length) return;
    if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items[items.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === items[items.length - 1]) { e.preventDefault(); items[0].focus(); }
  }
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  closeBtn.focus();

  const { data, error } = await db.rpc('get_post_likers', { p_post: postId });
  list.replaceChildren();
  if (error) {
    console.error(error);
    const li = document.createElement('li');
    li.className = 'state-message';
    li.textContent = t('like.who_failed');
    list.append(li);
    return;
  }
  if (!data || data.length === 0) {
    const li = document.createElement('li');
    li.className = 'state-message';
    li.textContent = t('like.who_empty');
    list.append(li);
    return;
  }
  data.forEach(function (u) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'liker';
    a.href = 'author.html?id=' + u.user_id;
    if (typeof createAvatar === 'function') a.append(createAvatar(u.nickname, u.avatar_path, true));
    const name = document.createElement('span');
    name.textContent = u.nickname;
    a.append(name);
    li.append(a);
    list.append(li);
  });
}
