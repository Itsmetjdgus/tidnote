// 68일차: 알림센터. 내 글에 달린 댓글·좋아요, 팔로우 요청·새 팔로워·요청 수락을 최신순으로 보여 준다.
// 알림은 DB가 자동으로 만든다(schema.sql 68일차). 이 화면을 열면 보이는 알림을 읽음으로 표시한다.
(async function () {
  const list = document.getElementById('notif-list');
  const moreBtn = document.getElementById('notif-more');
  document.title = t('title.notifications');

  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  const me = session.user.id;
  const PAGE = 30;
  let oldest = null;

  function ago(at) {
    const sec = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
    if (sec < 60) return t('notif.now');
    if (sec < 3600) return t('notif.min', { n: Math.floor(sec / 60) });
    if (sec < 86400) return t('notif.hour', { n: Math.floor(sec / 3600) });
    if (sec < 86400 * 7) return t('notif.day', { n: Math.floor(sec / 86400) });
    return new Date(at).toLocaleDateString(dateLocale());
  }

  // "{name}님이 ..." 문장을 만들고 이름만 굵게
  function setSentence(el, key, name, title) {
    const who = document.createElement('strong');
    who.textContent = name;
    const parts = t(key, { name: '\u0000', title: title || '' }).split('\u0000');
    el.replaceChildren(parts[0] || '', who, parts.slice(1).join(''));
  }

  function note(text) {
    const li = document.createElement('li');
    li.className = 'state-message';
    li.textContent = text;
    list.append(li);
  }

  // 팔로우 요청 줄의 [수락] [거절]
  function requestButtons(n, li) {
    const box = document.createElement('div');
    box.className = 'notif-actions';
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = t('conn.accept');
    const decline = document.createElement('button');
    decline.type = 'button';
    decline.className = 'secondary';
    decline.textContent = t('conn.decline');
    async function act(ok) {
      accept.disabled = decline.disabled = true;
      const q = ok
        ? db.from('follows').update({ status: 'accepted' }).eq('follower_id', n.actor_id).eq('following_id', me).eq('status', 'pending').select('follower_id')
        : db.from('follows').delete().eq('follower_id', n.actor_id).eq('following_id', me).eq('status', 'pending').select('follower_id');
      const { data, error } = await q;
      if (error || !data || data.length === 0) {
        box.replaceChildren(document.createTextNode(t('notif.request_gone')));
        return;
      }
      if (ok) {
        box.replaceChildren(document.createTextNode(t('notif.accepted')));
        setSentence(li.querySelector('.notif-text'), 'notif.t_follow', li.dataset.name, '');
      } else {
        li.remove();
      }
    }
    accept.addEventListener('click', function () { act(true); });
    decline.addEventListener('click', function () { act(false); });
    box.append(accept, decline);
    return box;
  }

  function render(n) {
    const li = document.createElement('li');
    li.className = 'notif-item' + (n.read_at ? '' : ' unread');
    const name = n.actor && n.actor.nickname ? n.actor.nickname : t('comments.unknown');
    const postTitle = n.posts && n.posts.title ? n.posts.title : '';

    let href = 'author.html?id=' + n.actor_id;
    let key = 'notif.t_follow';
    if (n.type === 'comment') {
      key = 'notif.t_comment';
      href = 'post.html?id=' + n.post_id + '#comments';
    } else if (n.type === 'like') {
      key = 'notif.t_like';
      href = 'post.html?id=' + n.post_id;
    } else if (n.type === 'follow_request') {
      key = 'notif.t_request';
    } else if (n.type === 'follow_accept') {
      key = 'notif.t_accept';
    }

    const link = document.createElement('a');
    link.className = 'notif-link';
    link.href = href;
    if (typeof createAvatar === 'function') link.append(createAvatar(name, n.actor ? n.actor.avatar_path : null, true));
    const text = document.createElement('span');
    text.className = 'notif-text';
    setSentence(text, key, name, postTitle);
    li.dataset.name = name;
    const when = document.createElement('span');
    when.className = 'date notif-when';
    when.textContent = ago(n.created_at);
    const body = document.createElement('span');
    body.className = 'notif-body';
    body.append(text, when);
    link.append(body);
    li.append(link);

    if (n.type === 'follow_request') li.append(requestButtons(n, li));
    return li;
  }

  async function load() {
    moreBtn.hidden = true;
    let q = db
      .from('notifications')
      .select('id, type, actor_id, post_id, comment_id, created_at, read_at, actor:profiles!notifications_actor_id_fkey(nickname, avatar_path), posts(title)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE);
    if (oldest) q = q.lt('created_at', oldest);
    const { data, error } = await q;
    if (error) {
      console.error(error);
      if (!oldest) note(t('notif.load_failed'));
      return;
    }
    if (!oldest && (!data || data.length === 0)) {
      note(t('notif.empty'));
      return;
    }
    data.forEach(function (n) { list.append(render(n)); });
    if (data.length) oldest = data[data.length - 1].created_at;
    moreBtn.hidden = data.length < PAGE;

    // 화면에 보인 안 읽은 알림을 읽음으로(점 표시는 이번에는 그대로 두고, 다음에 열 때 사라진다)
    const unread = data.filter(function (n) { return !n.read_at; }).map(function (n) { return n.id; });
    if (unread.length) {
      await db.rpc('mark_notifications_read', { p_ids: unread });
      if (typeof refreshNotifBadge === 'function') refreshNotifBadge();
    }
  }

  moreBtn.addEventListener('click', load);
  list.replaceChildren();
  await load();
})();
