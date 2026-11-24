// 61일차: 설정 > 보안 > 모든 기기에서 로그아웃.
// 모르는 로그인이 있거나 다른 기기에서 로그아웃을 잊었을 때 쓴다. 모든 기기의 로그인 갱신 열쇠를 없앤다.
// 다른 기기에 이미 받은 로그인 표(최대 1시간짜리)는 그 시간이 지나면 끊긴다.
(function () {
  const btn = document.getElementById('logout-all-btn');
  const msg = document.getElementById('logout-all-message');
  if (!btn) return;

  btn.addEventListener('click', async function () {
    if (!confirm(t('sessions.confirm'))) return;
    btn.disabled = true;
    msg.className = 'form-message';
    msg.textContent = '';
    try {
      const { error } = await db.auth.signOut({ scope: 'global' });
      if (error) throw error;
    } catch (e) {
      console.error(e);
      msg.textContent = t('sessions.failed');
      btn.disabled = false;
      return;
    }
    try { localStorage.removeItem('tidnote_draft'); } catch (e) {}
    alert(t('sessions.done'));
    window.location.href = 'login.html';
  });
})();
