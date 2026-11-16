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
    .select('id, title, content, author_id, created_at, image_path, profiles(nickname)')
    .eq('id', id)
    .maybeSingle();

  if (error || !post) {
    box.textContent = t('post.not_found');
    return;
  }

    document.title = post.title + ' - Tidnote';

  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;
  const isOwner = !!session && session.user.id === post.author_id;

  const article = document.createElement('article');
  article.className = 'post';

  const h2 = document.createElement('h2');
  h2.textContent = post.title;

  const date = document.createElement('p');
  date.className = 'date';
  date.textContent = new Date(post.created_at).toLocaleDateString(dateLocale());

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

  const body = document.createElement('p');
  body.className = 'post-content';
  body.textContent = post.content;

  article.append(h2, date, author);

  if (post.image_path) {
    const img = document.createElement('img');
    img.dataset.imagePath = post.image_path; // 실제 주소는 fillPostImages가 채운다
    img.alt = post.title;
    img.className = 'post-image';
    img.loading = 'lazy';
    article.append(img);
  }

  article.append(body);
  fillPostImages(article);

  if (isOwner) {
    const actions = document.createElement('div');
    actions.className = 'post-actions';

    const editLink = document.createElement('a');
    editLink.href = 'write.html?id=' + post.id;
    editLink.textContent = t('post.edit');

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = t('post.delete');

    deleteBtn.addEventListener('click', async () => {
      if (!confirm(t('post.confirm_delete'))) return;
      deleteBtn.disabled = true;

      const { data: deleted, error: deleteError } = await db
        .from('posts')
        .delete()
        .eq('id', post.id)
        .select('id');

      if (deleteError || !deleted || deleted.length === 0) {
        alert(t('post.delete_failed'));
        deleteBtn.disabled = false;
        return;
      }
      
       if (post.image_path) {
        await db.storage.from('post-images').remove([post.image_path]);
      }

      window.location.href = 'blog.html';
    });

    actions.append(editLink, deleteBtn);
    article.append(actions);
  }

   if (session && !isOwner) {
    article.append(createReportControl('post', post.id));
  }

  const back = document.createElement('a');
  back.href = 'blog.html';
  back.textContent = t('post.back');
  article.append(back);

  box.innerHTML = '';
  box.append(article);
})();