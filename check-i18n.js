// 번역 키 점검 도구. 사용법: node check-i18n.js
// (웹사이트에는 쓰이지 않는 개발용 파일입니다. HTML에서 불러오지 마세요.)
const fs = require('fs');

const src = fs.readFileSync('i18n.js', 'utf8');
global.localStorage = { getItem() { return null; }, setItem() {} };
global.navigator = { language: 'en' };
global.document = {
  documentElement: {},
  querySelectorAll() { return []; },
  addEventListener() {},
};
const I18N = eval(src + '; I18N');

let problems = 0;
function report(title, list) {
  if (list.length === 0) return;
  problems += list.length;
  console.log('\n[문제] ' + title);
  list.forEach(function (x) { console.log('  - ' + x); });
}

// 1) 키가 ko/en에 정확히 한 번씩 있는가 (중복·누락)
const counts = {};
(src.match(/^\s*'[a-zA-Z0-9_.]+':/gm) || []).forEach(function (line) {
  const key = line.match(/'([^']+)'/)[1];
  counts[key] = (counts[key] || 0) + 1;
});
report('ko/en에 정확히 한 번씩 있어야 하는데 아닌 키',
  Object.keys(counts).filter(function (k) { return counts[k] !== 2; })
    .map(function (k) { return k + ' (' + counts[k] + '번)'; }));

const ko = Object.keys(I18N.ko);
const en = Object.keys(I18N.en);
report('영어에만 없는 키(ko에는 있음)', ko.filter(function (k) { return en.indexOf(k) === -1; }));
report('한국어에만 없는 키(en에는 있음)', en.filter(function (k) { return ko.indexOf(k) === -1; }));

// 2) 화면 코드에서 쓰는데 사전에 없는 키
const used = {};
fs.readdirSync('.').filter(function (f) {
  return /\.(js|html)$/.test(f) && f !== 'i18n.js' && f !== 'check-i18n.js';
}).forEach(function (f) {
  const s = fs.readFileSync(f, 'utf8');
  const patterns = [
    /\bt\('([a-zA-Z0-9_.]+)'/g,
    /\btt\('([a-zA-Z0-9_.]+)'/g,
    /data-i18n(?:-[a-z-]+)?="([a-zA-Z0-9_.]+)"/g,
  ];
  patterns.forEach(function (re) {
    let m;
    while ((m = re.exec(s)) !== null) {
      const key = m[1];
      if (/[_.]$/.test(key)) continue; // t('conn.empty_' + tab) 같은 조합 키는 건너뜀
      (used[key] = used[key] || []).push(f);
    }
  });
});
report('코드에서 쓰는데 사전에 없는 키',
  Object.keys(used).filter(function (k) { return !(k in I18N.ko) || !(k in I18N.en); })
    .map(function (k) { return k + '  ← ' + used[k].filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', '); }));

// 3) 약관·개인정보·신고·도움말: 영어/한국어 본문의 구조가 같은가
(function () {
  const pages = ['terms.html', 'privacy.html', 'report.html', 'help.html'];
  function block(html, lang) {
    const start = html.indexOf('<div data-lang="' + lang + '"');
    if (start === -1) return null;
    // 같은 깊이의 </div> 까지 잘라낸다
    let depth = 0, i = start;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = start;
    let m;
    while ((m = re.exec(html)) !== null) {
      depth += m[0] === '</div>' ? -1 : 1;
      if (depth === 0) { i = m.index + 6; break; }
    }
    return html.slice(start, i);
  }
  function count(s, re) { return (s.match(re) || []).length; }
  function links(s) {
    return (s.match(/href="[^"]+"/g) || []).sort().join(' ');
  }
  const list = [];
  pages.forEach(function (f) {
    const html = fs.readFileSync(f, 'utf8');
    const en = block(html, 'en');
    const kb = block(html, 'ko');
    if (!en || !kb) { list.push(f + ': en/ko 블록이 없음'); return; }
    ['<h2', '<h3', '<ul', '<li', '<p'].forEach(function (tag) {
      const a = count(en, new RegExp(tag + '[ >]', 'g'));
      const b = count(kb, new RegExp(tag + '[ >]', 'g'));
      // 한국어 초안 안내 상자(<p class="notice">)는 한국어에만 있으므로 제외
      const bb = tag === '<p' ? b - count(kb, /<p class="notice"/g) : b;
      const aa = tag === '<p' ? a - count(en, /<p class="notice"/g) : a;
      if (aa !== bb) list.push(f + ': ' + tag + ' 개수가 다름 (en ' + aa + ' / ko ' + bb + ')');
    });
    if (links(en) !== links(kb)) list.push(f + ': 링크(href)가 서로 다름');
    if (/Tidnote\.contact@gmail\.com/.test(en) !== /Tidnote\.contact@gmail\.com/.test(kb)) {
      list.push(f + ': 연락처 이메일이 한쪽에만 있음');
    }
    if (/<\/?div/.test(html.replace(en, '').replace(kb, '').replace(/<div data-lang[^>]*>/g, '')) &&
        count(html, /<div\b/g) !== count(html, /<\/div>/g)) {
      list.push(f + ': <div> 여는 태그와 닫는 태그 수가 다름');
    }
  });
  // 시행일 = 약관 버전
  const tv = (fs.readFileSync('nav.js', 'utf8').match(/TERMS_VERSION\s*=\s*'([^']+)'/) || [])[1];
  ['terms.html', 'privacy.html'].forEach(function (f) {
    const html = fs.readFileSync(f, 'utf8');
    const dates = html.match(/(Effective date|시행일): ([0-9-]+)/g) || [];
    if (dates.length !== 2) list.push(f + ': 시행일 표기가 2개(en/ko)가 아님');
    dates.forEach(function (d) {
      if (d.slice(-10) !== tv) list.push(f + ': 시행일(' + d + ')이 TERMS_VERSION(' + tv + ')과 다름');
    });
  });
  // 조치 공지 목록(en/ko)의 항목 수
  const r = fs.readFileSync('report.html', 'utf8');
  const n1 = (r.match(/<ul id="notices">([\s\S]*?)<\/ul>/) || [])[1] || '';
  const n2 = (r.match(/<ul id="notices-ko">([\s\S]*?)<\/ul>/) || [])[1] || '';
  if (count(n1, /<li>/g) !== count(n2, /<li>/g)) list.push('report.html: 조치 공지 목록의 영어/한국어 항목 수가 다름');
  report('약관·개인정보·신고·도움말 영어/한국어 불일치', list);
})();

// 4) 번역하지 않은 하드코딩 문구 탐지 (JS)
(function () {
  const allow = ['Tidnote'];
  const list = [];
  fs.readdirSync('.').filter(function (f) {
    return /\.js$/.test(f) && f !== 'i18n.js' && f !== 'check-i18n.js';
  }).forEach(function (f) {
    fs.readFileSync(f, 'utf8').split('\n').forEach(function (line, i) {
      const re = /(?:textContent|innerText|placeholder)\s*=\s*(['"`])([^'"`]*)\1|\b(?:alert|confirm)\(\s*(['"`])([^'"`]*)\3/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const text = m[2] !== undefined ? m[2] : m[4];
        if (!/[A-Za-z가-힣]{2,}/.test(text)) continue;
        if (allow.indexOf(text.trim()) !== -1) continue;
        list.push(f + ':' + (i + 1) + '  ' + line.trim());
      }
    });
  });
  report('번역하지 않고 직접 쓴 문구(JS)', list);
})();

// 5) HTML: 제목(<title>)과 화면 문구에 data-i18n 이 빠진 곳
(function () {
  const legal = ['terms.html', 'privacy.html', 'report.html', 'help.html'];
  const titleFree = ['index.html', 'post.html', 'author.html']; // 제목이 고정이거나 JS가 정함
  const allow = ['Tidnote', '한국어', 'English'];
  const list = [];
  fs.readdirSync('.').filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
    const html = fs.readFileSync(f, 'utf8');
    if (titleFree.indexOf(f) === -1 && !/<title data-i18n="[^"]+"/.test(html)) {
      list.push(f + ': <title> 에 data-i18n 이 없음');
    }
    if (legal.indexOf(f) !== -1) return;
    const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    const re = /<(h[1-6]|p|button|label|a|span|li|option|strong|th|td|legend|summary)\b([^>]*)>([^<]*)</g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const text = m[3].trim();
      if (!/[A-Za-z가-힣]{2,}/.test(text)) continue;
      if (allow.indexOf(text) !== -1) continue;
      if (/data-i18n/.test(m[2])) continue;
      list.push(f + ': <' + m[1] + '> ' + text.slice(0, 40));
    }
  });
  report('번역 표시(data-i18n)가 없는 HTML 문구', list);
})();

console.log('\nko ' + ko.length + '개 / en ' + en.length + '개');
console.log(problems === 0 ? '문제 없음' : '문제 ' + problems + '건');
process.exit(problems === 0 ? 0 : 1);