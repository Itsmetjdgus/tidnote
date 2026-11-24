// 65일차: 설정 > 개인정보 보호 > 댓글 허용 범위 (모두 / 팔로워만 / 끄기)
// 실제로 막는 일은 DB 규칙(can_comment_on)이 한다. 이 화면은 설정값만 바꾼다.
(async function () {
  const box = document.getElementById('cscope-options');
  if (!box) return;
  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;
  if (!session) return;

  const save = document.getElementById('cscope-save');
  const msg = document.getElementById('cscope-message');
  const radios = box.querySelectorAll('input[name="cscope"]');

  const { data, error } = await db.from('profiles').select('comment_scope').eq('id', session.user.id).maybeSingle();
  if (error || !data) {
    // DB에 아직 열이 없으면(65일차 SQL 실행 전) 설정을 숨긴다
    box.hidden = true;
    msg.textContent = '';
    return;
  }
  let current = data.comment_scope || 'everyone';
  radios.forEach(function (r) { r.checked = r.value === current; });

  save.addEventListener('click', async function () {
    const picked = box.querySelector('input[name="cscope"]:checked');
    msg.className = 'form-message';
    if (!picked || picked.value === current) {
      msg.textContent = t('settings.no_change');
      return;
    }
    save.disabled = true;
    const { error: upError } = await db.from('profiles').update({ comment_scope: picked.value }).eq('id', session.user.id);
    save.disabled = false;
    if (upError) {
      msg.textContent = t('settings.save_failed');
      return;
    }
    current = picked.value;
    msg.className = 'form-message ok';
    msg.textContent = t('settings.saved');
  });
})();
