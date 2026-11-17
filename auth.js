const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const message = document.getElementById('auth-message');
let resendBtn = null;

// 서버가 주는 영어 오류 문구를 그대로 보여주지 않고, 오류 종류에 맞는 번역 문구를 보여준다
function loginErrorText(error) {
  if (error.code === 'invalid_credentials') return t('login.bad_credentials');
  if (error.code === 'email_not_confirmed') return t('login.not_confirmed');
  if (error.status === 429 || error.code === 'over_request_rate_limit') return t('login.rate_limited');
  return t('login.failed');
}

// 이메일 인증이 안 된 계정이 로그인하려 할 때, 인증 메일을 다시 보내는 버튼을 보여 준다
function showResend(email) {
  if (!resendBtn) {
    resendBtn = document.createElement('button');
    resendBtn.type = 'button';
    resendBtn.className = 'link-button';
    message.insertAdjacentElement('afterend', resendBtn);
  }
  resendBtn.hidden = false;
  resendBtn.disabled = false;
  resendBtn.textContent = t('login.resend');
  resendBtn.onclick = async function () {
    resendBtn.disabled = true;
    const { error } = await db.auth.resend({ type: 'signup', email: email });
    if (error) {
      const limited = error.status === 429 || error.code === 'over_email_send_rate_limit';
      message.textContent = t(limited ? 'login.rate_limited' : 'login.resend_failed');
      resendBtn.disabled = false;
      return;
    }
    message.textContent = t('login.resent');
  };
}

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = t('login.working');
  if (resendBtn) resendBtn.hidden = true;

  const email = emailInput.value.trim();
  const { error } = await db.auth.signInWithPassword({
    email: email,
    password: passwordInput.value,
  });

  if (error) {
    message.textContent = loginErrorText(error);
    if (error.code === 'email_not_confirmed') showResend(email);
    return;
  }

  window.location.href = 'blog.html';
});

document.getElementById('open-signup-btn').addEventListener('click', openSignup);