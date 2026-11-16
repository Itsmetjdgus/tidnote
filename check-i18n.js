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
    /data-i18n="([a-zA-Z0-9_.]+)"/g,
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

console.log('\nko ' + ko.length + '개 / en ' + en.length + '개');
console.log(problems === 0 ? '문제 없음' : '문제 ' + problems + '건');
process.exit(problems === 0 ? 0 : 1);