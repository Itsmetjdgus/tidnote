// 62일차: 설정 > 내 활동. 본인만 볼 수 있는 기록을 모아 보여 준다.
// - 좋아요한 글(63일차): 최근 순, 좋아요 취소 가능. 다른 사람은 이 목록을 볼 수 없다
// - 숨긴 게시물("이 게시물 안 보기"): 목록에서 다시 보기로 되돌릴 수 있다
(async function () {
  const panel = document.getElementById('tab-activity');
  if (!panel) return;
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData.session) return;

  function dateText(at) {
    return new Date(at).toLocaleDateString(dateLocale());
  }

  // 글 한 줄: 제목(링크) + 글쓴이·날짜 + 오른쪽 단추
  function postRow(post, when, action) {
    const li = document.createElement('li');
    li.className = 'activity-item';
    const info = document.createElement('div');
    info.className = 'activity-info';
    if (post) {
      const a = document.createElement('a');
      a.href = 'post.html?id=' + post.id;
      a.textContent = post.title;
      const meta = document.createElement('span');
      meta.className = 'date';
      const who = post.profiles && post.profiles.nickname ? post.profiles.nickname : t('post.anonymous');
      meta.textContent = who + ' · ' + when;
      info.append(a, meta);
    } else {
      // 지워졌거나, 비공개로 바뀌었거나, 차단 관계라 지금은 볼 수 없는 글
      const gone = document.createElement('span');
      gone.textContent = t('activity.unavailable');
      const meta = document.createElement('span');
      meta.className = 'date';
      meta.textContent = when;
      info.append(gone, meta);
    }
    li.append(info);
    if (action) li.append(action);
    return li;
  }

  function note(list, text) {
    list.replaceChildren();
    const li = document.createElement('li');
    li.className = 'state-message';
    li.textContent = text;
    list.append(li);
  }

  // ---- 숨긴 게시물 ----
  const hiddenList = document.getElementById('hidden-list');
  const hiddenMsg = document.getElementById('hidden-message');

  async function loadHidden() {
    note(hiddenList, t('common.loading'));
    const { data, error } = await db
      .from('hidden_posts')
      .select('post_id, created_at, posts(id, title, profiles!posts_author_profile_fkey(nickname))')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error(error);
      note(hiddenList, t('activity.load_failed'));
      return;
    }
    if (!data || data.length === 0) {
      note(hiddenList, t('activity.hidden_empty'));
      return;
    }
    hiddenList.replaceChildren();
    data.forEach(function (row) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'secondary';
      btn.textContent = t('activity.unhide');
      const li = postRow(row.posts, t('activity.hidden_at', { date: dateText(row.created_at) }), btn);
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        const { error: delError } = await db.from('hidden_posts').delete().eq('post_id', row.post_id);
        if (delError) {
          hiddenMsg.textContent = t('menu.hide_failed');
          btn.disabled = false;
          return;
        }
        li.remove();
        hiddenMsg.textContent = t('menu.unhidden');
        if (!hiddenList.querySelector('.activity-item')) note(hiddenList, t('activity.hidden_empty'));
      });
      hiddenList.append(li);
    });
  }

  // ---- 좋아요한 글 ----
  const likedList = document.getElementById('liked-list');
  const likedMsg = document.getElementById('liked-message');
  const userId = sessionData.session.user.id;

  async function loadLiked() {
    note(likedList, t('common.loading'));
    const { data, error } = await db
      .from('post_likes')
      .select('post_id, created_at, posts(id, title, profiles!posts_author_profile_fkey(nickname))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error(error);
      note(likedList, t('activity.load_failed'));
      return;
    }
    if (!data || data.length === 0) {
      note(likedList, t('activity.liked_empty'));
      return;
    }
    likedList.replaceChildren();
    data.forEach(function (row) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t('activity.unlike');
      const li = postRow(row.posts, t('activity.liked_at', { date: dateText(row.created_at) }), btn);
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        const { error: delError } = await db.from('post_likes').delete().eq('post_id', row.post_id).eq('user_id', userId);
        if (delError) {
          likedMsg.textContent = t('menu.hide_failed');
          btn.disabled = false;
          return;
        }
        li.remove();
        likedMsg.textContent = t('activity.unliked');
        if (!likedList.querySelector('.activity-item')) note(likedList, t('activity.liked_empty'));
      });
      likedList.append(li);
    });
  }

  function loadAll() {
    loadLiked();
    loadHidden();
  }

  if (!panel.hidden) loadAll();
  else {
    // 탭을 처음 열 때만 불러온다
    const obs = new MutationObserver(function () {
      if (!panel.hidden) {
        obs.disconnect();
        loadAll();
      }
    });
    obs.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
