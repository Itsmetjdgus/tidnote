(function () {
  // 비공개 안내를 보여줄 때 숨길 "빈 목록" 문구입니다. author.js가 보여 주는 문구와 정확히 같아야 합니다.
  const EMPTY_TEXTS = [t('blog.empty')];

  const params = new URLSearchParams(window.location.search);
  const authorId = params.get('id');
  if (!authorId) return;

  const area = document.createElement('div');
  area.className = 'follow-area';

  let me = null;
  let profile = null;
  let followStatus = null; // null, 'pending', 'accepted'
  let messageEl = null;

  // 프로필 머리말이 그려질 때까지 기다렸다가 그 바로 아래에 영역을 붙입니다.
  let placeTries = 0;
  const placeTimer = setInterval(() => {
    placeTries += 1;
    const main = document.querySelector('main');
    const ph = document.getElementById('profile-header');
    const phReady = ph && ph.children.length > 0;

    if (phReady) {
      if (ph.nextElementSibling !== area) ph.after(area);
    } else if (placeTries >= 30 && main && !area.isConnected) {
      main.prepend(area);
    }

    if (placeTries >= 50) clearInterval(placeTimer);
  }, 100);

  function showMessage(text) {
    if (messageEl) messageEl.textContent = text;
  }

  function makeButton(label, secondary, handler) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = secondary ? 'follow-btn secondary' : 'follow-btn';
    btn.textContent = label;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await handler();
      btn.disabled = false;
    });
    return btn;
  }

  function hideEmptyMessages() {
    let tries = 0;
    const timer = setInterval(() => {
            document.querySelectorAll('main p, #author-posts').forEach((p) => {
        if (EMPTY_TEXTS.includes(p.textContent.trim())) p.hidden = true;
      });
      tries += 1;
      if (tries >= 20) clearInterval(timer);
    }, 250);
  }

  async function loadStatus() {
    const { data } = await db
      .from('follows')
      .select('status')
      .eq('follower_id', me)
      .eq('following_id', authorId)
      .maybeSingle();

    followStatus = data ? data.status : null;
  }

  async function follow() {
    showMessage('');

    const { data, error } = await db
      .from('follows')
      .insert({ following_id: authorId })
      .select('status')
      .single();

    if (error) {
      if (error.code === '23505') {
        await loadStatus();
        render();
        return;
      }
      if (error.message && error.message.includes('Too many')) {
        showMessage(t('follow.too_many'));
      } else {
        showMessage(t('follow.failed_follow'));
      }
      return;
    }

    followStatus = data.status;
    render();
  }

  async function unfollow(confirmText) {
    if (!confirm(confirmText)) return;
    showMessage('');

    const { error } = await db
      .from('follows')
      .delete()
      .eq('follower_id', me)
      .eq('following_id', authorId);

    if (error) {
      showMessage(t('conn.error'));
      return;
    }

    followStatus = null;

    if (profile.is_private) {
      window.location.reload();
      return;
    }

    render();
  }

  function render() {
    area.textContent = '';
    messageEl = null;

    const isOwn = me === authorId;

    if (profile.is_private) {
      const badge = document.createElement('span');
      badge.className = 'account-badge';
      badge.textContent = t('follow.private_badge');
      area.append(badge);
    }

    const row = document.createElement('div');
    row.className = 'follow-row';

    if (isOwn) {
      const note = document.createElement('span');
      note.className = 'follow-note';
      note.append(t(profile.is_private ? 'follow.own_private' : 'follow.own_public') + ' ');
      const link = document.createElement('a');
      link.href = 'settings.html?tab=privacy';
      link.textContent = t('common.change_settings');
      note.append(link);
      row.append(note);
    } else if (!me) {
      const link = document.createElement('a');
      link.className = 'follow-btn';
      link.href = 'login.html';
      link.textContent = t('follow.login');
      link.addEventListener('click', function (event) {
        event.preventDefault();
        openLogin();
      });
      row.append(link);
    } else if (followStatus === 'accepted') {
      row.append(makeButton(t('follow.following'), true, () => unfollow(t('conn.confirm_unfollow', { name: profile.nickname }))));
    } else if (followStatus === 'pending') {
      row.append(makeButton(t('follow.requested'), true, () => unfollow(t('conn.confirm_cancel', { name: profile.nickname }))));
    } else {
      row.append(makeButton(t(profile.is_private ? 'follow.request' : 'follow.follow'), false, follow));
    }

    area.append(row);

    messageEl = document.createElement('p');
    messageEl.className = 'form-message';
    area.append(messageEl);

    const locked = profile.is_private && !isOwn && followStatus !== 'accepted';
    if (locked) {
      const notice = document.createElement('div');
      notice.className = 'private-notice';

      const title = document.createElement('strong');
      title.textContent = t('follow.locked_title');

      const text = document.createElement('p');
      if (followStatus === 'pending') {
        text.textContent = t('follow.locked_pending');
      } else if (me) {
        text.textContent = t('follow.locked_follow');
      } else {
        text.textContent = t('follow.locked_login');
      }

      notice.append(title, text);
      area.append(notice);
      hideEmptyMessages();
    }
  }

  async function init() {
    const { data: sessionData } = await db.auth.getSession();
    me = sessionData.session ? sessionData.session.user.id : null;

    const { data, error } = await db
      .from('profiles')
      .select('id, nickname, is_private')
      .eq('id', authorId)
      .maybeSingle();

    if (error || !data) return;
    profile = data;

        if (me && me !== authorId) {
      // 차단 관계면 팔로우 영역 자체를 만들지 않는다
      const relation = await getBlockRelation(authorId);
      if (relation !== 'none') return;
      await loadStatus();
    }
    render();
  }

  init();
})();