(async function () {
  const section = document.getElementById('comments');
  const postId = Number(new URLSearchParams(window.location.search).get('id'));
  if (!section || !postId) return;

  const { data: sessionData } = await db.auth.getSession();
  const me = sessionData.session ? sessionData.session.user.id : null;

  const { data: post } = await db
    .from('posts')
    .select('author_id')
    .eq('id', postId)
    .maybeSingle();

  if (!post) return;

  const heading = document.createElement('h3');
  const list = document.createElement('div');
  section.append(heading, list);

  async function loadComments() {
    const { data, error } = await db
      .from('comments')
      .select('id, content, author_id, created_at, profiles(nickname, avatar_path)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    list.innerHTML = '';

    if (error) {
      list.textContent = t('comments.load_failed');
      return;
    }

    heading.textContent = t('comments.heading', { n: data.length });

    if (data.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'state-message';
      empty.textContent = t('comments.empty');
      list.append(empty);
      return;
    }

    // 69일차: 내가 숨긴 댓글은 접어 두고 "숨긴 댓글 N개 · 보기"로 펼칠 수 있게
    hiddenIds = {};
    if (me) {
      const { data: hid } = await db.from('hidden_comments').select('comment_id').in('comment_id', data.map(function (c) { return c.id; }));
      (hid || []).forEach(function (h) { hiddenIds[h.comment_id] = true; });
    }
    const hiddenBoxes = [];
    data.forEach(function (comment) {
      const box = renderComment(comment);
      if (hiddenIds[comment.id]) {
        box.hidden = true;
        box.classList.add('comment-hidden');
        hiddenBoxes.push(box);
      }
      list.append(box);
    });
    if (hiddenBoxes.length) {
      const bar = document.createElement('p');
      bar.className = 'state-message comment-hidden-bar';
      bar.append(t('cmenu.hidden_count', { n: hiddenBoxes.length }) + ' · ');
      const show = document.createElement('button');
      show.type = 'button';
      show.className = 'link-button';
      show.textContent = t('cmenu.show_hidden');
      show.addEventListener('click', function () {
        hiddenBoxes.forEach(function (b) { b.hidden = false; });
        bar.remove();
      });
      bar.append(show);
      list.append(bar);
    }
  }

  let hiddenIds = {};

  function shortTime(at) {
    return new Date(at).toLocaleString(dateLocale(), { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // 댓글 한 줄: [프로필 사진] 닉네임 · 시각 / 내용 / 오른쪽 ⋯ 메뉴 (69일차)
  function renderComment(comment) {
    const box = document.createElement('div');
    box.className = 'comment';
    const name = comment.profiles ? comment.profiles.nickname : t('comments.unknown');

    const who = document.createElement('a');
    who.className = 'comment-avatar';
    who.href = 'author.html?id=' + comment.author_id;
    who.setAttribute('aria-label', name);
    if (typeof createAvatar === 'function') who.append(createAvatar(name, comment.profiles ? comment.profiles.avatar_path : null, true));

    const main = document.createElement('div');
    main.className = 'comment-main';
    const meta = document.createElement('p');
    meta.className = 'comment-meta';
    const authorLink = document.createElement('a');
    authorLink.className = 'comment-name';
    authorLink.href = 'author.html?id=' + comment.author_id;
    authorLink.textContent = name;
    if (comment.author_id === post.author_id) {
      const tag = document.createElement('span');
      tag.className = 'comment-badge';
      tag.textContent = t('cmenu.author_badge');
      authorLink.append(' ', tag);
    }
    const when = document.createElement('span');
    when.className = 'comment-when';
    when.textContent = shortTime(comment.created_at);
    meta.append(authorLink, when);

    const body = document.createElement('p');
    body.className = 'post-content comment-text';
    body.textContent = comment.content;
    main.append(meta, body);

    box.append(who, main);
    if (typeof createDotsMenu === 'function') box.append(commentMenu(comment, name, box));
    return box;
  }

  // 댓글 ⋯ 메뉴: 삭제는 댓글 쓴 사람과 글쓴이만(DB 규칙과 같음)
  function commentMenu(comment, name, box) {
    const mine = me && me === comment.author_id;
    const canDelete = me && (mine || me === post.author_id);
    return createDotsMenu(async function (item) {
      if (canDelete) {
        item(t('comments.delete'), async function () {
          if (!confirm(t('comments.confirm_delete'))) return;
          const { data: deleted, error: deleteError } = await db.from('comments').delete().eq('id', comment.id).select('id');
          if (deleteError || !deleted || deleted.length === 0) {
            alert(t('comments.delete_failed'));
            return;
          }
          showToast(t('cmenu.deleted'));
          loadComments();
        }, true);
      }
      if (me && !mine) {
        if (hiddenIds[comment.id]) {
          item(t('cmenu.unhide'), async function () {
            const { error } = await db.from('hidden_comments').delete().eq('comment_id', comment.id);
            if (error) return showToast(t('menu.hide_failed'));
            showToast(t('cmenu.unhidden'));
            loadComments();
          });
        } else {
          item(t('cmenu.hide'), async function () {
            const { error } = await db.from('hidden_comments').insert({ comment_id: comment.id });
            if (error && error.code !== '23505') return showToast(t('menu.hide_failed'));
            hiddenIds[comment.id] = true;
            box.hidden = true;
            showToast(t('cmenu.hidden'), {
              label: t('menu.undo'),
              onClick: async function () {
                const { error: undoError } = await db.from('hidden_comments').delete().eq('comment_id', comment.id);
                if (!undoError) loadComments();
              },
            });
          });
        }
        item(t('menu.report'), function () { openReportDialog('comment', comment.id); }, true);
        if (typeof blockUser === 'function') {
          item(t('menu.block', { name: name }), async function () {
            if (!confirm(t('block.confirm_block', { name: name }))) return;
            if (await blockUser(comment.author_id)) location.reload();
            else showToast(t('block.error'));
          }, true);
        }
      } else if (!me) {
        item(t('menu.report'), function () { openLogin(); }, true);
      }
      if (!mine) {
        item(t('cmenu.profile'), function () { window.location.href = 'author.html?id=' + comment.author_id; });
      }
      item(t('cmenu.copy'), async function () {
        try {
          await navigator.clipboard.writeText(comment.content);
          showToast(t('cmenu.copied'));
        } catch (e) {
          window.prompt(t('menu.copy_failed'), comment.content);
        }
      });
    }, 'comment-menu', t('cmenu.more'));
  }

  // 65일차: 글쓴이의 댓글 허용 범위. 막혀 있으면 입력칸 대신 안내를 보여 준다(실제로 막는 일은 DB 규칙)
  let blockedReason = null;
  if (me && me !== post.author_id) {
    try {
      const { data: allowed, error: rpcError } = await db.rpc('can_comment_on', { p_post: postId });
      if (!rpcError && allowed === false) {
        const { data: author } = await db.from('profiles').select('comment_scope').eq('id', post.author_id).maybeSingle();
        blockedReason = author && author.comment_scope === 'followers' ? t('cscope.closed_followers') : t('cscope.closed_off');
      }
    } catch (e) {}
  }

  if (me && blockedReason) {
    const closed = document.createElement('p');
    closed.className = 'state-message comment-closed';
    closed.textContent = blockedReason;
    section.append(closed);
  } else if (me) {
    const form = document.createElement('form');
    form.className = 'write-form comment-form';

    const textarea = document.createElement('textarea');
    textarea.rows = 3;
    textarea.maxLength = 1000;
    textarea.placeholder = t('comments.placeholder');

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t('comments.post_btn');

    const message = document.createElement('p');
    message.className = 'form-message';
    message.setAttribute('role', 'status');

    button.addEventListener('click', async () => {
      const content = textarea.value.trim();

      if (!content) {
        message.textContent = t('comments.need_text');
        return;
      }

      button.disabled = true;
      message.textContent = '';

      const { error } = await db
        .from('comments')
        .insert({ post_id: postId, content });

      button.disabled = false;

      if (error) {
        // 쓰는 사이에 글쓴이가 범위를 바꿨을 때 등: DB 규칙에 막힘
        message.textContent = error.code === '42501' ? t('cscope.closed_now') : t('comments.post_failed');
        return;
      }

      textarea.value = '';
      loadComments();
    });

    form.append(textarea, button, message);
    section.append(form);
  } else {
    const note = document.createElement('p');
    note.className = 'state-message';

    const loginLink = document.createElement('a');
    loginLink.href = 'login.html';
    loginLink.textContent = t('comments.login_link');
    loginLink.addEventListener('click', function (event) {
      event.preventDefault();
      openLogin();
    });

    note.append(loginLink, t('comments.login_tail'));
    section.append(note);
  }

  await loadComments();
})();