const emailInput = document.getElementById('email');
const sendBtn = document.getElementById('send-btn');
const message = document.getElementById('forgot-message');

sendBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();

  if (!email) {
    message.className = 'form-message';
    message.textContent = t('forgot.need_email');
    return;
  }

  sendBtn.disabled = true;
  message.className = 'form-message';
  message.textContent = t('forgot.sending');

  const redirectTo = new URL('reset.html', window.location.href).href;
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });

  sendBtn.disabled = false;

  if (error) {
    const limited = error.status === 429 || error.code === 'over_email_send_rate_limit';
    message.textContent = t(limited ? 'forgot.rate_limited' : 'forgot.failed');
    return;
  }

  message.className = 'form-message ok';
  message.textContent = t('forgot.sent');
});