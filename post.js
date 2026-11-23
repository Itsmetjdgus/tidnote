(async function () {
  const box = document.getElementById('post-detail');
  const id = Number(new URLSearchParams(window.location.search).get('id'));
  document.title = t('title.post');

  if (!id) {
    box.textContent = t('post.not_found');
    return;
  }

  const { data: post, error } = await db
    .from('posts')
    .select('id, title, content, author_id, created_at, image_path, images, category, categories, tags, profiles!posts_author_profile_fkey(nickname)')
    .eq('id', id)
    .maybeSingle();

  if (error || !post) {
    box.textContent = t('post.not_found');
    return;
  }

    document.title = post.title + ' - Tidnote';

  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;

  const article = document.createElement('article');
  article.className = 'post';

  const h2 = document.createElement('h2');
  h2.textContent = post.title;

  const date = document.createElement('p');
  date.className = 'date';
  date.textContent = new Date(post.created_at).toLocaleDateString(dateLocale());
  postCategories(post).forEach(function (c, i) {
    const catLink = document.createElement('a');
    catLink.href = 'index.html?cat=' + encodeURIComponent(c);
    catLink.textContent = categoryLabel(c);
    date.append(i === 0 ? ' · ' : ', ', catLink);
  });

    const author = document.createElement('p');
  author.className = 'date';
  author.append(t('post.by_label'));
  if (post.author_id && post.profiles) {
    const authorLink = document.createElement('a');
    authorLink.href = 'author.html?id=' + post.author_id;
    authorLink.textContent = post.profiles.nickname;
    author.append(authorLink);
  } else {
    author.append(t('post.anonymous'));
  }

  const body = document.createElement('div');
  body.className = 'post-content';
  const photoPaths = Array.isArray(post.images) ? post.images : [];
  const coverNumber = post.image_path ? photoPaths.indexOf(post.image_path) + 1 : 0;
  const coverInBody = coverNumber > 0 && mdPlacedPhotos(post.content).indexOf(coverNumber) !== -1;
  body.append(renderMarkdown(post.content, photoPaths.map(function (path) { return { path: path }; })));

  article.append(h2, date, author);

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

  if (typeof createLikeButton === 'function') {
    const likeRow = document.createElement('div');
    likeRow.className = 'post-like-row';
    likeRow.append(createLikeButton(post.id));
    article.append(likeRow);
    fillLikes(likeRow);
  }

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