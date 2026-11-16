(async function () {
  const cta = document.getElementById('cta-write');
  if (!cta) return;

  const { data } = await db.auth.getSession();

  if (data.session) {
    cta.href = 'write.html';
    cta.textContent = t('home.write_post');
  } else {
    cta.addEventListener('click', function (event) {
      event.preventDefault();
      openSignup();
    });
  }
})();