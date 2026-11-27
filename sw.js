// 76일차: 홈 화면 설치(PWA)용 서비스 워커.
// 일부러 사이트 파일을 저장(캐시)하지 않는다. 저장하면 새로 배포해도 옛 화면이 보일 수 있기 때문이다.
// 하는 일은 하나: 인터넷이 끊겼을 때 화면 이동을 하면 "오프라인" 안내를 보여 준다.
// Supabase 등 다른 주소로 가는 요청과 화면 이동이 아닌 요청은 건드리지 않는다.

const OFFLINE_HTML = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
  '<meta name="theme-color" content="#f3e7cc"><title>Tidnote</title>' +
  '<style>body{margin:0;font-family:sans-serif;background:#faf6ec;color:#1f3552;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px;box-sizing:border-box}' +
  'h1{font-size:24px;margin:0 0 12px}p{margin:6px 0;line-height:1.6;color:#595959}button{margin-top:16px;min-height:44px;padding:8px 20px;border:none;border-radius:8px;background:#1f3552;color:#fff;font:inherit;cursor:pointer}</style>' +
  '</head><body><main><h1>Tidnote</h1>' +
  '<p>인터넷에 연결되어 있지 않아요. 연결을 확인한 뒤 다시 시도해 주세요.</p>' +
  '<p lang="en">You\'re offline. Check your connection and try again.</p>' +
  '<button type="button" onclick="location.reload()">다시 시도 · Retry</button></main></body></html>';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.mode !== 'navigate') return; // 화면 이동만 다룬다(사진·스크립트·API 요청은 그대로)
  event.respondWith(
    fetch(req).catch(function () {
      return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    })
  );
});
