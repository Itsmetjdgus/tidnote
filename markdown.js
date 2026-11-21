// 글 본문의 간단한 서식(굵게·기울임·취소선·제목·인용·목록·구분선·링크)을 화면 요소로 바꾼다.
// 안전 원칙: HTML 문자열을 만들지 않는다. 글자는 항상 textContent(문자 그대로)로만 넣고,
// 링크는 http/https 주소만 허용한다. 그래서 글에 <script>나 <img onerror=...>를 써도 글자로만 보인다.

const MD_MAX_DEPTH = 3; // 굵게 안의 기울임처럼 겹치는 서식은 3단계까지만

// 링크 주소 검사: http/https만, 아이디·비밀번호가 들어간 주소는 거절. 통과하면 정리된 주소를, 아니면 null
function safeLinkUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch (e) {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.hostname === '' || /[^a-z0-9.\-]/i.test(u.hostname)) return null; // 주소 이름(호스트)에는 영문·숫자·점·하이픈만(한글 도메인은 자동 변환된 형태로 통과)
  if (/[()\s]/.test(u.href) || u.href.length > 500) return null;
  return u.href;
}

// 한 줄 안의 서식. 각 규칙은 길이를 제한해서(300자) 아주 긴 줄에서도 느려지지 않게 했다.
const MD_INLINE = new RegExp([
  '\\[([^\\]\\n]{1,200})\\]\\((https?:\\/\\/[^\\s()]{1,500})\\)',       // 1,2: [글자](주소)
  '\\*\\*\\*(\\S(?:.{0,300}?\\S)?)\\*\\*\\*',                            // 3: ***굵은 기울임***
  '\\*\\*(\\S(?:.{0,300}?\\S)?)\\*\\*',                                  // 4: **굵게**
  '~~(\\S(?:.{0,300}?\\S)?)~~',                                          // 5: ~~취소선~~
  '\\*([^\\s*](?:[^*\\n]{0,300}?[^\\s*])?)\\*',                          // 6: *기울임*
].join('|'), 'g');

function mdInline(text, depth) {
  const out = [];
  if (depth > MD_MAX_DEPTH) {
    out.push(document.createTextNode(text));
    return out;
  }
  let last = 0;
  let m;
  const re = new RegExp(MD_INLINE.source, 'g'); // 겹치는 서식(재귀)에서 위치가 섞이지 않도록 매번 새로 만든다
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    let el = null;
    if (m[1] !== undefined) {
      const href = safeLinkUrl(m[2]);
      if (href) {
        el = document.createElement('a');
        el.href = href;
        el.target = '_blank';
        el.rel = 'noopener noreferrer nofollow ugc';
        el.className = 'md-link';
        el.title = new URL(href).hostname;
        el.textContent = m[1];
      } else {
        out.push(document.createTextNode(m[0]));
      }
    } else if (m[3] !== undefined) {
      el = document.createElement('strong');
      const em = document.createElement('em');
      mdInline(m[3], depth + 1).forEach(function (n) { em.append(n); });
      el.append(em);
    } else if (m[4] !== undefined) {
      el = document.createElement('strong');
      mdInline(m[4], depth + 1).forEach(function (n) { el.append(n); });
    } else if (m[5] !== undefined) {
      el = document.createElement('del');
      mdInline(m[5], depth + 1).forEach(function (n) { el.append(n); });
    } else {
      el = document.createElement('em');
      mdInline(m[6], depth + 1).forEach(function (n) { el.append(n); });
    }
    if (el) out.push(el);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

function mdAppendInline(parent, text) {
  mdInline(text, 1).forEach(function (n) { parent.append(n); });
}

const MD_HR = /^[ \t]*---+[ \t]*$/;
const MD_HEAD = /^(#{2,3})[ \t]+(\S.*)$/;
const MD_QUOTE = /^>[ \t]?(.*)$/;
const MD_ULI = /^-[ \t]+(\S.*)$/;
const MD_OLI = /^(\d{1,3})\.[ \t]+(\S.*)$/;
const MD_PHOTO = /^\[(?:사진|photo)(\d{1,2})\][ \t]*$/i; // 사진 자리: 줄 전체가 [사진1] (영어 화면에서는 [photo1])

function mdIsBlockLine(line) {
  return MD_PHOTO.test(line) || MD_HR.test(line) || MD_HEAD.test(line) || MD_QUOTE.test(line) || MD_ULI.test(line) || MD_OLI.test(line);
}

// 사진 자리 [사진N] -> 사진 칸. images[N-1] 은 { path } (저장소 경로, 나중에 fillPostImages가 주소를 채움)
// 또는 { url } (글쓰기 미리보기용 blob: 주소). 글에 쓴 주소는 절대 사진 주소로 쓰지 않는다.
function mdPhoto(n, images) {
  const item = images && images[n - 1];
  if (!item) return null;
  const img = document.createElement('img');
  if (item.url && /^blob:/.test(item.url)) img.src = item.url;
  else if (item.path) img.dataset.imagePath = item.path;
  else return null;
  img.alt = t('photo.alt', { n: n });
  img.loading = 'lazy';
  const fig = document.createElement('figure');
  fig.className = 'md-photo';
  fig.append(img);
  return fig;
}

// 글 속에서 자리가 잡힌 사진 번호들(중복 없이)
function mdPlacedPhotos(text) {
  const found = [];
  String(text).replace(/\r\n?/g, '\n').split('\n').forEach(function (line) {
    const m = MD_PHOTO.exec(line);
    if (m && found.indexOf(Number(m[1])) === -1) found.push(Number(m[1]));
  });
  return found;
}

// 글 전체 -> 화면 조각(DocumentFragment). 서식이 없는 글은 예전과 똑같이(줄바꿈 그대로) 한 덩어리로 보인다.
function renderMarkdown(text, images) {
  const frag = document.createDocumentFragment();
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if ((m = MD_PHOTO.exec(line))) {
      const fig = mdPhoto(Number(m[1]), images);
      if (fig) {
        frag.append(fig);
      } else { // 그런 사진이 없으면 글자 그대로 보여 준다
        const p = document.createElement('p');
        p.className = 'md-p';
        p.textContent = line;
        frag.append(p);
      }
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
      const parts = [];
      while (i < lines.length && MD_QUOTE.test(lines[i])) {
        parts.push(MD_QUOTE.exec(lines[i])[1]);
        i++;
      }
      const bq = document.createElement('blockquote');
      const p = document.createElement('p');
      p.className = 'md-p';
      mdAppendInline(p, parts.join('\n'));
      bq.append(p);
      frag.append(bq);
    } else if (MD_ULI.test(line) || MD_OLI.test(line)) {
      const ordered = MD_OLI.test(line);
      const re = ordered ? MD_OLI : MD_ULI;
      const list = document.createElement(ordered ? 'ol' : 'ul');
      if (ordered) list.start = Number(MD_OLI.exec(line)[1]);
      while (i < lines.length && re.test(lines[i])) {
        const li = document.createElement('li');
        mdAppendInline(li, re.exec(lines[i])[ordered ? 2 : 1]);
        list.append(li);
        i++;
      }
      frag.append(list);
    } else {
      const run = [];
      while (i < lines.length && !mdIsBlockLine(lines[i])) {
        run.push(lines[i]);
        i++;
      }
      while (run.length > 0 && run[0].trim() === '') run.shift();
      while (run.length > 0 && run[run.length - 1].trim() === '') run.pop();
      if (run.length > 0) {
        const p = document.createElement('p');
        p.className = 'md-p';
        mdAppendInline(p, run.join('\n'));
        frag.append(p);
      }
    }
  }
  return frag;
}

// 글 목록 카드의 미리보기용: 서식 기호를 지운 한 줄 글자(앞 100자)
function stripMarkdown(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').map(function (line) {
    if (MD_HR.test(line) || MD_PHOTO.test(line)) return '';
    let m;
    if ((m = MD_HEAD.exec(line))) return m[2];
    if ((m = MD_QUOTE.exec(line))) return m[1];
    if ((m = MD_ULI.exec(line))) return m[1];
    if ((m = MD_OLI.exec(line))) return m[2];
    return line;
  });
  let plain = lines.join(' ');
  for (let pass = 0; pass < MD_MAX_DEPTH; pass++) { // 겹친 서식(굵게 안의 기울임 등)도 벗긴다
    const next = plain.replace(MD_INLINE, function (all, linkText, url, a, b, c, d) {
      if (linkText !== undefined) return safeLinkUrl(url) ? linkText : all;
      return a !== undefined ? a : (b !== undefined ? b : (c !== undefined ? c : d));
    });
    if (next === plain) break;
    plain = next;
  }
  return Array.from(plain.replace(/\s+/g, ' ').trim()).slice(0, 100).join('');
}
