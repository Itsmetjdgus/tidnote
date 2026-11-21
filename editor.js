// 글쓰기 화면의 서식 도구줄·미리보기·글자 수. write.js가 setupEditor(글 입력칸)을 부른다.
// 서식은 글에 기호로 저장된다(예: **굵게**). 화면에 바꿔 보여주는 일은 markdown.js가 한다.

function setupEditor(textarea, getImages) {
  const wrap = document.createElement('div');
  wrap.className = 'editor';
  textarea.parentNode.insertBefore(wrap, textarea);

  // ---- 탭: 쓰기 / 미리보기 ----
  const tabs = document.createElement('div');
  tabs.className = 'editor-tabs';
  tabs.setAttribute('role', 'tablist');
  const tabWrite = document.createElement('button');
  const tabPreview = document.createElement('button');
  [[tabWrite, 'editor.tab_write'], [tabPreview, 'editor.tab_preview']].forEach(function (pair) {
    pair[0].type = 'button';
    pair[0].setAttribute('role', 'tab');
    pair[0].textContent = t(pair[1]);
    tabs.append(pair[0]);
  });

  // ---- 도구줄 ----
  const toolbar = document.createElement('div');
  toolbar.className = 'editor-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', t('editor.toolbar'));

  const buttons = {};
  function addButton(name, glyph, keyName, shortcut, onClick, glyphClass) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tool = name;
    const label = t(keyName);
    b.setAttribute('aria-label', label);
    b.title = shortcut ? label + ' (' + shortcut + ')' : label;
    b.textContent = glyph !== null ? glyph : label;
    if (glyphClass) b.className = glyphClass;
    b.addEventListener('mousedown', function (e) { e.preventDefault(); }); // 글 입력칸의 선택이 풀리지 않게
    b.addEventListener('click', onClick);
    toolbar.append(b);
    buttons[name] = b;
  }
  function addGap() {
    const gap = document.createElement('span');
    gap.className = 'editor-gap';
    gap.setAttribute('aria-hidden', 'true');
    toolbar.append(gap);
  }

  // ---- 링크 주소 입력줄 ----
  const linkRow = document.createElement('div');
  linkRow.className = 'link-row';
  linkRow.hidden = true;
  const linkInput = document.createElement('input');
  linkInput.type = 'text';
  linkInput.setAttribute('inputmode', 'url');
  linkInput.setAttribute('autocomplete', 'off');
  linkInput.setAttribute('placeholder', 'https://');
  linkInput.setAttribute('aria-label', t('editor.link_label'));
  const linkApply = document.createElement('button');
  linkApply.type = 'button';
  linkApply.textContent = t('editor.link_apply');
  const linkCancel = document.createElement('button');
  linkCancel.type = 'button';
  linkCancel.className = 'secondary';
  linkCancel.textContent = t('common.close');
  const linkMsg = document.createElement('p');
  linkMsg.className = 'form-message';
  linkMsg.setAttribute('role', 'alert');
  linkRow.append(linkInput, linkApply, linkCancel, linkMsg);

  // ---- 미리보기, 안내, 글자 수 ----
  const preview = document.createElement('div');
  preview.className = 'post-content editor-preview';
  preview.hidden = true;
  const help = document.createElement('p');
  help.className = 'editor-help';
  help.textContent = t('editor.help');
  const status = document.createElement('p');
  status.className = 'editor-status';
  status.setAttribute('role', 'status');
  const count = document.createElement('span');
  count.className = 'editor-count';
  const limitMsg = document.createElement('span');
  status.append(limitMsg, count);

  wrap.append(tabs, toolbar, linkRow, textarea, preview, help, status);

  // ---- 글자 바꾸기(되돌리기 Ctrl+Z가 되도록 브라우저의 입력 기능을 먼저 쓴다) ----
  let limitTimer = null;
  function flashLimit() {
    limitMsg.textContent = t('editor.limit') + ' ';
    clearTimeout(limitTimer);
    limitTimer = setTimeout(function () { limitMsg.textContent = ''; }, 3000);
  }

  function apply(start, end, text, selStart, selEnd) {
    const max = textarea.maxLength > 0 ? textarea.maxLength : Infinity;
    if (textarea.value.length - (end - start) + text.length > max) {
      flashLimit();
      return false;
    }
    textarea.focus();
    textarea.setSelectionRange(start, end);
    const before = textarea.value;
    let done = false;
    try {
      done = document.execCommand('insertText', false, text);
    } catch (e) {
      done = false;
    }
    if (!done || textarea.value === before) {
      textarea.setRangeText(text, start, end, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    textarea.setSelectionRange(selStart, selEnd);
    return true;
  }

  function lineRange() {
    const v = textarea.value;
    const s = textarea.selectionStart;
    const e = textarea.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    const ref = e > s && v.charAt(e - 1) === '\n' ? e - 1 : e;
    let le = v.indexOf('\n', ref);
    if (le === -1) le = v.length;
    return { ls: ls, le: le, s: s, e: e, v: v };
  }

  // ---- 굵게·기울임·취소선 ----
  function starRun(str, fromEnd) {
    const m = fromEnd ? str.match(/\*+$/) : str.match(/^\*+/);
    return m ? m[0].length : 0;
  }
  function hasStars(n, want) { return want === 1 ? (n === 1 || n === 3) : n >= 2; }

  function toggleInline(open, close, keyName) {
    const v = textarea.value;
    const s = textarea.selectionStart;
    const e = textarea.selectionEnd;
    const sel = v.slice(s, e);
    const isStar = open.charAt(0) === '*';
    const want = open.length;

    if (isStar) {
      // 선택한 글자 안쪽에 기호가 있으면 벗긴다
      let n = Math.min(starRun(sel, false), starRun(sel, true), 3);
      if (sel.length > 2 * n && hasStars(n, want)) {
        const inner = sel.slice(want, sel.length - want);
        apply(s, e, inner, s, s + inner.length);
        return;
      }
      // 선택한 글자 바깥에 기호가 있으면 벗긴다
      const before = v.slice(Math.max(0, s - 3), s);
      const after = v.slice(e, e + 3);
      n = Math.min(starRun(before, true), starRun(after, false), 3);
      if (sel !== '' && hasStars(n, want)) {
        apply(s - want, e + want, sel, s - want, s - want + sel.length);
        return;
      }
    } else if (sel.length >= 2 * want && sel.indexOf(open) === 0 && sel.lastIndexOf(close) === sel.length - want) {
      const inner = sel.slice(want, sel.length - want);
      apply(s, e, inner, s, s + inner.length);
      return;
    } else if (sel !== '' && v.slice(s - want, s) === open && v.slice(e, e + want) === close) {
      apply(s - want, e + want, sel, s - want, s - want + sel.length);
      return;
    }

    if (sel === '') {
      const ph = t(keyName);
      apply(s, e, open + ph + close, s + want, s + want + ph.length);
      return;
    }
    if (sel.indexOf('\n') !== -1) {
      const wrapped = sel.split('\n').map(function (line) {
        const m = line.match(/^(\s*)([\s\S]*?)(\s*)$/);
        return m[2] === '' ? line : m[1] + open + m[2] + close + m[3];
      }).join('\n');
      apply(s, e, wrapped, s, s + wrapped.length);
      return;
    }
    const m = sel.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (m[2] === '') return;
    const out = m[1] + open + m[2] + close + m[3];
    const from = s + m[1].length + want;
    apply(s, e, out, from, from + m[2].length);
  }

  // ---- 제목·인용·목록(줄 앞에 기호를 붙이고, 이미 있으면 뗀다) ----
  const STRIP_ANY = /^(?:#{2,3}[ \t]+|>[ \t]?|-[ \t]+|\d{1,3}\.[ \t]+)/; // 줄 하나에는 한 종류의 기호만
  const LINE_KINDS = {
    heading: { has: /^##[ \t]+(?!#)/, strip: STRIP_ANY, make: function () { return '## '; } },
    subheading: { has: /^###[ \t]+/, strip: STRIP_ANY, make: function () { return '### '; } },
    quote: { has: /^>[ \t]?/, strip: STRIP_ANY, make: function () { return '> '; } },
    list: { has: /^-[ \t]+/, strip: STRIP_ANY, make: function () { return '- '; } },
    olist: { has: /^\d{1,3}\.[ \t]+/, strip: STRIP_ANY, make: function (n) { return n + '. '; } },
  };

  function toggleLines(kind) {
    const spec = LINE_KINDS[kind];
    const r = lineRange();
    const lines = r.v.slice(r.ls, r.le).split('\n');
    const filled = lines.filter(function (l) { return l.trim() !== ''; });
    let out;
    if (filled.length === 0) {
      out = lines.map(function (l, i) { return i === 0 ? spec.make(1) + l : l; });
    } else if (filled.every(function (l) { return spec.has.test(l); })) {
      out = lines.map(function (l) { return l.trim() === '' ? l : l.replace(spec.strip, ''); });
    } else {
      let n = 0;
      out = lines.map(function (l) {
        if (l.trim() === '') return l;
        n++;
        return spec.make(n) + l.replace(spec.strip, '');
      });
    }
    const text = out.join('\n');
    if (r.s === r.e) apply(r.ls, r.le, text, r.ls + text.length, r.ls + text.length);
    else apply(r.ls, r.le, text, r.ls, r.ls + text.length);
  }

  function insertDivider() {
    const r = lineRange();
    const line = r.v.slice(r.ls, r.le);
    const text = (line.trim() === '' ? '' : '\n') + '---\n';
    apply(r.le, r.le, text, r.le + text.length, r.le + text.length);
  }

  // ---- 링크 ----
  let linkFrom = 0;
  let linkTo = 0;
  function openLink() {
    if (preview.hidden === false) return;
    linkFrom = textarea.selectionStart;
    linkTo = textarea.selectionEnd;
    linkMsg.textContent = '';
    linkInput.value = '';
    linkRow.hidden = false;
    linkInput.focus();
  }
  function closeLink() {
    linkRow.hidden = true;
    textarea.focus();
    textarea.setSelectionRange(linkFrom, linkTo);
  }
  function applyLink() {
    let raw = linkInput.value.trim();
    const hasSpace = /\s/.test(raw);
    raw = raw.replace(/\(/g, '%28').replace(/\)/g, '%29');
    if (raw !== '' && !/^[a-z][a-z0-9+.\-]*:/i.test(raw)) raw = 'https://' + raw;
    const href = raw === '' || hasSpace ? null : safeLinkUrl(raw);
    if (!href) {
      linkMsg.textContent = t('editor.link_invalid');
      linkInput.focus();
      return;
    }
    const selected = textarea.value.slice(linkFrom, linkTo).replace(/[\[\]\n]/g, ' ').trim();
    const label = selected !== '' ? selected : new URL(href).hostname;
    const md = '[' + label + '](' + href + ')';
    linkRow.hidden = true;
    apply(linkFrom, linkTo, md, linkFrom + md.length, linkFrom + md.length);
  }
  linkApply.addEventListener('click', applyLink);
  linkCancel.addEventListener('click', closeLink);
  linkInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.isComposing) applyLink();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeLink();
    }
  });

  // ---- 도구 버튼 만들기 ----
  addButton('bold', 'B', 'editor.bold', 'Ctrl+B', function () { toggleInline('**', '**', 'editor.bold'); }, 'tool-bold');
  addButton('italic', 'I', 'editor.italic', 'Ctrl+I', function () { toggleInline('*', '*', 'editor.italic'); }, 'tool-italic');
  addButton('strike', 'S', 'editor.strike', null, function () { toggleInline('~~', '~~', 'editor.strike'); }, 'tool-strike');
  addGap();
  addButton('heading', null, 'editor.heading', null, function () { toggleLines('heading'); });
  addButton('subheading', null, 'editor.subheading', null, function () { toggleLines('subheading'); });
  addButton('quote', null, 'editor.quote', null, function () { toggleLines('quote'); });
  addButton('list', null, 'editor.list', null, function () { toggleLines('list'); });
  addButton('olist', null, 'editor.olist', null, function () { toggleLines('olist'); });
  addGap();
  addButton('divider', null, 'editor.divider', null, insertDivider);
  addButton('link', null, 'editor.link', 'Ctrl+K', openLink);

  textarea.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.isComposing) return;
    if (e.code === 'KeyB') { e.preventDefault(); toggleInline('**', '**', 'editor.bold'); }
    else if (e.code === 'KeyI') { e.preventDefault(); toggleInline('*', '*', 'editor.italic'); }
    else if (e.code === 'KeyK') { e.preventDefault(); openLink(); }
  });

  // ---- 탭 전환 ----
  function showPreview(on) {
    preview.hidden = !on;
    textarea.hidden = on;
    toolbar.hidden = on;
    help.hidden = on;
    if (on) {
      linkRow.hidden = true;
      preview.replaceChildren();
      if (textarea.value.trim() === '') {
        const empty = document.createElement('p');
        empty.className = 'state-message';
        empty.textContent = t('editor.preview_empty');
        preview.append(empty);
      } else {
        preview.append(renderMarkdown(textarea.value, getImages ? getImages() : null));
        if (typeof fillPostImages === 'function') fillPostImages(preview);
      }
    }
    tabWrite.setAttribute('aria-selected', on ? 'false' : 'true');
    tabPreview.setAttribute('aria-selected', on ? 'true' : 'false');
    tabWrite.classList.toggle('active', !on);
    tabPreview.classList.toggle('active', on);
  }
  tabWrite.addEventListener('click', function () { showPreview(false); textarea.focus(); });
  tabPreview.addEventListener('click', function () { showPreview(true); });

  // ---- 글자 수 ----
  function refresh() {
    const max = textarea.maxLength > 0 ? textarea.maxLength : 20000;
    count.textContent = t('editor.count', { n: textarea.value.length, max: max });
    count.classList.toggle('near', textarea.value.length > max * 0.9);
  }
  textarea.addEventListener('input', refresh);

  showPreview(false);
  refresh();
  // 사진 자리표시처럼 한 줄을 차지하는 것을 커서 위치에 넣는다(줄 중간이면 다음 줄로)
  function insertBlock(text) {
    const before = textarea.value.slice(0, textarea.selectionStart);
    const lead = before === '' || before.charAt(before.length - 1) === '\n' ? '' : '\n';
    const ins = lead + text + '\n';
    const at = textarea.selectionStart;
    return apply(at, textarea.selectionEnd, ins, at + ins.length, at + ins.length);
  }

  return { refresh: refresh, insertBlock: insertBlock };
}
