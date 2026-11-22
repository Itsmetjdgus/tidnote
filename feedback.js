// 설정 > 정보 > 의견 보내기. 설정 화면은 로그인한 사용자만 쓰며, 의견은 운영자만 읽을 수 있다.
(async function () {
  const form = document.getElementById('feedback-form');
  if (!form) return;

  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData.session) return;

  const MIN = 5;
  const kindSelect = document.getElementById('fb-kind');
  const textBox = document.getElementById('fb-message');
  const counter = document.getElementById('fb-counter');
  const btn = document.getElementById('fb-btn');
  const result = document.getElementById('fb-result');

  function updateCounter() {
    counter.textContent = t('fb.counter', { n: textBox.value.length });
  }
  textBox.addEventListener('input', updateCounter);
  updateCounter();

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    result.className = 'form-message';

    const message = textBox.value.trim();
    if (message.length < MIN) {
      result.textContent = t('fb.too_short');
      return;
    }

    btn.disabled = true;
    result.textContent = t('fb.sending');

    const { error } = await db.from('feedback').insert({ kind: kindSelect.value, message: message });
    btn.disabled = false;

    if (error) {
      result.textContent = error.message && error.message.includes('Too many') ? t('fb.too_many') : t('fb.failed');
      return;
    }

    textBox.value = '';
    updateCounter();
    result.className = 'form-message ok';
    result.textContent = t('fb.thanks');
  });
})();
