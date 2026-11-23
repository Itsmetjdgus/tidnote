// 약관 재동의 창(모달). nav.js의 maybeAskTermsConsent()가 필요할 때만 불러온다.
// 로그인한 사용자의 동의 기록(user_consents)에 현재 약관 버전(TERMS_VERSION)이 없으면 뜬다.
// 닫기(×)·Esc 로는 닫히지 않고, "동의하고 계속" 또는 "동의하지 않고 로그아웃" 중 하나를 골라야 한다.

function showConsentModal() {
  if (document.getElementById('consent-modal')) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'consent-modal';

  const dialog = document.createElement('div');
  dialog.className = 'modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'consent-title');

  const logo = document.createElement('img');
  logo.className = 'modal-logo';
  logo.src = 'logo-96.png';
  logo.alt = '';

  const title = document.createElement('h2');
  title.id = 'consent-title';
  title.textContent = t('consent.title');

  const sub = document.createElement('p');
  sub.className = 'modal-sub';
  sub.textContent = t('consent.body', { date: TERMS_VERSION });

  function legalLink(href, text) {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    return a;
  }

  const form = document.createElement('form');
  form.className = 'write-form';
  form.noValidate = true;

  const agreeLabel = document.createElement('label');
  agreeLabel.className = 'check';
  const agreeBox = document.createElement('input');
  agreeBox.type = 'checkbox';
  const agreeText = document.createElement('span');
  agreeText.append(
    t('signup.agree_before'),
    legalLink('terms.html', t('signup.terms')),
    t('signup.agree_between'),
    legalLink('privacy.html', t('signup.privacy')),
    t('signup.agree_after')
  );
  agreeLabel.append(agreeBox, agreeText);

  const accept = document.createElement('button');
  accept.type = 'submit';
  accept.textContent = t('consent.accept');

  const decline = document.createElement('button');
  decline.type = 'button';
  decline.className = 'link-button';
  decline.textContent = t('consent.decline');

  const msg = document.createElement('p');
  msg.className = 'form-message';
  msg.setAttribute('role', 'status');

  form.append(agreeLabel, accept, msg);

  const foot = document.createElement('p');
  foot.className = 'modal-foot';
  foot.append(decline);

  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const items = dialog.querySelectorAll('a[href], button, input');
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

  function closeModal() {
    document.removeEventListener('keydown', onKeydown);
    document.body.style.overflow = '';
    removeOverlay(overlay);
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    msg.className = 'form-message';
    msg.textContent = '';
    if (!agreeBox.checked) {
      msg.textContent = t('consent.need_agree');
      return;
    }
    accept.disabled = true;
    decline.disabled = true;
    const { error } = await db.rpc('accept_terms', { p_version: TERMS_VERSION });
    if (error) {
      console.error(error);
      msg.textContent = t('consent.failed');
      accept.disabled = false;
      decline.disabled = false;
      return;
    }
    closeModal();
  });

  decline.addEventListener('click', async function () {
    accept.disabled = true;
    decline.disabled = true;
    try { localStorage.removeItem('tidnote_draft'); } catch (e) {}
    await db.auth.signOut();
    window.location.href = 'index.html';
  });

  dialog.append(logo, title, sub, form, foot);
  overlay.append(dialog);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKeydown);
  agreeBox.focus();
}
