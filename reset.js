(function () {
  const form = document.getElementById('reset-form');
  const info = document.getElementById('reset-info');
  const message = document.getElementById('reset-message');
  const newInput = document.getElementById('new-password');
  const confirmInput = document.getElementById('confirm-password');
  const button = document.getElementById('reset-btn');

  info.textContent = t('reset.checking');

  if (window.location.hash.includes('error')) {
    info.textContent = t('reset.invalid');
    return;
  }

  let ready = false;

  db.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      ready = true;
      info.textContent = t('reset.enter');
      form.hidden = false;
    }
  });

  setTimeout(() => {
    if (!ready) {
      info.textContent = t('reset.open_from_mail');
    }
  }, 4000);

  button.addEventListener('click', async () => {
    message.className = 'form-message';

    if (newInput.value.length < 8) {
      message.textContent = t('signup.pw_short');
      return;
    }

    if (newInput.value !== confirmInput.value) {
      message.textContent = t('signup.pw_mismatch');
      return;
    }

    button.disabled = true;
    message.textContent = t('pw.working');

    const { error } = await db.auth.updateUser({ password: newInput.value });

    if (error) {
      if (error.code === 'same_password') message.textContent = t('pw.same');
      else if (error.code === 'weak_password') message.textContent = t('reset.weak');
      else message.textContent = t('pw.failed');
      button.disabled = false;
      return;
    }

    message.className = 'form-message ok';
    message.textContent = t('reset.done');

    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1500);
  });
})();