// 설정 > 보안 > 비밀번호 변경. 현재 비밀번호를 다시 확인한 뒤 바꾼다.
(async function () {
  const form = document.getElementById('pw-form');
  if (!form) return;

  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;
  if (!session) return;

  const currentInput = document.getElementById('pw-current');
  const newInput = document.getElementById('pw-new');
  const againInput = document.getElementById('pw-again');
  const showBox = document.getElementById('pw-show');
  const btn = document.getElementById('pw-btn');
  const message = document.getElementById('pw-message');

  showBox.addEventListener('change', function () {
    const type = showBox.checked ? 'text' : 'password';
    currentInput.type = type;
    newInput.type = type;
    againInput.type = type;
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    message.className = 'form-message';

    if (!currentInput.value) {
      message.textContent = t('pw.need_current');
      return;
    }
    if (newInput.value.length < 8) {
      message.textContent = t('signup.pw_short');
      return;
    }
    if (newInput.value !== againInput.value) {
      message.textContent = t('signup.pw_mismatch');
      return;
    }
    if (newInput.value === currentInput.value) {
      message.textContent = t('pw.same');
      return;
    }

    btn.disabled = true;
    message.textContent = t('pw.working');

    // 1) 현재 비밀번호 재확인
    const { error: reauthError } = await db.auth.signInWithPassword({
      email: session.user.email,
      password: currentInput.value,
    });
    if (reauthError) {
      message.textContent = t('pw.bad_current');
      btn.disabled = false;
      return;
    }

    // 2) 새 비밀번호로 변경
    const { error: updateError } = await db.auth.updateUser({ password: newInput.value });
    if (updateError) {
      message.textContent = t('pw.failed');
      btn.disabled = false;
      return;
    }

    // 3) 다른 기기 로그아웃 (이 기기는 유지). 실패해도 변경 자체는 성공이므로 무시.
    try {
      await db.auth.signOut({ scope: 'others' });
    } catch (e) {}

    currentInput.value = '';
    newInput.value = '';
    againInput.value = '';
    showBox.checked = false;
    currentInput.type = 'password';
    newInput.type = 'password';
    againInput.type = 'password';

    message.className = 'form-message ok';
    message.textContent = t('pw.done');
    btn.disabled = false;
  });
})();