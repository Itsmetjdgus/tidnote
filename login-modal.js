// 로그인 창(모달). nav.js의 openLogin()이 필요할 때 불러온다.
// next: 로그인한 뒤 갈 주소. 없으면 지금 화면을 새로고침한다.
function showLoginModal(next) {
  if (document.getElementById('login-modal')) return;

  const previousFocus = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'login-modal';

  const dialog = document.createElement('div');
  dialog.className = 'modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'login-modal-title');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', t('common.close'));

  const logo = document.createElement('img');
  logo.className = 'modal-logo';
  logo.src = 'logo-96.png';
  logo.alt = '';

  const title = document.createElement('h2');
  title.id = 'login-modal-title';
  title.textContent = t('login.title');

  dialog.append(closeBtn, logo, title);

  // 글쓰기 아이콘을 눌러서 열린 경우에만 이유를 한 줄 알려 준다
  if (next === 'write.html') {
    const hint = document.createElement('p');
    hint.className = 'modal-sub';
    hint.textContent = t('login.write_hint');
    dialog.append(hint);
  }

  const form = document.createElement('form');
  form.className = 'write-form';

  function makeField(labelKey, phKey, type, id, autocomplete) {
    const label = document.createElement('label');
    label.textContent = t(labelKey);
    label.setAttribute('for', id);
    const input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.autocomplete = autocomplete;
    input.placeholder = t(phKey);
    input.required = true;
    return { label: label, input: input };
  }

  const email = makeField('login.email', 'login.ph_email', 'email', 'login-modal-email', 'email');
  const pw = makeField('login.password', 'login.ph_password', 'password', 'login-modal-password', 'current-password');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = t('login.btn');

  const msg = document.createElement('p');
  msg.className = 'form-message';
  msg.setAttribute('role', 'status');

  form.append(email.label, email.input, pw.label, pw.input, submit, msg);

  // 서버가 주는 영어 오류 문구를 그대로 보여주지 않고, 오류 종류에 맞는 번역 문구를 보여준다
  function errorText(error) {
    if (error.code === 'invalid_credentials') return t('login.bad_credentials');
    if (error.code === 'email_not_confirmed') return t('login.not_confirmed');
    if (error.status === 429 || error.code === 'over_request_rate_limit') return t('login.rate_limited');
    return t('login.failed');
  }

  // 이메일 인증이 안 된 계정이면 인증 메일을 다시 보내는 버튼을 보여 준다
  let resendBtn = null;
  function showResend(address) {
    if (!resendBtn) {
      resendBtn = document.createElement('button');
      resendBtn.type = 'button';
      resendBtn.className = 'link-button';
      msg.insertAdjacentElement('afterend', resendBtn);
    }
    resendBtn.hidden = false;
    resendBtn.disabled = false;
    resendBtn.textContent = t('login.resend');
    resendBtn.onclick = async function () {
      resendBtn.disabled = true;
      const { error } = await db.auth.resend({ type: 'signup', email: address });
      if (error) {
        const limited = error.status === 429 || error.code === 'over_email_send_rate_limit';
        msg.textContent = t(limited ? 'login.rate_limited' : 'login.resend_failed');
        resendBtn.disabled = false;
        return;
      }
      msg.textContent = t('login.resent');
    };
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    msg.textContent = t('login.working');
    if (resendBtn) resendBtn.hidden = true;
    submit.disabled = true;

    const address = email.input.value.trim();
    const { error } = await db.auth.signInWithPassword({
      email: address,
      password: pw.input.value,
    });

    if (error) {
      msg.textContent = errorText(error);
      if (error.code === 'email_not_confirmed') showResend(address);
      submit.disabled = false;
      return;
    }

    if (next) {
      window.location.href = next;
    } else {
      window.location.reload();
    }
  });

  // 아래쪽: 비밀번호 찾기, 회원가입 창으로 바꾸기
  const forgot = document.createElement('p');
  forgot.className = 'modal-foot';
  const forgotLink = document.createElement('a');
  forgotLink.href = 'forgot.html';
  forgotLink.textContent = t('login.forgot');
  forgot.append(forgotLink);

  const foot = document.createElement('p');
  foot.className = 'modal-foot';
  foot.append(t('login.new') + ' ');
  const signupBtn = document.createElement('button');
  signupBtn.type = 'button';
  signupBtn.className = 'link-button';
  signupBtn.textContent = t('login.signup');
  signupBtn.addEventListener('click', function () {
    closeModal(function () { openSignup(); });
  });
  foot.append(signupBtn);

  function closeModal(after) {
    document.removeEventListener('keydown', onKeydown);
    document.body.style.overflow = '';
    removeOverlay(overlay, function () {
      if (typeof after === 'function') after();
      else if (previousFocus && previousFocus.focus) previousFocus.focus();
    });
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      closeModal();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(dialog.querySelectorAll('a[href], button, input')).filter(function (el) {
      return !el.hidden && !el.disabled;
    });
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  closeBtn.addEventListener('click', function () { closeModal(); });

  dialog.append(form, forgot, foot);
  overlay.append(dialog);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKeydown);
  email.input.focus();
}
