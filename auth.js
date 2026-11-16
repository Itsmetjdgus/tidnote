const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const message = document.getElementById('auth-message');

// 서버가 주는 영어 오류 문구를 그대로 보여주지 않고, 오류 종류에 맞는 번역 문구를 보여준다
function loginErrorText(error) {
  if (error.code === 'invalid_credentials') return t('login.bad_credentials');
  if (error.code === 'email_not_confirmed') return t('login.not_confirmed');
  if (error.status === 429 || error.code === 'over_request_rate_limit') return t('login.rate_limited');
  return t('login.failed');
}

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = t('login.working');

  const { error } = await db.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });

  if (error) {
    message.textContent = loginErrorText(error);
    return;
  }

  window.location.href = 'blog.html';
});

document.getElementById('open-signup-btn').addEventListener('click', openSignup);