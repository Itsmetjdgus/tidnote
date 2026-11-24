// 67일차: 설정 화면을 단계별로 나눈다(인스타그램처럼).
//   1단계 settings.html              → 분류 목록(계정·개인정보 보호·내 활동·보안·정보)
//   2단계 settings.html?tab=account  → 그 분류의 항목 목록(닉네임, 언어 ...), 지금 값도 함께 보임
//   3단계 settings.html?tab=account&item=nickname → 그 항목 하나만 있는 화면 + "‹ 계정" 뒤로 가기
// PC에서는 왼쪽 분류 목록이 늘 보이고, 폰에서는 한 단계씩 화면이 바뀐다.

// 분류별 항목. href 가 있는 것은 다른 페이지로 가는 줄(약관 등), 없으면 settings-item 화면
const SETTINGS_TREE = {
  account: [
    { item: 'nickname', title: 'settings.nickname_title' },
    { item: 'language', title: 'settings.lang_title' },
  ],
  privacy: [
    { item: 'visibility', title: 'settings.privacy_title' },
    { item: 'comments', title: 'cscope.title' },
    { item: 'blocked', title: 'block.list_title' },
  ],
  activity: [
    { item: 'liked', title: 'activity.liked_title' },
    { item: 'hidden', title: 'activity.hidden_title' },
    { item: 'export', title: 'export.title' },
  ],
  security: [
    { item: 'password', title: 'pw.title' },
    { item: 'sessions', title: 'sessions.title' },
    { item: 'delete', title: 'settings.delete_title', danger: true },
  ],
  about: [
    { item: 'feedback', title: 'fb.title' },
    { item: 'contact', title: 'settings.about_contact' },
    { href: 'help.html', title: 'settings.about_help' },
    { href: 'report.html', title: 'settings.about_report' },
    { href: 'terms.html', title: 'settings.about_terms' },
    { href: 'privacy.html', title: 'settings.about_privacy' },
  ],
};
const SETTINGS_TAB_TITLE = {
  account: 'settings.menu_account',
  privacy: 'settings.menu_privacy',
  activity: 'activity.menu',
  security: 'settings.menu_security',
  about: 'settings.menu_about',
};

// 다른 스크립트가 항목 줄 오른쪽에 "지금 값"을 보여 줄 때 부른다. 예: setSettingValue('nickname', 'tester')
const settingValues = {};
function setSettingValue(item, text) {
  settingValues[item] = text;
  document.querySelectorAll('[data-value-for="' + item + '"]').forEach(function (el) { el.textContent = text || ''; });
}

// 지금 보이는 항목 화면 이름(activity.js 등이 "이 화면이 열렸을 때만 불러오기"에 쓴다)
let currentSettingItem = null;
function onSettingItemShown(item, fn) {
  if (currentSettingItem === item) fn();
}

(function () {
  const params = new URLSearchParams(window.location.search);
  let tab = params.get('tab');
  if (!SETTINGS_TREE[tab]) tab = null;
  let item = params.get('item');
  if (tab && !SETTINGS_TREE[tab].some(function (e) { return e.item === item; })) item = null;
  // 예전 주소 호환: settings.html?tab=privacy 처럼 들어와도 항목 목록이 보인다
  currentSettingItem = item;

  const layout = document.querySelector('.settings-layout');
  const heading = document.querySelector('main > h2');
  layout.dataset.level = item ? 'item' : tab ? 'list' : 'root';
  // PC에서는 분류를 고르지 않았으면 첫 분류(계정)를 보여 준다. 폰(1단계)에서는 분류 목록만 보인다
  const shownTab = tab || 'account';

  document.querySelectorAll('.settings-menu a').forEach(function (a) {
    const on = a.dataset.tab === shownTab;
    a.classList.toggle('active', on);
    if (on && tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  Object.keys(SETTINGS_TREE).forEach(function (name) {
    const panel = document.getElementById('tab-' + name);
    panel.hidden = name !== shownTab;
    if (name !== shownTab) return;

    // 2단계: 항목 목록
    const list = document.createElement('div');
    list.className = 'settings-list';
    const title = document.createElement('h3');
    title.className = 'settings-list-title';
    title.textContent = t(SETTINGS_TAB_TITLE[name]);
    const back = makeBack('settings.html', t('settings.title'));
    back.classList.add('settings-back-root');
    list.append(back, title);

    const ul = document.createElement('ul');
    ul.className = 'settings-rows';
    SETTINGS_TREE[name].forEach(function (entry) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'settings-row' + (entry.danger ? ' danger-row' : '');
      a.href = entry.href || 'settings.html?tab=' + name + '&item=' + entry.item;
      const label = document.createElement('span');
      label.className = 'settings-row-label';
      label.textContent = t(entry.title);
      const value = document.createElement('span');
      value.className = 'settings-row-value';
      if (entry.item) {
        value.dataset.valueFor = entry.item;
        value.textContent = settingValues[entry.item] || '';
      }
      const chevron = document.createElement('span');
      chevron.className = 'settings-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '›';
      a.append(label, value, chevron);
      li.append(a);
      ul.append(li);
    });
    list.append(ul);
    panel.prepend(list);
    list.hidden = !!item;

    // 3단계: 항목 하나만
    panel.querySelectorAll('.settings-item').forEach(function (el) {
      const on = el.dataset.item === item;
      el.hidden = !on;
      if (on) {
        el.prepend(makeBack('settings.html?tab=' + name, t(SETTINGS_TAB_TITLE[name])));
        const entry = SETTINGS_TREE[name].filter(function (e) { return e.item === item; })[0];
        if (entry) document.title = t(entry.title) + ' - Tidnote';
      }
    });
  });

  function makeBack(href, label) {
    const a = document.createElement('a');
    a.className = 'settings-back';
    a.href = href;
    a.textContent = '‹ ' + label;
    return a;
  }

  // 언어는 이 화면에서 바로 알 수 있다
  if (typeof getLang === 'function') setSettingValue('language', getLang() === 'en' ? 'English' : '한국어');
  if (heading && layout.dataset.level !== 'root') heading.classList.add('settings-heading-sub');
})();
