// 76일차: 설정 > 정보 > 홈 화면에 추가. 크롬(안드로이드·PC)은 단추로 바로 설치, 아이폰은 안내만 한다.
(function () {
  const btn = document.getElementById('install-btn');
  const done = document.getElementById('install-done');
  if (!btn) return;
  let deferred = null;

  const installed = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (installed) {
    done.hidden = false;
    if (typeof setSettingValue === 'function') setSettingValue('install', t('install.value_done'));
    return;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // 브라우저가 스스로 띄우는 안내 대신 이 단추로
    deferred = e;
    btn.hidden = false;
  });

  btn.addEventListener('click', async function () {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    btn.hidden = true;
    if (choice && choice.outcome === 'accepted') done.hidden = false;
  });

  window.addEventListener('appinstalled', function () {
    btn.hidden = true;
    done.hidden = false;
  });
})();
