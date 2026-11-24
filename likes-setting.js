// 72일차: 설정 > 개인정보 보호 > 좋아요 수 공개 (공개 / 비공개)
// 실제로 숫자·목록을 막는 일은 DB(can_see_likes)가 한다. 이 화면은 설정값만 바꾼다.
(async function () {
  const box = document.getElementById('likesvis-options');
  if (!box) return;
  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;
  if (!session) return;

  const save = document.getElementById('likesvis-save');
  const msg = document.getElementById('likesvis-message');
  const radios = box.querySelectorAll('input[name="likesvis"]');

  const { data, error } = await db.from('profiles').select('likes_public').eq('id', session.user.id).maybeSingle();
  if (error || !data) {
    box.hidden = true; // 72일차 SQL 실행 전
    return;
  }
  let current = data.likes_public === false ? 'private' : 'public';
  function show() {
    radios.forEach(function (r) { r.checked = r.value === current; });
    if (typeof setSettingValue === 'function') setSettingValue('likes', t('likesvis.' + current));
  }
  show();

  save.addEventListener('click', async function () {
    const picked = box.querySelector('input[name="likesvis"]:checked');
    msg.className = 'form-message';
    if (!picked || picked.value === current) {
      msg.textContent = t('settings.no_change');
      return;
    }
    save.disabled = true;
    const { error: upError } = await db.from('profiles').update({ likes_public: picked.value === 'public' }).eq('id', session.user.id);
    save.disabled = false;
    if (upError) {
      msg.textContent = t('settings.save_failed');
      return;
    }
    current = picked.value;
    show();
    msg.className = 'form-message ok';
    msg.textContent = t('settings.saved');
  });
})();
