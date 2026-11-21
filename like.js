// 좋아요 단추. 글 카드(목록)와 글 화면에서 같이 쓴다.
// 숫자는 post_like_counts, "내가 눌렀는지"는 post_likes 에서 읽는다(남이 누른 기록은 읽을 수 없다).

function likeLabel(btn, count, liked) {
  btn.setAttribute('aria-label', t('like.count', { n: count }));
  btn.title = liked ? t('like.remove') : t('like.add');
}

function applyLike(btn, count, liked) {
  btn.dataset.count = String(count);
  btn.dataset.liked = liked ? '1' : '';
  btn.classList.toggle('liked', liked);
  btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
  const num = btn.querySelector('.like-count');
  if (num) num.textContent = String(count);
  likeLabel(btn, count, liked);
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
  const count = Number(btn.dataset.count) || 0;

  // 먼저 화면부터 바꾸고(빠르게 느껴지도록), 실패하면 되돌린다
  applyLike(btn, wasLiked ? Math.max(count - 1, 0) : count + 1, !wasLiked);

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
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'like-btn';
  btn.dataset.postId = String(postId);
  if (typeof navIcon === 'function') btn.append(navIcon('heart', 18));
  const num = document.createElement('span');
  num.className = 'like-count';
  btn.append(num);
  applyLike(btn, 0, false);
  btn.addEventListener('click', function () { toggleLike(btn); });
  return btn;
}

// root 안의 좋아요 단추들에 숫자와 "내가 눌렀는지"를 채운다. 실패해도 글 목록은 그대로 보인다.
async function fillLikes(root) {
  const buttons = Array.from(root.querySelectorAll('.like-btn[data-post-id]'));
  if (buttons.length === 0) return;
  const ids = Array.from(new Set(buttons.map(function (b) { return Number(b.dataset.postId); })));

  const counts = {};
  const mine = {};

  const countResult = await db.from('post_like_counts').select('post_id, like_count').in('post_id', ids);
  if (countResult.error) console.error(countResult.error);
  else (countResult.data || []).forEach(function (row) { counts[row.post_id] = row.like_count; });

  const { data } = await db.auth.getSession();
  if (data && data.session) {
    const mineResult = await db.from('post_likes').select('post_id').in('post_id', ids);
    if (mineResult.error) console.error(mineResult.error);
    else (mineResult.data || []).forEach(function (row) { mine[row.post_id] = true; });
  }

  buttons.forEach(function (btn) {
    if (btn.disabled) return;
    const id = Number(btn.dataset.postId);
    applyLike(btn, counts[id] || 0, !!mine[id]);
  });
}
