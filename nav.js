// 지금 시행 중인 약관 버전. terms.html / privacy.html 시행일, DB 함수 current_terms_version() 과 같아야 한다.
const TERMS_VERSION = '2027-01-01';

// 필요할 때만 스크립트를 불러온다
function loadScript(src) {
  return new Promise(function (resolve, reject) {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
}

// 로그인한 사용자가 현재 약관 버전에 동의한 기록이 없으면 재동의 창을 띄운다.
// 확인 자체가 실패하면(네트워크 문제 등) 사용을 막지 않고 조용히 넘어간다.
async function maybeAskTermsConsent(userId) {
  const page = window.location.pathname.split('/').pop();
  if (page === 'terms.html' || page === 'privacy.html') return;
  try {
    const { data, error } = await db
      .from('user_consents')
      .select('terms_version')
      .eq('user_id', userId)
      .eq('terms_version', TERMS_VERSION)
      .limit(1);
    if (error) {
      console.error(error);
      return;
    }
    if (data && data.length > 0) return;
    if (typeof t !== 'function') await loadScript('i18n.js');
    if (typeof showConsentModal !== 'function') await loadScript('consent.js');
    showConsentModal();
  } catch (e) {
    console.error(e);
  }
}

// 회원가입 창 열기: 번역 도우미와 가입 창 스크립트가 없으면 불러온 뒤 연다
async function openSignup() {
  try {
    if (typeof t !== 'function') await loadScript('i18n.js');
    if (typeof showSignupModal !== 'function') await loadScript('signup-modal.js');
    showSignupModal();
  } catch (e) {
    window.location.href = 'login.html';
  }
}

// 로그인 창 열기. next 가 있으면 로그인한 뒤 그 주소로 가고, 없으면 지금 화면을 새로고침한다.
// 로그인 화면(login.html)에서는 창을 또 띄우지 않고 이메일 칸으로 커서만 옮긴다.
async function openLogin(next) {
  if (window.location.pathname.endsWith('login.html')) {
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.focus();
    return;
  }
  try {
    if (typeof t !== 'function') await loadScript('i18n.js');
    if (typeof showLoginModal !== 'function') await loadScript('login-modal.js');
    showLoginModal(next);
  } catch (e) {
    window.location.href = 'login.html';
  }
}

// 창(모달)을 닫을 때 서서히 사라지게 한 뒤 지운다. 기기의 "동작 줄이기" 설정이 켜져 있으면 바로 지운다.
function removeOverlay(overlay, done) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let finished = false;
  function end() {
    if (finished) return;
    finished = true;
    overlay.remove();
    if (done) done();
  }
  if (reduce) {
    end();
    return;
  }
  overlay.classList.add('closing');
  overlay.addEventListener('animationend', end);
  setTimeout(end, 300);
}

// 번역 도우미(t)가 없는 환경에서도 영어 문구로 동작하게 한다
function tt(key, fallback, vars) {
  return typeof t === 'function' ? t(key, vars) : fallback;
}

// ---------- 아이콘 ----------
// 직접 그린 단순한 선 그림(SVG)이다. 글자 이모지와 달리 어떤 기기에서도 모양이 같다.
const NAV_ICONS = {
  search: [['circle', { cx: 11, cy: 11, r: 6.5 }], ['path', { d: 'M16 16l5 5' }]],
  pen: [['path', { d: 'M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z' }], ['path', { d: 'M14.5 6.5l3 3' }]],
  user: [['circle', { cx: 12, cy: 8, r: 4 }], ['path', { d: 'M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7' }]],
  comment: [['path', { d: 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z' }]],
  heart: [['path', { d: 'M12 21C5 16.5 2.5 12.5 2.5 9a5 5 0 0 1 9.5-2.2A5 5 0 0 1 21.5 9c0 3.5-2.5 7.5-9.5 12z' }]],
};

function navIcon(name, size) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const attrs = {
    viewBox: '0 0 24 24',
    width: String(size || 22),
    height: String(size || 22),
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  Object.keys(attrs).forEach(function (k) { svg.setAttribute(k, attrs[k]); });
  NAV_ICONS[name].forEach(function (shape) {
    const el = document.createElementNS(ns, shape[0]);
    Object.keys(shape[1]).forEach(function (k) { el.setAttribute(k, shape[1][k]); });
    svg.append(el);
  });
  return svg;
}

// 아이콘만 있는 링크. 글자가 없으므로 이름표(aria-label)와 말풍선(title)을 꼭 붙인다
function makeIconLink(href, icon, label) {
  const a = document.createElement('a');
  a.className = 'icon-btn';
  a.href = href;
  a.setAttribute('aria-label', label);
  a.title = label;
  a.append(navIcon(icon));
  return a;
}

// ---------- 가운데 검색창: [글 | 닉네임] 선택 + 입력칸 + 돋보기 버튼 ----------
function renderSearch() {
  const h1 = document.querySelector('header h1');
  if (!h1 || document.getElementById('header-search')) return;

  const pageName = window.location.pathname.split('/').pop() || 'index.html';
  const onPeople = pageName === 'people.html';
  const onHome = pageName === 'index.html';

  const form = document.createElement('form');
  form.id = 'header-search';
  form.className = 'header-search';
  form.setAttribute('role', 'search');

  const select = document.createElement('select');
  select.setAttribute('aria-label', tt('search.type_label', 'Search type'));
  [['post', tt('search.type_post', 'Posts')], ['person', tt('search.type_person', 'Nickname')]].forEach(function (o) {
    const opt = document.createElement('option');
    opt.value = o[0];
    opt.textContent = o[1];
    select.append(opt);
  });
  select.value = onPeople ? 'person' : 'post';

  const input = document.createElement('input');
  input.type = 'search';
  input.name = 'q';
  input.maxLength = 50;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', tt('search.label', 'Search'));

  function updatePlaceholder() {
    input.placeholder = select.value === 'person'
      ? tt('people.placeholder', 'Search by nickname')
      : tt('blog.search_ph', 'Search posts');
  }
  updatePlaceholder();
  select.addEventListener('change', updatePlaceholder);

  // 검색 결과 화면에서는 검색어를 입력칸에 다시 채워 둔다
  if (onPeople || onHome) {
    input.value = (new URLSearchParams(window.location.search).get('q') || '').slice(0, 50);
  }

  const button = document.createElement('button');
  button.type = 'submit';
  button.setAttribute('aria-label', tt('search.label', 'Search'));
  button.append(navIcon('search'));

  form.append(select, input, button);

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const person = select.value === 'person';
    const q = input.value.trim().slice(0, person ? 20 : 50);
    const target = person ? 'people.html' : 'index.html';
    window.location.href = target + (q ? '?q=' + encodeURIComponent(q) : '');
  });

  h1.after(form);
}

// ---------- 계정 메뉴: 사람 아이콘을 누르면 펼쳐지는 목록 ----------
function buildAccountMenu(userId, pendingCount) {
  const wrap = document.createElement('div');
  wrap.className = 'account';

  const label = tt('nav.account', 'Account menu');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-btn';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'account-menu');
  button.title = label;
  button.append(navIcon('user'));

  // 받은 팔로우 요청이 있으면 아이콘에 숫자를 붙여 메뉴를 열지 않아도 보이게 한다
  if (pendingCount > 0) {
    const badge = document.createElement('span');
    badge.className = 'count-badge';
    badge.textContent = pendingCount > 9 ? '9+' : String(pendingCount);
    button.append(badge);
  }

  const menu = document.createElement('div');
  menu.id = 'account-menu';
  menu.className = 'account-menu';
  menu.hidden = true;

  function addLink(text, href) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    menu.append(a);
  }

  addLink(tt('nav.myblog', 'My Blog'), 'author.html?id=' + encodeURIComponent(userId));
  if (pendingCount > 0) {
    addLink(tt('nav.requests', 'Requests (' + pendingCount + ')', { n: pendingCount }), 'connections.html?tab=requests');
  }
  addLink(tt('nav.settings', 'Settings'), 'settings.html');

  const logout = document.createElement('button');
  logout.type = 'button';
  logout.textContent = tt('nav.logout', 'Logout');
  logout.addEventListener('click', async function () {
    try { localStorage.removeItem('tidnote_draft'); } catch (e) {}
    await db.auth.signOut();
    window.location.href = 'index.html';
  });
  menu.append(logout);

  function setOpen(open) {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  button.addEventListener('click', function (event) {
    event.stopPropagation();
    setOpen(menu.hidden);
  });
  document.addEventListener('click', function (event) {
    if (!wrap.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      button.focus();
    }
  });

  wrap.append(button, menu);
  return wrap;
}

// ---------- 오른쪽 구역: 글쓰기 아이콘 + (로그인/회원가입 또는 계정 메뉴) ----------
async function renderNav() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  const { data } = await db.auth.getSession();
  const session = data.session;

  nav.innerHTML = '';

  // 글쓰기 아이콘은 로그인 여부와 관계없이 보인다.
  // 로그아웃 상태에서 누르면 로그인 창이 뜨고, 로그인하면 글쓰기 화면으로 간다.
  // (주소를 직접 입력해 들어온 경우는 write.js가 로그인 화면으로 보낸다)
  const writeLink = makeIconLink('write.html', 'pen', tt('nav.write', 'Write'));
  if (!session) {
    writeLink.addEventListener('click', function (event) {
      event.preventDefault();
      openLogin('write.html');
    });
  }
  nav.append(writeLink);

  if (!session) {
    const login = document.createElement('a');
    login.className = 'nav-link';
    login.href = 'login.html';
    login.textContent = tt('nav.login', 'Login');
    login.addEventListener('click', function (event) {
      event.preventDefault();
      openLogin();
    });
    nav.append(login);

    const signup = document.createElement('a');
    signup.className = 'nav-cta';
    signup.href = 'login.html';
    signup.textContent = tt('nav.signup', 'Sign up');
    signup.addEventListener('click', function (event) {
      event.preventDefault();
      openSignup();
    });
    nav.append(signup);
    return;
  }

  maybeAskTermsConsent(session.user.id);

  const { count: pendingCount } = await db
    .from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('following_id', session.user.id)
    .eq('status', 'pending');

  nav.append(buildAccountMenu(session.user.id, pendingCount || 0));
}

renderNav();

function renderFooter() {
  const footer = document.querySelector('footer');
  if (!footer) return;

  const links = document.createElement('p');
  links.className = 'footer-links';

  [
    { text: tt('footer.terms', 'Terms'), href: 'terms.html' },
    { text: tt('footer.privacy', 'Privacy'), href: 'privacy.html' },
    { text: tt('footer.report', 'Report'), href: 'report.html' },
    { text: tt('footer.help', 'Help'), href: 'help.html' },
  ].forEach((item, index) => {
    if (index > 0) links.append(' · ');
    const a = document.createElement('a');
    a.href = item.href;
    a.textContent = item.text;
    links.append(a);
  });

  footer.append(links);

  // 언어 전환 (i18n.js가 있는 페이지에서만)
  if (typeof getLang === 'function' && typeof setLang === 'function') {
    const langLinks = document.createElement('p');
    langLinks.className = 'footer-links';
    [
      { code: 'ko', label: '한국어' },
      { code: 'en', label: 'English' },
    ].forEach(function (item, index) {
      if (index > 0) langLinks.append(' · ');
      if (getLang() === item.code) {
        const current = document.createElement('strong');
        current.textContent = item.label;
        langLinks.append(current);
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'link-button';
      button.textContent = item.label;
      button.addEventListener('click', function () {
        setLang(item.code);
        location.reload();
      });
      langLinks.append(button);
    });
    footer.append(langLinks);
  }
}

renderFooter();

function renderBrand() {
  const h1 = document.querySelector('header h1');
  if (!h1) return;

  const link = document.createElement('a');
  link.href = 'index.html';
  link.className = 'brand';

  const img = document.createElement('img');
  img.src = 'logo-96.png';
  img.alt = '';
  img.width = 36;
  img.height = 36;

  const name = document.createElement('span');
  name.textContent = 'Tidnote';

  link.append(img, name);
  h1.textContent = '';
  h1.append(link);
}

renderBrand();
renderSearch();
