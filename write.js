(async function () {
  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const titleInput = document.getElementById('title');
  const contentInput = document.getElementById('content');
  const imageInput = document.getElementById('image');
  const categoryInput = document.getElementById('category');
  CATEGORIES.forEach(function (c) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = categoryLabel(c);
    categoryInput.append(opt);
  });
  categoryInput.value = 'daily';
  const button = document.getElementById('publish-btn');
  const message = document.getElementById('write-message');
  const heading = document.getElementById('write-heading');

  const MAX_INPUT_SIZE = 15 * 1024 * 1024;
  const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  const editId = Number(new URLSearchParams(window.location.search).get('id')) || null;
  let oldImagePath = null;

  if (editId) {
    heading.dataset.i18n = 'write.heading_edit';
    heading.textContent = t('write.heading_edit');
    button.dataset.i18n = 'write.save_changes';
    button.textContent = t('write.save_changes');

    const { data: post, error } = await db
      .from('posts')
      .select('id, title, content, author_id, image_path, category')
      .eq('id', editId)
      .maybeSingle();

    if (error || !post || post.author_id !== session.user.id) {
      message.textContent = t('write.cannot_edit');
      button.disabled = true;
      return;
    }

    titleInput.value = post.title;
    contentInput.value = post.content;
    categoryInput.value = isCategory(post.category) ? post.category : 'daily';
    oldImagePath = post.image_path;
  }

  button.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();

    if (!title || !content) {
      message.textContent = t('write.need_both');
      return;
    }

    const file = imageInput.files[0];
    if (file) {
      if (!TYPES[file.type]) {
        message.textContent = t('profile.photo_type');
        return;
      }
      if (file.size > MAX_INPUT_SIZE) {
        message.textContent = t('profile.photo_size');
        return;
      }
    }

    button.disabled = true;
    message.textContent = t('write.saving');

     let newImagePath = null;
    if (file) {
      message.textContent = t('write.processing');

      let resized;
      try {
        resized = await resizeImage(file, 1600, 0.85);
      } catch (e) {
        resized = null;
      }

      if (!resized) {
        message.textContent = t('profile.photo_failed');
        button.disabled = false;
        return;
      }

      newImagePath =
        session.user.id + '/' + Date.now() + '-' +
        Math.random().toString(36).slice(2, 8) + '.jpg';

      const { error: uploadError } = await db.storage
        .from('post-images')
        .upload(newImagePath, resized, { contentType: 'image/jpeg' });

      if (uploadError) {
        message.textContent = t('profile.photo_failed');
        button.disabled = false;
        return;
      }
    }

    const fields = { title, content, category: categoryInput.value };
    if (newImagePath) fields.image_path = newImagePath;

    let result;
    if (editId) {
      result = await db
        .from('posts')
        .update(fields)
        .eq('id', editId)
        .select('id')
        .maybeSingle();
    } else {
      result = await db
        .from('posts')
        .insert(fields)
        .select('id')
        .single();
    }

    const { data: saved, error } = result;

    if (error || !saved) {
      if (newImagePath) {
        await db.storage.from('post-images').remove([newImagePath]);
      }
      message.textContent =
        error && error.message && error.message.includes('Too many')
          ? t('write.too_many')
          : t('write.failed');
      button.disabled = false;
      return;
    }

    if (editId && newImagePath && oldImagePath) {
      await db.storage.from('post-images').remove([oldImagePath]);
    }

    window.location.href = 'post.html?id=' + saved.id;
  });
})();