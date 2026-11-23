// 60일차: 글쓰기 화면의 "보이는 그대로" 편집기(네이버 블로그처럼 굵게를 누르면 바로 굵게 보인다).
// write.js가 setupEditor(글 입력칸, 사진목록함수)을 부르고, { refresh, insertBlock } 을 돌려받는다.
//
// 저장 형식은 바꾸지 않았다: 화면(편집 칸)에서 고친 내용을 예전과 같은 기호 글(**굵게**, ## 제목, [사진1] …)로
// 바꿔 숨겨 둔 글 입력칸(textarea)에 넣는다. 그래서 글 보기(markdown.js), 임시저장, 게시 코드는 그대로다.
//
// 안전 원칙: 편집 칸에 HTML 문자열을 넣지 않는다. 불러올 때는 markdown.js의 mdInline(문자 그대로 넣는 함수)으로 만들고,
// 붙여넣기는 서식 없는 글자로만 받는다. 링크는 http/https 주소만(safeLinkUrl).

function setupEditor(textarea, getImages) {
  const wrap = document.createElement('div');
  wrap.className = 'editor';
  textarea.parentNode.insertBefore(wrap, textarea);
  textarea.hidden = true;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.tabIndex = -1;

  const MAX = textarea.maxLength > 0 ? textarea.maxLength : 20000;
  const PHOTO_RE = /^\[(사진|photo)(\d{1,2})\][ \t]*$/i;
  const PHOTO_WORD = (/^\[(\D+)\d/.exec(t('photo.token', { n: 1 })) || [])[1] || '사진';

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

  // ---- 편집 칸 ----
  const area = document.createElement('div');
  area.className = 'rich-editor post-content';
  area.contentEditable = 'true';
  area.setAttribute('role', 'textbox');
  area.setAttribute('aria-multiline', 'true');
  area.setAttribute('aria-label', t('write.label_content'));
  area.setAttribute('spellcheck', 'true');
  area.dataset.placeholder = textarea.placeholder || '';
  const contentLabel = document.querySelector('label[for="' + textarea.id + '"]');
  if (contentLabel) {
    // 라벨을 누르면 편집 칸으로
    contentLabel.addEventListener('click', function (e) { e.preventDefault(); area.focus(); });
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
  const limitMsg = document.createElement('span');
  const count = document.createElement('span');
  count.className = 'editor-count';
  status.append(limitMsg, count);

  wrap.append(tabs, toolbar, linkRow, area, preview, help, status);

  // ===================== 기호 글 → 편집 칸 =====================
  function images() { return getImages ? getImages() : []; }

  function photoChip(n, word) {
    const fig = document.createElement('figure');
    fig.className = 'md-photo editor-photo';
    fig.contentEditable = 'false';
    fig.dataset.photo = String(n);
    fig.dataset.word = word || PHOTO_WORD;
    const item = images()[n - 1];
    if (item) {
      const img = document.createElement('img');
      if (item.url && /^blob:/.test(item.url)) img.src = item.url;
      else if (item.path) img.dataset.imagePath = item.path;
      img.alt = t('photo.alt', { n: n });
      fig.append(img);
    }
    const cap = document.createElement('figcaption');
    cap.textContent = t('photo.n', { n: n });
    fig.append(cap);
    return fig;
  }

  function lineDiv(text) {
    const div = document.createElement('div');
    if (text === '') div.append(document.createElement('br'));
    else mdAppendInline(div, text);
    return div;
  }

  function buildFromText(text) {
    const frag = document.createDocumentFragment();
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      let m;
      if ((m = PHOTO_RE.exec(line))) {
        frag.append(photoChip(Number(m[2]), m[1]));
        i++;
      } else if (MD_HR.test(line)) {
        frag.append(document.createElement('hr'));
        i++;
      } else if ((m = MD_HEAD.exec(line))) {
        const h = document.createElement(m[1].length === 2 ? 'h3' : 'h4');
        h.className = m[1].length === 2 ? 'md-h' : 'md-sub';
        mdAppendInline(h, m[2]);
        frag.append(h);
        i++;
      } else if (MD_QUOTE.test(line)) {
        const bq = document.createElement('blockquote');
        while (i < lines.length && MD_QUOTE.test(lines[i])) {
          bq.append(lineDiv(MD_QUOTE.exec(lines[i])[1]));
          i++;
        }
        frag.append(bq);
      } else if (MD_ULI.test(line) || MD_OLI.test(line)) {
        const ordered = MD_OLI.test(line);
        const re = ordered ? MD_OLI : MD_ULI;
        const list = document.createElement(ordered ? 'ol' : 'ul');
        while (i < lines.length && re.test(lines[i])) {
          const li = document.createElement('li');
          mdAppendInline(li, re.exec(lines[i])[ordered ? 2 : 1]);
          list.append(li);
          i++;
        }
        frag.append(list);
      } else {
        frag.append(lineDiv(line));
        i++;
      }
    }
    return frag;
  }

  // ===================== 편집 칸 → 기호 글 =====================
  const BLOCK_TAGS = { DIV: 1, P: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, UL: 1, OL: 1, LI: 1, HR: 1, FIGURE: 1, PRE: 1, SECTION: 1, ARTICLE: 1 };

  // 글자 서식(굵게·기울임·취소선·링크)을 기호로
  function inlineText(node) {
    let out = '';
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) {
        out += n.nodeValue.replace(/ /g, ' ').replace(/​/g, '');
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (tag === 'BR') {
        out += '\n';
        return;
      }
      if (BLOCK_TAGS[tag]) {
        // 줄 안에 끼어든 블록(붙여넣기 등)은 줄을 나눠서 글자만
        out += '\n' + inlineText(n) + '\n';
        return;
      }
      const inner = inlineText(n);
      if (inner.trim() === '') {
        out += inner;
        return;
      }
      const cs = n.style || {};
      const bold = tag === 'B' || tag === 'STRONG' || cs.fontWeight === 'bold' || Number(cs.fontWeight) >= 600;
      const italic = tag === 'I' || tag === 'EM' || cs.fontStyle === 'italic';
      const strike = tag === 'S' || tag === 'DEL' || tag === 'STRIKE' || /line-through/.test(cs.textDecoration || '');
      let s = inner;
      // 앞뒤 공백은 기호 밖으로(기호 안쪽이 공백이면 서식이 적용되지 않으므로)
      const lead = s.match(/^\s*/)[0];
      const trail = s.match(/\s*$/)[0];
      s = s.slice(lead.length, s.length - trail.length);
      if (tag === 'A') {
        const href = safeLinkUrl(n.getAttribute('href') || '');
        if (href) s = '[' + s.replace(/[\[\]\n]/g, ' ') + '](' + href + ')';
      }
      if (strike) s = '~~' + s + '~~';
      if (italic) s = '*' + s + '*';
      if (bold) s = '**' + s + '**';
      out += lead + s + trail;
    });
    return out;
  }

  function oneLine(text) {
    return text.replace(/\n+/g, ' ').trim();
  }

  function blockLines(container, lines) {
    let buf = null; // 블록 밖에 바로 붙은 글자(편집 칸이 처음 비어 있을 때 등)
    function flush() {
      if (buf === null) return;
      buf.split('\n').forEach(function (l) { lines.push(l); });
      buf = null;
    }
    container.childNodes.forEach(function (n) {
      if (n.nodeType === 3 || (n.nodeType === 1 && !BLOCK_TAGS[n.tagName])) {
        if (n.nodeType === 1 && n.tagName === 'BR') {
          if (buf === null) buf = '';
          flush();
          return;
        }
        const piece = n.nodeType === 3 ? n.nodeValue.replace(/ /g, ' ').replace(/​/g, '') : inlineText({ childNodes: [n] });
        buf = (buf === null ? '' : buf) + piece;
        return;
      }
      flush();
      const tag = n.tagName;
      if (tag === 'FIGURE' && n.dataset.photo) {
        lines.push('[' + (n.dataset.word || PHOTO_WORD) + n.dataset.photo + ']');
      } else if (tag === 'HR') {
        lines.push('---');
      } else if (tag === 'H3' || tag === 'H1' || tag === 'H2') {
        lines.push('## ' + oneLine(inlineText(n)));
      } else if (tag === 'H4' || tag === 'H5' || tag === 'H6') {
        lines.push('### ' + oneLine(inlineText(n)));
      } else if (tag === 'BLOCKQUOTE') {
        const inner = [];
        blockLines(n, inner);
        if (inner.length === 0) inner.push('');
        inner.forEach(function (l) { lines.push('> ' + l); });
      } else if (tag === 'UL' || tag === 'OL') {
        let k = 0;
        n.querySelectorAll('li').forEach(function (li) {
          // 안쪽 목록(들여쓰기)은 같은 단계로 펼친다
          const clone = li.cloneNode(true);
          clone.querySelectorAll('ul, ol').forEach(function (x) { x.remove(); });
          const text = oneLine(inlineText(clone));
          if (text === '') return;
          k++;
          lines.push((tag === 'OL' ? k + '. ' : '- ') + text);
        });
      } else if (tag === 'LI') {
        lines.push('- ' + oneLine(inlineText(n)));
      } else {
        // DIV, P 등: 한 줄(안의 <br>은 줄바꿈). 안에 블록이 들어 있으면 그 안을 다시 살핀다
        const hasBlock = Array.prototype.some.call(n.childNodes, function (c) { return c.nodeType === 1 && BLOCK_TAGS[c.tagName]; });
        if (hasBlock) {
          blockLines(n, lines);
        } else {
          let text = inlineText(n);
          if (text.endsWith('\n')) text = text.slice(0, -1); // 줄 끝의 <br>(빈 줄 표시)
          text.split('\n').forEach(function (l) { lines.push(l); });
        }
      }
    });
    flush();
  }

  function toText() {
    const lines = [];
    blockLines(area, lines);
    // 서식이 아닌 줄이 우연히 서식처럼 읽히지 않게(예: 그냥 쓴 "- " 줄은 목록이 되는 게 자연스러우므로 그대로 둔다)
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    return lines.join('\n');
  }

  // ===================== 동기화 =====================
  let lastText = null;

  function render(text) {
    area.replaceChildren(buildFromText(text));
    if (typeof fillPostImages === 'function') fillPostImages(area);
    lastText = text;
    paintEmpty();
  }

  // 되돌리기 기록: 브라우저 기본 되돌리기는 줄 서식(제목·인용·목록·사진)을 모르므로 글 전체를 기록해 둔다.
  // 연달아 타자를 치는 동안(1초 이내)은 한 번으로 묶는다.
  let history = [];
  let histPos = -1;
  let lastPushAt = 0;
  function resetHistory(text) {
    history = [text];
    histPos = 0;
    lastPushAt = 0;
  }
  function pushHistory(text, typing) {
    if (history[histPos] === text) return;
    const now = Date.now();
    history = history.slice(0, histPos + 1);
    if (typing && now - lastPushAt < 1000 && histPos > 0) history[histPos] = text;
    else {
      history.push(text);
      if (history.length > 200) history.shift();
    }
    histPos = history.length - 1;
    lastPushAt = typing ? now : 0;
  }
  function stepHistory(d) {
    const next = histPos + d;
    if (next < 0 || next >= history.length) return;
    histPos = next;
    const text = history[histPos];
    render(text);
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const r = document.createRange();
    r.selectNodeContents(area);
    r.collapse(false);
    area.focus();
    restoreSelection(r);
    paintTools();
  }

  function sync(typing) {
    const text = toText();
    if (text === lastText) return;
    if (text.length > MAX) flashLimit();
    lastText = text;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    pushHistory(text, typing === true);
    paintEmpty();
  }

  function paintEmpty() {
    const empty = area.textContent.trim() === '' && !area.querySelector('figure, hr, li');
    area.classList.toggle('is-empty', empty);
  }

  let limitTimer = null;
  function flashLimit() {
    limitMsg.textContent = t('editor.limit') + ' ';
    clearTimeout(limitTimer);
    limitTimer = setTimeout(function () { limitMsg.textContent = ''; }, 4000);
  }

  // 바깥(write.js)에서 글 입력칸을 바꿨으면(불러오기, 사진 지우기) 편집 칸을 다시 그린다
  function refresh() {
    if (textarea.value !== lastText) {
      render(textarea.value);
      pushHistory(textarea.value, false);
    }
    count.textContent = t('editor.count', { n: textarea.value.length, max: MAX });
    count.classList.toggle('near', textarea.value.length > MAX * 0.9);
  }
  textarea.addEventListener('input', function () {
    count.textContent = t('editor.count', { n: textarea.value.length, max: MAX });
    count.classList.toggle('near', textarea.value.length > MAX * 0.9);
  });

  area.addEventListener('input', function (e) {
    // 한글 조합 중(ㅎ→하→한)에는 편집 칸을 건드리지 않는다(조합이 깨지지 않게). 조합이 끝나면 compositionend 에서 처리
    if (e.isComposing) {
      sync(true);
      return;
    }
    normalizeTop();
    sync(e.inputType === 'insertText' || e.inputType === 'insertCompositionText' || e.inputType === 'deleteContentBackward');
    paintTools();
  });

  // 맨 바깥에 글자가 바로 붙으면 줄(div)로 감싸 둔다(줄 단위 서식이 잘 먹도록)
  function normalizeTop() {
    let run = [];
    function wrapRun() {
      if (!run.length) return;
      const div = document.createElement('div');
      run[0].parentNode.insertBefore(div, run[0]);
      run.forEach(function (n) { div.append(n); });
      run = [];
    }
    const sel = saveSelection();
    let changed = false;
    Array.from(area.childNodes).forEach(function (n) {
      const inline = n.nodeType === 3 || (n.nodeType === 1 && !BLOCK_TAGS[n.tagName] && n.tagName !== 'BR');
      if (inline) {
        if (n.nodeType === 3 && n.nodeValue === '') return;
        run.push(n);
        changed = true;
      } else {
        wrapRun();
      }
    });
    wrapRun();
    if (changed) restoreSelection(sel);
  }

  // ===================== 선택 영역 =====================
  let savedRange = null;
  function inArea(node) { return node && (node === area || area.contains(node)); }
  document.addEventListener('selectionchange', function () {
    const s = window.getSelection();
    if (s.rangeCount && inArea(s.anchorNode)) {
      savedRange = s.getRangeAt(0).cloneRange();
      paintTools();
    }
  });
  function saveSelection() {
    const s = window.getSelection();
    return s.rangeCount && inArea(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null;
  }
  function restoreSelection(r) {
    if (!r) return;
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  function focusArea() {
    const cur = window.getSelection();
    if (document.activeElement === area && cur.rangeCount && inArea(cur.anchorNode)) return;
    area.focus();
    if (savedRange && inArea(savedRange.startContainer)) restoreSelection(savedRange);
    else {
      const r = document.createRange();
      r.selectNodeContents(area);
      r.collapse(false);
      restoreSelection(r);
    }
  }

  // 지금 커서가 있는 맨 바깥 줄(편집 칸의 바로 아래 자식)
  function topBlockAt(node) {
    while (node && node.parentNode !== area) node = node.parentNode;
    return node && node.parentNode === area ? node : null;
  }
  function selectedTopBlocks() {
    const s = window.getSelection();
    if (!s.rangeCount) return [];
    const r = s.getRangeAt(0);
    let a = topBlockAt(r.startContainer === area ? area.childNodes[r.startOffset] || area.lastChild : r.startContainer);
    let b = topBlockAt(r.endContainer === area ? area.childNodes[Math.max(0, r.endOffset - 1)] || area.lastChild : r.endContainer);
    if (!a) a = b;
    if (!b) b = a;
    if (!a) return [];
    const out = [];
    let n = a;
    while (n) {
      out.push(n);
      if (n === b) break;
      n = n.nextSibling;
    }
    return out;
  }

  // ===================== 서식 명령 =====================
  function exec(cmd, value) {
    focusArea();
    const mark = /List$/.test(cmd) ? caretMark() : null;
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(cmd, false, value === undefined ? null : value);
    if (mark) caretBack(mark, null);
    normalizeTop();
    sync();
    paintTools();
  }

  function moveChildren(from, to) {
    while (from.firstChild) to.append(from.firstChild);
  }

  // 커서(선택) 위치를 글자 노드 기준으로 기억했다가 되돌린다. 줄을 옮겨도 글자 노드는 그대로라서 위치가 유지된다
  function caretMark() {
    const s = window.getSelection();
    if (!s.rangeCount || !inArea(s.anchorNode)) return null;
    const r = s.getRangeAt(0);
    return { sc: r.startContainer, so: r.startOffset, ec: r.endContainer, eo: r.endOffset };
  }
  function caretBack(mark, fallback) {
    const ok = mark && area.contains(mark.sc) && area.contains(mark.ec) && mark.sc !== area;
    const r = document.createRange();
    try {
      if (ok) {
        r.setStart(mark.sc, Math.min(mark.so, mark.sc.nodeType === 3 ? mark.sc.length : mark.sc.childNodes.length));
        r.setEnd(mark.ec, Math.min(mark.eo, mark.ec.nodeType === 3 ? mark.ec.length : mark.ec.childNodes.length));
      } else if (fallback) {
        r.selectNodeContents(fallback);
        r.collapse(false);
      } else {
        return;
      }
    } catch (e) {
      if (!fallback) return;
      r.selectNodeContents(fallback);
      r.collapse(false);
    }
    restoreSelection(r);
    savedRange = r.cloneRange();
  }

  // 선택한 "줄"들: 맨 바깥 줄, 인용 안이면 인용 속의 줄
  function selectedLines() {
    const s = window.getSelection();
    if (!s.rangeCount) return [];
    const r = s.getRangeAt(0);
    const out = [];
    selectedTopBlocks().forEach(function (b) {
      if (b.nodeType === 1 && (b.tagName === 'BLOCKQUOTE' || b.tagName === 'UL' || b.tagName === 'OL')) {
        const kids = Array.from(b.childNodes).filter(function (c) {
          try { return r.intersectsNode(c); } catch (e) { return false; }
        });
        (kids.length ? kids : [b.firstChild]).forEach(function (c) { if (c) out.push(c); });
      } else {
        out.push(b);
      }
    });
    return out;
  }

  function asLine(node) {
    // 아무 줄이나 보통 줄(div)로 만든다(글자 노드는 그대로 옮긴다)
    if (node.nodeType === 3) {
      const d = document.createElement('div');
      node.parentNode.insertBefore(d, node);
      d.append(node);
      return d;
    }
    if (node.tagName === 'DIV') return node;
    const d = document.createElement('div');
    if (node.tagName === 'UL' || node.tagName === 'OL') d.append(document.createTextNode(node.innerText.replace(/\n+/g, ' ')));
    else moveChildren(node, d);
    if (!d.firstChild) d.append(document.createElement('br'));
    node.parentNode.replaceChild(d, node);
    return d;
  }

  const WRAPS = { BLOCKQUOTE: 1, UL: 1, OL: 1 };
  function wrapped(l) { return l.parentNode && l.parentNode !== area && WRAPS[l.parentNode.tagName] && l.parentNode.parentNode === area; }

  // 인용·목록 속 줄들을 밖으로 꺼낸다(인용·목록을 앞·뒤로 나눈다)
  function unquoteLines(lines) {
    const byQuote = new Map();
    lines.forEach(function (l) {
      const bq = l.parentNode;
      if (wrapped(l)) {
        if (!byQuote.has(bq)) byQuote.set(bq, []);
        byQuote.get(bq).push(l);
      }
    });
    const moved = [];
    byQuote.forEach(function (sel, bq) {
      const kids = Array.from(bq.childNodes);
      const first = kids.indexOf(sel[0]);
      const last = kids.indexOf(sel[sel.length - 1]);
      const after = document.createElement(bq.tagName.toLowerCase());
      kids.slice(last + 1).forEach(function (k) { after.append(k); });
      let ref = bq.nextSibling;
      kids.slice(first, last + 1).forEach(function (k) {
        const line = asLineDetached(k);
        area.insertBefore(line, ref);
        moved.push(line);
      });
      if (after.firstChild) area.insertBefore(after, ref);
      if (!bq.firstChild) bq.remove();
    });
    return moved;
  }
  function asLineDetached(k) {
    if (k.nodeType === 1 && k.tagName === 'DIV') return k;
    const d = document.createElement('div');
    if (k.nodeType === 3 || !BLOCK_TAGS[k.tagName]) d.append(k);
    else { moveChildren(k, d); k.remove(); }
    if (!d.firstChild) d.append(document.createElement('br'));
    return d;
  }

  // 줄 서식(제목·소제목·인용) 켜고 끄기. 이미 그 서식이면 보통 줄로 되돌린다
  function toggleBlock(kind) {
    focusArea();
    const mark = caretMark();
    let lines = selectedLines().filter(function (l) { return !(l.nodeType === 1 && (l.tagName === 'FIGURE' || l.tagName === 'HR')); });
    if (!lines.length) {
      const div = lineDiv('');
      area.append(div);
      lines = [div];
    }
    let last = null;
    if (kind === 'quote') {
      const inQuote = lines.every(function (l) { return wrapped(l) && l.parentNode.tagName === 'BLOCKQUOTE'; });
      if (inQuote) {
        const moved = unquoteLines(lines);
        last = moved[moved.length - 1];
      } else {
        lines = unquoteLines(lines.filter(wrapped)).concat(lines.filter(function (l) { return !wrapped(l); }));
        lines.sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
        const bq = document.createElement('blockquote');
        area.insertBefore(bq, lines[0]);
        lines.forEach(function (l) {
          const line = asLine(l);
          bq.append(line);
          last = line;
        });
      }
    } else {
      const want = kind === 'heading' ? 'H3' : 'H4';
      // 인용 속 줄이면 먼저 꺼낸다
      lines = lines.map(function (l) {
        return wrapped(l) ? unquoteLines([l])[0] : l;
      });
      const allOn = lines.every(function (l) { return l.nodeType === 1 && l.tagName === want; });
      lines.forEach(function (l) {
        const el = document.createElement(allOn ? 'div' : want.toLowerCase());
        if (!allOn) el.className = want === 'H3' ? 'md-h' : 'md-sub';
        if (l.nodeType === 3) el.append(l.cloneNode());
        else if (l.tagName === 'UL' || l.tagName === 'OL') el.append(document.createTextNode(l.innerText.replace(/\n+/g, ' ')));
        else moveChildren(l, el);
        if (!el.firstChild) el.append(document.createElement('br'));
        l.parentNode.replaceChild(el, l);
        last = el;
      });
    }
    area.querySelectorAll('blockquote').forEach(function (bq) { if (!bq.firstChild) bq.remove(); });
    caretBack(mark, last);
    sync();
    paintTools();
  }

  // 목록(점·번호) 켜고 끄기
  function toggleList(ordered) {
    focusArea();
    const mark = caretMark();
    const want = ordered ? 'OL' : 'UL';
    let lines = selectedLines().filter(function (l) { return !(l.nodeType === 1 && (l.tagName === 'FIGURE' || l.tagName === 'HR')); });
    if (!lines.length) {
      const div = lineDiv('');
      area.append(div);
      lines = [div];
    }
    let last = null;
    const allOn = lines.every(function (l) { return wrapped(l) && l.parentNode.tagName === want; });
    if (allOn) {
      const moved = unquoteLines(lines);
      last = moved[moved.length - 1];
    } else {
      lines = unquoteLines(lines.filter(wrapped)).concat(lines.filter(function (l) { return !wrapped(l); }));
      lines.sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
      const list = document.createElement(want.toLowerCase());
      area.insertBefore(list, lines[0]);
      lines.forEach(function (l) {
        const li = document.createElement('li');
        if (l.nodeType === 3) li.append(l);
        else {
          moveChildren(l, li);
          l.remove();
        }
        if (!li.firstChild) li.append(document.createElement('br'));
        list.append(li);
        last = li;
      });
    }
    area.querySelectorAll('blockquote, ul, ol').forEach(function (x) { if (!x.firstChild) x.remove(); });
    caretBack(mark, last);
    sync();
    paintTools();
  }

  function insertDivider() {
    focusArea();
    const block = selectedTopBlocks().pop();
    const hr = document.createElement('hr');
    const next = lineDiv('');
    if (block) {
      area.insertBefore(hr, block.nextSibling);
    } else {
      area.append(hr);
    }
    area.insertBefore(next, hr.nextSibling);
    const r = document.createRange();
    r.setStart(next, 0);
    r.collapse(true);
    restoreSelection(r);
    sync();
  }

  // 사진 자리처럼 한 줄을 차지하는 것을 커서가 있던 줄 다음에 넣는다(write.js가 부름)
  function insertBlock(text) {
    const m = PHOTO_RE.exec(String(text).trim());
    if (!preview.hidden) showPreview(false);
    focusArea();
    const blocks = selectedTopBlocks();
    let after = blocks.length ? blocks[blocks.length - 1] : area.lastChild;
    const node = m ? photoChip(Number(m[2]), m[1]) : lineDiv(String(text));
    // 커서가 빈 줄에 있으면 그 줄 자리에 넣는다
    if (after && after.tagName === 'DIV' && after.textContent.trim() === '' && !after.querySelector('img')) {
      area.replaceChild(node, after);
    } else if (after) {
      area.insertBefore(node, after.nextSibling);
    } else {
      area.append(node);
    }
    let next = node.nextSibling;
    if (!next || next.tagName !== 'DIV') {
      next = lineDiv('');
      area.insertBefore(next, node.nextSibling);
    }
    const r = document.createRange();
    r.setStart(next, 0);
    r.collapse(true);
    restoreSelection(r);
    savedRange = r.cloneRange();
    if (typeof fillPostImages === 'function') fillPostImages(node.parentNode ? area : node);
    sync();
    return true;
  }

  // ===================== 링크 =====================
  let linkRange = null;
  function openLink() {
    if (!preview.hidden) return;
    focusArea();
    linkRange = saveSelection();
    linkMsg.textContent = '';
    const s = window.getSelection();
    const a = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode).closest('a');
    linkInput.value = a && inArea(a) ? a.getAttribute('href') : '';
    linkRow.hidden = false;
    linkInput.focus();
  }
  function closeLink() {
    linkRow.hidden = true;
    area.focus();
    restoreSelection(linkRange);
  }
  function applyLink() {
    let raw = linkInput.value.trim();
    if (raw === '') { // 비우고 넣기 = 링크 없애기
      linkRow.hidden = true;
      area.focus();
      restoreSelection(linkRange);
      exec('unlink');
      return;
    }
    const hasSpace = /\s/.test(raw);
    raw = raw.replace(/\(/g, '%28').replace(/\)/g, '%29');
    if (!/^[a-z][a-z0-9+.\-]*:/i.test(raw)) raw = 'https://' + raw;
    const href = hasSpace ? null : safeLinkUrl(raw);
    if (!href) {
      linkMsg.textContent = t('editor.link_invalid');
      linkInput.focus();
      return;
    }
    linkRow.hidden = true;
    area.focus();
    restoreSelection(linkRange);
    const s = window.getSelection();
    if (!s.rangeCount || s.getRangeAt(0).collapsed) {
      // 고른 글자가 없으면 주소 이름을 글자로 넣는다
      document.execCommand('insertText', false, new URL(href).hostname);
      const r = s.getRangeAt(0);
      const node = r.startContainer;
      const end = r.startOffset;
      const start = Math.max(0, end - new URL(href).hostname.length);
      const sel = document.createRange();
      sel.setStart(node, start);
      sel.setEnd(node, end);
      restoreSelection(sel);
    }
    exec('createLink', href);
    area.querySelectorAll('a').forEach(function (a) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow ugc';
    });
    const after = window.getSelection();
    if (after.rangeCount) {
      const r = after.getRangeAt(0);
      r.collapse(false);
      restoreSelection(r);
    }
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

  // ===================== 도구 단추 =====================
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
    b.addEventListener('mousedown', function (e) { e.preventDefault(); }); // 편집 칸의 선택이 풀리지 않게
    b.addEventListener('click', onClick);
    toolbar.append(b);
    buttons[name] = b;
    return b;
  }
  function addGap() {
    const gap = document.createElement('span');
    gap.className = 'editor-gap';
    gap.setAttribute('aria-hidden', 'true');
    toolbar.append(gap);
  }

  addButton('undo', '↶', 'editor.undo', 'Ctrl+Z', function () { stepHistory(-1); }, 'tool-undo');
  addButton('redo', '↷', 'editor.redo', 'Ctrl+Y', function () { stepHistory(1); }, 'tool-redo');
  addGap();
  addButton('bold', 'B', 'editor.bold', 'Ctrl+B', function () { exec('bold'); }, 'tool-bold');
  addButton('italic', 'I', 'editor.italic', 'Ctrl+I', function () { exec('italic'); }, 'tool-italic');
  addButton('strike', 'S', 'editor.strike', null, function () { exec('strikeThrough'); }, 'tool-strike');
  addGap();
  addButton('heading', null, 'editor.heading', null, function () { toggleBlock('heading'); });
  addButton('subheading', null, 'editor.subheading', null, function () { toggleBlock('subheading'); });
  addButton('quote', null, 'editor.quote', null, function () { toggleBlock('quote'); });
  addButton('list', null, 'editor.list', null, function () { toggleList(false); });
  addButton('olist', null, 'editor.olist', null, function () { toggleList(true); });
  addGap();
  addButton('divider', null, 'editor.divider', null, insertDivider);
  addButton('link', null, 'editor.link', 'Ctrl+K', openLink);
  const photoInput = document.getElementById('photo-input');
  if (photoInput) {
    addButton('photo', null, 'editor.photo', null, function () {
      savedRange = saveSelection() || savedRange;
      photoInput.click();
    });
  }

  // 커서 위치의 서식을 단추에 표시(켜짐 = 진하게)
  function paintTools() {
    const s = window.getSelection();
    if (!s.rangeCount || !inArea(s.anchorNode)) return;
    function q(cmd) {
      try { return document.queryCommandState(cmd); } catch (e) { return false; }
    }
    const block = topBlockAt(s.anchorNode);
    const tag = block && block.tagName;
    const on = {
      bold: q('bold'),
      italic: q('italic'),
      strike: q('strikeThrough'),
      list: tag === 'UL',
      olist: tag === 'OL',
      heading: tag === 'H3',
      subheading: tag === 'H4',
      quote: tag === 'BLOCKQUOTE',
      link: !!(s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode).closest('a')),
    };
    Object.keys(on).forEach(function (k) {
      if (!buttons[k]) return;
      buttons[k].classList.toggle('on', on[k]);
      buttons[k].setAttribute('aria-pressed', on[k] ? 'true' : 'false');
    });
  }

  // ===================== 키보드, 붙여넣기 =====================
  area.addEventListener('keydown', function (e) {
    if (e.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY')) {
      e.preventDefault();
      stepHistory(e.code === 'KeyY' || e.shiftKey ? 1 : -1);
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyK') {
      e.preventDefault();
      openLink();
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && (e.code === 'KeyB' || e.code === 'KeyI')) {
      e.preventDefault();
      exec(e.code === 'KeyB' ? 'bold' : 'italic');
      return;
    }
    // 제목·소제목 줄 끝에서 Enter → 다음 줄은 보통 글
    if (e.key === 'Enter' && !e.shiftKey) {
      const s = window.getSelection();
      const block = s.rangeCount ? topBlockAt(s.anchorNode) : null;
      if (block && (block.tagName === 'H3' || block.tagName === 'H4')) {
        const r = s.getRangeAt(0);
        const tail = document.createRange();
        tail.selectNodeContents(block);
        tail.setStart(r.endContainer, r.endOffset);
        if (tail.toString() === '') {
          e.preventDefault();
          const div = lineDiv('');
          area.insertBefore(div, block.nextSibling);
          const nr = document.createRange();
          nr.setStart(div, 0);
          nr.collapse(true);
          restoreSelection(nr);
          sync();
        }
      }
    }
    // 빈 줄에서 Backspace로 사진·구분선 지우기
    if (e.key === 'Backspace') {
      const s = window.getSelection();
      if (s.rangeCount && s.getRangeAt(0).collapsed) {
        const block = topBlockAt(s.anchorNode);
        const prev = block && block.previousSibling;
        const atStart = block && s.anchorOffset === 0 && (s.anchorNode === block || s.anchorNode === block.firstChild);
        if (prev && atStart && (prev.tagName === 'FIGURE' || prev.tagName === 'HR')) {
          e.preventDefault();
          prev.remove();
          sync();
        }
      }
    }
  });

  // 붙여넣기는 서식 없는 글자로(다른 사이트의 글꼴·색·숨은 코드가 섞이지 않게)
  area.addEventListener('paste', function (e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (!text) return;
    const room = MAX - textarea.value.length;
    if (text.length > room) flashLimit();
    document.execCommand('insertText', false, text.slice(0, Math.max(0, room)));
  });
  area.addEventListener('drop', function (e) { e.preventDefault(); });
  area.addEventListener('compositionend', function () {
    normalizeTop();
    sync(true);
  });
  area.addEventListener('beforeinput', function (e) {
    if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
      e.preventDefault();
      stepHistory(e.inputType === 'historyUndo' ? -1 : 1);
    }
  });
  // 링크를 누르면 편집 중에는 이동하지 않고 링크 고치기 줄을 연다
  area.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('a');
    if (a && inArea(a)) {
      e.preventDefault();
      openLink();
    }
  });

  // ===================== 탭 전환 =====================
  function showPreview(on) {
    preview.hidden = !on;
    area.hidden = on;
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
        preview.append(renderMarkdown(textarea.value, images()));
        if (typeof fillPostImages === 'function') fillPostImages(preview);
      }
    }
    tabWrite.setAttribute('aria-selected', on ? 'false' : 'true');
    tabPreview.setAttribute('aria-selected', on ? 'true' : 'false');
    tabWrite.classList.toggle('active', !on);
    tabPreview.classList.toggle('active', on);
  }
  tabWrite.addEventListener('click', function () { showPreview(false); area.focus(); });
  tabPreview.addEventListener('click', function () { showPreview(true); });

  try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (e) {}
  showPreview(false);
  render(textarea.value);
  resetHistory(textarea.value);
  refresh();

  // 사진 목록이 바뀌었을 때(수정 화면에서 사진을 불러온 뒤 등) 편집 칸의 사진 칸 그림만 채운다
  function updatePhotos() {
    area.querySelectorAll('figure[data-photo]').forEach(function (fig) {
      const item = images()[Number(fig.dataset.photo) - 1];
      const old = fig.querySelector('img');
      if (!item || old) return;
      const img = document.createElement('img');
      if (item.url && /^blob:/.test(item.url)) img.src = item.url;
      else if (item.path) img.dataset.imagePath = item.path;
      img.alt = t('photo.alt', { n: Number(fig.dataset.photo) });
      fig.prepend(img);
    });
    if (typeof fillPostImages === 'function') fillPostImages(area);
  }

  return { refresh: refresh, insertBlock: insertBlock, focus: focusArea, updatePhotos: updatePhotos };
}
