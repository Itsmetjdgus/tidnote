// 설정 > 개인정보 보호 > 차단한 계정 목록. 본인만 볼 수 있다.
(async function () {
  const list = document.getElementById('blocked-list');
  const message = document.getElementById('blocked-message');
  if (!list) return;

  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;
  if (!session) return;

  function note(text) {
    list.textContent = '';
    const p = document.createElement('p');
    p.className = 'state-message';
    p.textContent = text;
    list.append(p);
  }

  const { data: rows, error } = await db
    .from('blocks')
    .select('blocked_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    note(t('block.load_failed'));
    return;
  }
  if (!rows || rows.length === 0) {
    note(t('block.list_empty'));
    return;
  }

  const ids = rows.map(function (r) { return r.blocked_id; });
  const { data: people, error: peopleError } = await db
    .from('profiles')
    .select('id, nickname, avatar_path')
    .in('id', ids);

  if (peopleError || !people) {
    note(t('block.load_failed'));
    return;
  }
  const byId = {};
  people.forEach(function (p) { byId[p.id] = p; });

  list.textContent = '';

  rows.forEach(function (row) {
    const person = byId[row.blocked_id];
    if (!person) return;

    const wrap = document.createElement('div');
    wrap.className = 'person-row';

    const card = document.createElement('div');
    card.className = 'person-card';
    const avatar = createAvatar(person.nickname, person.avatar_path, true);
    const info = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'person-name';
    name.textContent = person.nickname;
    info.append(name);
    card.append(avatar, info);

    const actions = document.createElement('div');
    actions.className = 'person-actions';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'follow-btn secondary';
    btn.textContent = t('block.unblock');
    btn.addEventListener('click', async function () {
      if (!confirm(t('block.confirm_unblock', { name: person.nickname }))) return;
      btn.disabled = true;
      message.textContent = '';
      const ok = await unblockUser(person.id);
      if (!ok) {
        message.textContent = t('block.error');
        btn.disabled = false;
        return;
      }
      wrap.remove();
      if (!list.querySelector('.person-row')) note(t('block.list_empty'));
    });
    actions.append(btn);

    wrap.append(card, actions);
    list.append(wrap);
  });

  if (!list.querySelector('.person-row')) note(t('block.list_empty'));
})();