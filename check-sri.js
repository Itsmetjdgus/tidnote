// 모든 HTML 페이지가 supabase-js 를 "정확한 버전 + 무결성(integrity) + crossorigin" 이 같은 한 줄로 불러오는지 점검합니다.
// 사용법: node check-sri.js   (저장소 폴더에서. 인터넷 없이 동작합니다. 새 페이지를 만들 때마다 실행하세요.)
const fs = require('fs');

const TAG = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@(\d+\.\d+\.\d+)" integrity="sha384-[A-Za-z0-9+\/]{64}" crossorigin="anonymous"><\/script>/;

const problems = [];
const tags = {};
let pages = 0;

fs.readdirSync('.').filter(function (f) { return f.endsWith('.html'); }).forEach(function (file) {
  const text = fs.readFileSync(file, 'utf8');
  const usesSupabase = text.indexOf('src="supabase.js"') !== -1;
  const hasCdn = text.indexOf('cdn.jsdelivr.net') !== -1;
  if (!usesSupabase && !hasCdn) return;
  pages++;
  const m = text.match(TAG);
  if (!m) {
    problems.push(file + ': supabase-js 줄이 없거나 버전 고정(@x.y.z)·integrity·crossorigin 중 빠진 것이 있습니다');
    return;
  }
  tags[m[0]] = (tags[m[0]] || []).concat(file);
  const extra = text.split('cdn.jsdelivr.net').length - 1;
  if (extra !== 1) problems.push(file + ': cdn.jsdelivr.net 를 쓰는 곳이 ' + extra + '곳입니다(1곳이어야 함)');
});

if (Object.keys(tags).length > 1) {
  problems.push('페이지마다 supabase-js 줄이 서로 다릅니다: ' + Object.keys(tags).map(function (k) { return tags[k].join(',') + ' → ' + k.slice(0, 90); }).join(' | '));
}

if (problems.length) {
  problems.forEach(function (p) { console.log('문제: ' + p); });
  process.exit(1);
}
const only = Object.keys(tags)[0];
console.log('SRI 점검: ' + pages + '개 페이지가 모두 같은 줄을 씁니다 (supabase-js ' + only.match(/@(\d+\.\d+\.\d+)"/)[1] + ')');
console.log('문제 없음');
