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
};

function navIcon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const attrs = {
    viewBox: '0 0 24 24',
    width: '22',
    height: '22',
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

  // 글쓰기 아이콘은 로그인 여부와 관계없이 보인다. (로그아웃 상태에서는 write.js가 로그인 화면으로 보낸다)
  nav.append(makeIconLink('write.html', 'pen', tt('nav.write', 'Write')));

  if (!session) {
    const login = document.createElement('a');
    login.className = 'nav-link';
    login.href = 'login.html';
    login.textContent = tt('nav.login', 'Login');
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
