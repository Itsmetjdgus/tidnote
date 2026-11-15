// 설정 > 언어. 선택하면 저장하고 화면을 새로 불러온다.
(function () {
  const radios = document.querySelectorAll('input[name="lang"]');
  if (!radios.length) return;

  const current = getLang();
  radios.forEach(function (radio) {
    radio.checked = radio.value === current;
    radio.addEventListener('change', function () {
      if (!radio.checked || radio.value === getLang()) return;
      setLang(radio.value);
      location.reload(); // 주소의 ?tab=language가 유지되어 같은 탭으로 돌아온다
    });
  });
})();