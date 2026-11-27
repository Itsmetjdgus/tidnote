// 79일차: 인스타그램식 "번역 보기". 누르면 그 자리에서 번역문으로 바뀌고, "원문 보기"로 되돌린다.
// 번역할 언어 = 기기(브라우저)의 기본 언어. 화면 언어(한국어/English)와는 따로다.
// 실제 번역은 서버 함수(supabase/functions/translate)가 DeepL로 한다. 키는 서버에만 있다.

// 기기 언어 → DeepL 번역 언어 코드
function deviceTranslateTarget() {
  const raw = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
  const base = raw.split('-')[0];
  const special = {
    en: raw === 'en-gb' ? 'EN-GB' : 'EN-US',
    pt: raw === 'pt-br' ? 'PT-BR' : 'PT-PT',
    zh: 'ZH-HANS',
    no: 'NB', nb: 'NB', nn: 'NB',
  };
  if (special[base]) return special[base];
  const plain = ['ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'nl', 'pl', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk'];
  return plain.indexOf(base) !== -1 ? base.toUpperCase() : 'EN-US';
}

// 글 언어(ko/en/ja/zh/other)와 번역 언어가 같으면 단추를 보여 주지 않는다
function needsTranslation(postLang, target) {
  const t = target.split('-')[0].toLowerCase();
  return postLang === 'other' || postLang !== t;
}

function createTranslateToggle(post, titleEl, bodyEl, photoPaths) {
  const target = deviceTranslateTarget();
  if (!needsTranslation(post.lang, target)) return null;

  const row = document.createElement('p');
  row.className = 'translate-row';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'translate-btn';
  btn.textContent = t('tr.see');
  const note = document.createElement('span');
  note.className = 'translate-note';
  note.setAttribute('role', 'status');
  row.append(btn, note);

  const original = { title: titleEl.textContent, nodes: null };
  let translated = null;
  let showing = false;

  function showOriginal() {
    titleEl.textContent = original.title;
    bodyEl.replaceChildren.apply(bodyEl, original.nodes);
    btn.textContent = t('tr.see');
    note.textContent = '';
    showing = false;
  }

  function showTranslated() {
    if (!original.nodes) original.nodes = Array.from(bodyEl.childNodes);
    titleEl.textContent = translated.title;
    bodyEl.replaceChildren(renderMarkdown(translated.content, photoPaths.map(function (p) { return { path: p }; })));
    if (typeof fillPostImages === 'function') fillPostImages(bodyEl);
    btn.textContent = t('tr.original');
    note.textContent = ' · ' + t('tr.by') + (translated.partial ? ' · ' + t('tr.partial') : '');
    showing = true;
  }

  btn.addEventListener('click', async function () {
    if (showing) return showOriginal();
    if (translated) return showTranslated();

    const { data: sessionData } = await db.auth.getSession();
    if (!sessionData.session) {
      if (typeof openLogin === 'function') openLogin();
      return;
    }
    btn.disabled = true;
    note.textContent = ' ' + t('tr.loading');
    let res;
    try {
      res = await db.functions.invoke('translate', { body: { post_id: post.id, target: target } });
    } catch (e) {
      res = { error: e };
    }
    btn.disabled = false;
    let code = '';
    if (res.error) {
      try {
        const ctx = res.error.context;
        const j = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
        code = j && j.error ? j.error : '';
      } catch (e) {}
      note.textContent = ' ' + t(code === 'too_many' ? 'tr.too_many' : code === 'quota' ? 'tr.quota' : code === 'not_configured' || !code ? 'tr.unavailable' : 'tr.failed');
      return;
    }
    translated = res.data;
    showTranslated();
  });

  return row;
}
