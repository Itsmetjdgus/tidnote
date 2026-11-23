// 58일차: 게시물 오른쪽 위 "⋯" 메뉴 (글 화면과 홈 카드에서 같이 쓴다)
// 내 글: 수정 · 삭제 · 링크 복사
// 남의 글(로그인): 이 게시물 안 보기 · 신고 · ○○님 차단 · 작성자 프로필 · 링크 복사
// 로그아웃: 신고(로그인 창) · 작성자 프로필 · 링크 복사
// PC에서는 버튼 아래로 펼쳐지는 목록, 폰(폭 600px 이하)에서는 화면 아래에서 올라오는 시트로 보인다.

const POST_MENU_DOTS = [['circle', { cx: 5, cy: 12, r: 1.6 }], ['circle', { cx: 12, cy: 12, r: 1.6 }], ['circle', { cx: 19, cy: 12, r: 1.6 }]];

function postUrl(id) {
  return new URL('post.html?id=' + id, window.location.href).href;
}

// 화면 아래에 잠깐 뜨는 안내(되돌리기 같은 단추를 함께 넣을 수 있다)
function showToast(text, action) {
  let box = document.getElementById('toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    box.className = 'toast';
    box.setAttribute('role', 'status');
    document.body.append(box);
  }
  box.innerHTML = '';
  box.append(text);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'link-button';
    b.textContent = action.label;
    b.addEventListener('click', function () {
      box.hidden = true;
      action.onClick();
    });
    box.append(' ', b);
  }
  box.hidden = false;
  clearTimeout(box._timer);
  box._timer = setTimeout(function () { box.hidden = true; }, action ? 6000 : 3000);
}

async function copyPostLink(id) {
  const url = postUrl(id);
  try {
    await navigator.clipboard.writeText(url);
    showToast(t('menu.copied'));
  } catch (e) {
    // 클립보드를 못 쓰는 브라우저: 주소를 보여 주고 직접 복사하게 한다
    window.prompt(t('menu.copy_failed'), url);
  }
}

async function hidePost(id) {
  const { error } = await db.from('hidden_posts').insert({ post_id: id });
  return !error || error.code === '23505'; // 이미 숨긴 글이면 성공으로 본다
}

async function unhidePost(id) {
  const { error } = await db.from('hidden_posts').delete().eq('post_id', id);
  return !error;
}

async function isPostHidden(id) {
  const { data, error } = await db.from('hidden_posts').select('post_id').eq('post_id', id).limit(1);
  return !error && !!data && data.length > 0;
}

// 글 삭제: 글을 지운 뒤 그 글의 사진 파일도 지운다. 사진 목록을 모르면 먼저 읽어 온다
async function deletePostWithPhotos(post) {
  let photos = Array.isArray(post.images) ? post.images.slice() : null;
  if (!photos) {
    const { data } = await db.from('posts').select('images, image_path').eq('id', post.id).maybeSingle();
    photos = data && Array.isArray(data.images) ? data.images.slice() : [];
    if (data && data.image_path && photos.indexOf(data.image_path) === -1) photos.push(data.image_path);
  } else if (post.image_path && photos.indexOf(post.image_path) === -1) {
    photos.push(post.image_path);
  }

  const { data: deleted, error } = await db.from('posts').delete().eq('id', post.id).select('id');
  if (error || !deleted || deleted.length === 0) return false;
  if (photos.length > 0) await db.storage.from('post-images').remove(photos);
  return true;
}

// 신고 창: report.js의 신고 양식을 창 안에 바로 펼쳐서 보여 준다
function openReportDialog(targetType, targetId) {
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'modal report-modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'report-modal-title');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', t('common.close'));

  const title = document.createElement('h2');
  title.id = 'report-modal-title';
  title.textContent = t('menu.report_title');

  const control = createReportControl(targetType, targetId, { open: true });
  dialog.append(closeBtn, title, control);
  overlay.append(dialog);

  function close() {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    removeOverlay(overlay, function () {
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    });
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key !== 'Tab') return;
    const items = Array.from(dialog.querySelectorAll('button, select, textarea, a[href]')).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
    if (!items.length) return;
    if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items[items.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === items[items.length - 1]) { e.preventDefault(); items[0].focus(); }
  }
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  const first = dialog.querySelector('select');
  if (first) first.focus();
}

// 메뉴 단추와 목록을 만든다.
// post: { id, author_id, nickname, images?, image_path? }
// opts: { session, onDeleted(), onHidden(), detail: 글 화면이면 true }
function createPostMenu(post, opts) {
  const session = opts.session;
  const isOwner = !!session && session.user.id === post.author_id;

  const wrap = document.createElement('div');
  wrap.className = 'post-menu';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-btn post-menu-btn';
  button.setAttribute('aria-label', t('menu.more'));
  button.title = t('menu.more');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  POST_MENU_DOTS.forEach(function (shape) {
    const el = document.createElementNS(ns, shape[0]);
    Object.keys(shape[1]).forEach(function (k) { el.setAttribute(k, shape[1][k]); });
    svg.append(el);
  });
  button.append(svg);

  const backdrop = document.createElement('div');
  backdrop.className = 'post-menu-backdrop';
  backdrop.hidden = true;

  const list = document.createElement('div');
  list.className = 'post-menu-list';
  list.setAttribute('role', 'menu');
  list.hidden = true;

  function item(label, onClick, danger) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.textContent = label;
    if (danger) b.className = 'danger-text';
    b.addEventListener('click', function () {
      close(false);
      onClick();
    });
    list.append(b);
    return b;
  }

  let built = false;
  async function build() {
    if (built) return;
    built = true;
    if (isOwner) {
      item(t('post.edit'), function () { window.location.href = 'write.html?id=' + post.id; });
      item(t('post.delete'), async function () {
        if (!confirm(t('post.confirm_delete'))) return;
        const ok = await deletePostWithPhotos(post);
        if (!ok) {
          alert(t('post.delete_failed'));
          return;
        }
        if (opts.onDeleted) opts.onDeleted();
      }, true);
    } else if (session) {
      // 글 화면에서는 이미 숨긴 글이면 "다시 보기"를 보여 준다
      const hidden = opts.detail ? await isPostHidden(post.id) : false;
      if (hidden) {
        item(t('menu.unhide'), async function () {
          if (await unhidePost(post.id)) showToast(t('menu.unhidden'));
          else showToast(t('menu.hide_failed'));
        });
      } else {
        item(t('menu.hide'), async function () {
          if (!(await hidePost(post.id))) {
            showToast(t('menu.hide_failed'));
            return;
          }
          if (opts.onHidden) opts.onHidden();
          showToast(t('menu.hidden'), {
            label: t('menu.undo'),
            onClick: async function () {
              if (await unhidePost(post.id)) {
                if (opts.onUnhidden) opts.onUnhidden();
              }
            },
          });
        });
      }
      item(t('menu.report'), function () { openReportDialog('post', post.id); }, true);
      if (post.author_id && typeof blockUser === 'function') {
        item(t('menu.block', { name: post.nickname || '' }), async function () {
          if (!confirm(t('block.confirm_block', { name: post.nickname || '' }))) return;
          if (await blockUser(post.author_id)) location.reload();
          else showToast(t('block.error'));
        }, true);
      }
    } else {
      item(t('menu.report'), function () { openLogin(); }, true);
    }
    if (!isOwner && post.author_id) {
      item(t('menu.profile'), function () { window.location.href = 'author.html?id=' + post.author_id; });
    }
    item(t('menu.copy_link'), function () { copyPostLink(post.id); });
    const cancel = item(t('menu.cancel'), function () {});
    cancel.classList.add('post-menu-cancel');
  }

  function onDocClick(e) {
    if (!wrap.contains(e.target)) close(false);
  }
  function onKey(e) {
    const items = Array.from(list.querySelectorAll('[role="menuitem"]')).filter(function (el) { return el.offsetParent !== null; });
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  }

  async function open() {
    await build();
    list.hidden = false;
    backdrop.hidden = false;
    wrap.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
    const first = list.querySelector('[role="menuitem"]');
    if (first) first.focus();
  }

  function close(returnFocus) {
    list.hidden = true;
    backdrop.hidden = true;
    wrap.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey);
    if (returnFocus) button.focus();
  }

  button.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (list.hidden) open();
    else close(true);
  });
  backdrop.addEventListener('click', function () { close(true); });

  wrap.append(button, backdrop, list);
  return wrap;
}

// 홈 카드에 메뉴 붙이기: renderPostCard가 남긴 data-* 값을 읽는다
function attachPostMenus(container, session) {
  container.querySelectorAll('article.post[data-post-id]').forEach(function (card) {
    if (card.querySelector('.post-menu')) return;
    const post = {
      id: Number(card.dataset.postId),
      author_id: card.dataset.authorId || null,
      nickname: card.dataset.nickname || '',
    };
    card.append(createPostMenu(post, {
      session: session,
      onDeleted: function () { card.remove(); showToast(t('menu.deleted')); },
      onHidden: function () { card.hidden = true; },
      onUnhidden: function () { card.hidden = false; },
    }));
  });
}
