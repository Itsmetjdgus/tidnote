(async function () {
  const box = document.getElementById('post-detail');
  const id = Number(new URLSearchParams(window.location.search).get('id'));
  document.title = t('title.post');

  if (!id) {
    box.textContent = t('post.not_found');
    return;
  }

  // 78일차: lang 열이 아직 없으면(SQL 실행 전) 빼고 다시 읽는다
  const COLS = 'id, title, content, author_id, created_at, image_path, images, category, categories, tags, comments(count), profiles!posts_author_profile_fkey(nickname, avatar_path)';
  let { data: post, error } = await db.from('posts').select(COLS + ', lang').eq('id', id).maybeSingle();
  if (error && /lang/.test(error.message || '')) {
    ({ data: post, error } = await db.from('posts').select(COLS).eq('id', id).maybeSingle());
  }

  if (error || !post) {
    box.textContent = t('post.not_found');
    return;
  }

    document.title = post.title + ' - Tidnote';

  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;

  const article = document.createElement('article');
  article.className = 'post';

  // 70일차: 메인 카드와 같은 순서 — [프로필 사진 + 닉네임] / 날짜 · 카테고리 / 제목 / 본문 / 좋아요 · 댓글 수 · 해시태그
  article.classList.add('post-detail');
  const name = post.profiles && post.profiles.nickname ? post.profiles.nickname : t('post.anonymous');
  const who = document.createElement(post.author_id && post.profiles ? 'a' : 'span');
  who.className = 'card-author';
  if (post.author_id && post.profiles) who.href = 'author.html?id=' + post.author_id;
  if (typeof createAvatar === 'function') who.append(createAvatar(name, post.profiles ? post.profiles.avatar_path : null, true));
  const nick = document.createElement('span');
  nick.className = 'card-nick';
  nick.textContent = name;
  who.append(nick);

  const date = document.createElement('p');
  date.className = 'date card-meta';
  date.textContent = new Date(post.created_at).toLocaleDateString(dateLocale());
  postCategories(post).forEach(function (c, i) {
    const catLink = document.createElement('a');
    catLink.href = 'index.html?cat=' + encodeURIComponent(c);
    catLink.textContent = categoryLabel(c);
    date.append(i === 0 ? ' · ' : ', ', catLink);
  });

  const h2 = document.createElement('h2');
  h2.className = 'post-title';
  h2.textContent = post.title;

  const body = document.createElement('div');
  body.className = 'post-content';
  const photoPaths = Array.isArray(post.images) ? post.images : [];
  const coverNumber = post.image_path ? photoPaths.indexOf(post.image_path) + 1 : 0;
  const coverInBody = coverNumber > 0 && mdPlacedPhotos(post.content).indexOf(coverNumber) !== -1;
  body.append(renderMarkdown(post.content, photoPaths.map(function (path) { return { path: path }; })));

  article.append(who, date, h2);


  if (post.image_path && !coverInBody) {
    const img = document.createElement('img');
    img.dataset.imagePath = post.image_path; // 실제 주소는 fillPostImages가 채운다
    img.alt = post.title;
    img.className = 'post-image';
    img.loading = 'lazy';
    article.append(img);
  }

  article.append(body);
  fillPostImages(article);

  // 79일차: 인스타그램처럼 본문 아래 작은 "번역 보기". 글 언어가 기기 언어와 다를 때만 보인다
  if (post.lang && typeof createTranslateToggle === 'function') {
    const toggle = createTranslateToggle(post, h2, body, photoPaths);
    if (toggle) article.append(toggle);
  }


  if (Array.isArray(post.tags) && post.tags.length > 0) {
    const tagRow = document.createElement('p');
    tagRow.className = 'tag-row';
    tagRow.setAttribute('aria-label', t('post.tags'));
    post.tags.forEach(function (tag, i) {
      if (i > 0) tagRow.append(' ');
      const a = document.createElement('a');
      a.href = 'index.html?tag=' + encodeURIComponent(tag);
      a.textContent = '#' + tag;
      tagRow.append(a);
    });
    article.append(tagRow);
  }

  // 아래 줄: 좋아요 · 댓글 수 (메인 카드와 같은 모양)
  const foot = document.createElement('div');
  foot.className = 'card-foot post-foot';
  if (typeof createLikeButton === 'function') foot.append(createLikeButton(post.id));
  const count = post.comments && post.comments[0] && post.comments[0].count ? post.comments[0].count : 0;
  const commentsLink = document.createElement('a');
  commentsLink.className = 'card-comments';
  commentsLink.href = '#comments';
  commentsLink.setAttribute('aria-label', t('post.comment_count', { n: count }));
  commentsLink.title = t('post.comment_count', { n: count });
  if (typeof navIcon === 'function') commentsLink.append(navIcon('comment', 18));
  const num = document.createElement('span');
  num.textContent = String(count);
  commentsLink.append(num);
  foot.append(commentsLink);
  article.append(foot);
  if (typeof fillLikes === 'function') fillLikes(foot);

  // 58일차: 수정·삭제·신고·뒤로 단추 대신 오른쪽 위 ⋯ 메뉴
  if (typeof createPostMenu === 'function') {
    article.classList.add('has-menu');
    article.prepend(createPostMenu({
      id: post.id,
      author_id: post.author_id,
      nickname: post.profiles ? post.profiles.nickname : '',
      images: photoPaths,
      image_path: post.image_path,
    }, {
      session: session,
      detail: true,
      onDeleted: function () { window.location.href = 'index.html'; },
      onHidden: function () {},
    }));
  }

  box.innerHTML = '';
  box.append(article);
})();
