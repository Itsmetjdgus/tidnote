(async function () {
  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const titleInput = document.getElementById('title');
  const contentInput = document.getElementById('content');
  const photoInput = document.getElementById('photo-input');
  const photoList = document.getElementById('photo-list');
  const categoryInput = document.getElementById('category');
  CATEGORIES.forEach(function (c) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = categoryLabel(c);
    categoryInput.append(opt);
  });
  categoryInput.value = 'daily';

  // ---- 사진 목록 상태 ----
  // photos[i] 가 글 속 [사진(i+1)] 이다. path: 이미 올라가 있는 파일 / blob: 아직 올리지 않은(크기를 줄여 둔) 파일
  let photos = [];
  let coverIndex = -1; // 대표(미리보기) 사진. -1 이면 없음
  let oldPaths = [];   // 수정하기 전에 저장돼 있던 사진 경로
  let photoEls = [];
  const PHOTO_LINE = /^\[(사진|photo)(\d{1,2})\][ \t]*$/i;

  const editor = setupEditor(contentInput, function () {
    return photos.map(function (p) { return p.blob ? { url: p.url } : { path: p.path }; });
  });

  const tagsInput = document.getElementById('tags');

  // "#여행, 맛집 #카페" -> ['여행', '맛집', '카페'] (#·쉼표·공백으로 나누고, 20자까지, 중복 제거, 영문은 소문자)
  function parseTags(text) {
    const out = [];
    text.split(/[\s,#]+/).forEach(function (raw) {
      const tag = Array.from(raw).slice(0, 20).join('').toLowerCase();
      if (tag && out.indexOf(tag) === -1) out.push(tag);
    });
    return out;
  }
  const button = document.getElementById('publish-btn');
  const message = document.getElementById('write-message');
  const heading = document.getElementById('write-heading');

  const MAX_INPUT_SIZE = 15 * 1024 * 1024;
  const MAX_PHOTOS = 10;
  const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  const editId = Number(new URLSearchParams(window.location.search).get('id')) || null;

  function updateBadges() {
    const placed = mdPlacedPhotos(contentInput.value);
    photoEls.forEach(function (el, i) {
      el.badge.hidden = placed.indexOf(i + 1) !== -1 || i === coverIndex;
      el.cover.checked = i === coverIndex;
    });
  }

  function renderPhotos() {
    photoList.replaceChildren();
    photoEls = [];
    photos.forEach(function (p, i) {
      const li = document.createElement('li');
      li.className = 'photo-item';

      const img = document.createElement('img');
      img.alt = '';
      if (p.blob) img.src = p.url;
      else img.dataset.imagePath = p.path; // 실제 주소는 fillPostImages가 채운다

      const meta = document.createElement('div');
      meta.className = 'photo-meta';
      const name = document.createElement('span');
      name.className = 'photo-name';
      name.textContent = t('photo.n', { n: i + 1 });
      const badge = document.createElement('span');
      badge.className = 'photo-badge';
      badge.textContent = t('photo.unplaced');

      const actions = document.createElement('div');
      actions.className = 'photo-actions';
      const insertBtn = document.createElement('button');
      insertBtn.type = 'button';
      insertBtn.className = 'photo-insert';
      insertBtn.textContent = t('photo.insert');
      insertBtn.addEventListener('click', function () {
        editor.insertBlock(t('photo.token', { n: i + 1 }));
        updateBadges();
      });

      const coverLabel = document.createElement('label');
      coverLabel.className = 'photo-cover';
      const cover = document.createElement('input');
      cover.type = 'checkbox';
      cover.addEventListener('change', function () {
        coverIndex = cover.checked ? i : -1;
        updateBadges();
      });
      const coverText = document.createElement('span');
      coverText.textContent = t('photo.cover');
      coverLabel.append(cover, coverText);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'photo-remove secondary';
      removeBtn.textContent = t('photo.remove');
      removeBtn.addEventListener('click', function () { removePhoto(i); });

      actions.append(insertBtn, coverLabel, removeBtn);
      meta.append(name, badge, actions);
      li.append(img, meta);
      photoList.append(li);
      photoEls.push({ badge: badge, cover: cover });
    });
    fillPostImages(photoList);
    updateBadges();
  }

  // 사진을 지운다. 글 속의 그 사진 자리는 없애고, 뒤 번호는 하나씩 당긴다.
  function removePhoto(i) {
    const oldCount = photos.length;
    const removed = i + 1;
    if (photos[i].blob) URL.revokeObjectURL(photos[i].url);
    photos.splice(i, 1);

    const out = [];
    contentInput.value.split('\n').forEach(function (line) {
      const m = PHOTO_LINE.exec(line);
      if (m) {
        const n = Number(m[2]);
        if (n === removed && n <= oldCount) return;
        if (n > removed && n <= oldCount) {
          out.push('[' + m[1] + (n - 1) + ']');
          return;
        }
      }
      out.push(line);
    });
    contentInput.value = out.join('\n');

    if (coverIndex === i) coverIndex = -1;
    else if (coverIndex > i) coverIndex--;
    editor.refresh();
    renderPhotos();
  }

  if (editId) {
    heading.dataset.i18n = 'write.heading_edit';
    heading.textContent = t('write.heading_edit');
    button.dataset.i18n = 'write.save_changes';
    button.textContent = t('write.save_changes');

    const { data: post, error } = await db
      .from('posts')
      .select('id, title, content, author_id, image_path, images, category, tags')
      .eq('id', editId)
      .maybeSingle();

    if (error || !post || post.author_id !== session.user.id) {
      message.textContent = t('write.cannot_edit');
      button.disabled = true;
      return;
    }

    titleInput.value = post.title;
    contentInput.value = post.content;
    editor.refresh();
    categoryInput.value = isCategory(post.category) ? post.category : 'daily';
    tagsInput.value = Array.isArray(post.tags) ? post.tags.map(function (tag) { return '#' + tag; }).join(' ') : '';

    const stored = Array.isArray(post.images) ? post.images.slice() : [];
    if (post.image_path && stored.indexOf(post.image_path) === -1) stored.unshift(post.image_path);
    oldPaths = stored.slice();
    photos = stored.map(function (path) { return { path: path, blob: null, url: '' }; });
    coverIndex = post.image_path ? stored.indexOf(post.image_path) : -1;
    renderPhotos();
  }

  contentInput.addEventListener('input', updateBadges);

  // ---- 임시저장 (새 글에서만) ----
  // 제목·본문·카테고리·태그를 이 브라우저(로컬 저장소)에 자동으로 저장한다. 사진은 저장하지 않는다.
  // 게시하거나, 버리거나, 로그아웃하면 지운다. 서버로는 게시하기 전에 아무것도 보내지 않는다.
  if (!editId) {
    const DRAFT_KEY = 'tidnote_draft';
    const draftBar = document.getElementById('draft-bar');
    const draftText = document.getElementById('draft-text');
    const draftStatus = document.getElementById('draft-status');
    let draftTimer = null;
    let draftPaused = false;

    function readDraft() {
      try {
        const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
        if (d && d.v === 1 && d.uid === session.user.id && typeof d.title === 'string' && typeof d.content === 'string' && typeof d.tags === 'string') return d;
      } catch (e) {}
      return null;
    }
    function clearDraft() {
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    }
    function saveDraft() {
      if (draftPaused) return;
      if (!titleInput.value.trim() && !contentInput.value.trim() && !tagsInput.value.trim()) {
        clearDraft();
        draftStatus.textContent = '';
        return;
      }
      try {
        const at = Date.now();
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          v: 1,
          uid: session.user.id,
          title: titleInput.value,
          content: contentInput.value,
          category: categoryInput.value,
          tags: tagsInput.value,
          at: at,
        }));
        draftStatus.textContent = t('draft.saved', { time: new Date(at).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }) });
      } catch (e) {
        draftStatus.textContent = '';
      }
    }
    function scheduleDraft() {
      if (draftPaused) return;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(saveDraft, 800);
    }

    // 게시에 성공하면 임시저장본을 지우고, 늦게 도착한 저장이 다시 만들지 못하게 멈춘다
    window.addEventListener('tidnote:published', function () {
      draftPaused = true;
      clearTimeout(draftTimer);
      clearDraft();
    });

    const saved = readDraft();
    const nothingYet = !titleInput.value && !contentInput.value && !tagsInput.value;
    if (saved && nothingYet && (saved.title.trim() || saved.content.trim() || saved.tags.trim())) {
      // 불러올지 정할 때까지는 자동 저장을 멈춰서, 예전 저장본을 덮어쓰지 않는다
      draftPaused = true;
      draftText.textContent = t('draft.found', { time: new Date(saved.at || Date.now()).toLocaleString(dateLocale()) });
      draftBar.hidden = false;
      document.getElementById('draft-load').addEventListener('click', function () {
        titleInput.value = saved.title;
        // 사진은 저장하지 않았으므로 [사진N] 줄은 뺀다
        contentInput.value = saved.content.split('\n').filter(function (line) { return !PHOTO_LINE.test(line); }).join('\n');
        editor.refresh();
        categoryInput.value = isCategory(saved.category) ? saved.category : 'daily';
        tagsInput.value = saved.tags;
        updateBadges();
        draftBar.hidden = true;
        draftPaused = false;
        message.textContent = t('draft.restored');
        titleInput.focus();
      });
      document.getElementById('draft-discard').addEventListener('click', function () {
        clearDraft();
        draftBar.hidden = true;
        draftPaused = false;
        titleInput.focus();
      });
    }

    titleInput.addEventListener('input', scheduleDraft);
    contentInput.addEventListener('input', scheduleDraft);
    tagsInput.addEventListener('input', scheduleDraft);
    categoryInput.addEventListener('change', scheduleDraft);
  }


  // 사진 고르기: 크기를 줄여 두고, 글의 커서 위치에 [사진N] 을 넣는다. 서버에는 '게시' 할 때 올린다.
  photoInput.addEventListener('change', async function () {
    const files = Array.from(photoInput.files);
    photoInput.value = '';
    if (files.length === 0) return;

    let note = '';
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) note = t('photo.too_many');
    const take = files.slice(0, Math.max(0, room));

    button.disabled = true;
    message.textContent = take.length > 0 ? t('write.processing') : note;
    for (const file of take) {
      if (!TYPES[file.type]) {
        note = t('profile.photo_type');
        continue;
      }
      if (file.size > MAX_INPUT_SIZE) {
        note = t('profile.photo_size');
        continue;
      }
      let blob = null;
      try {
        blob = await resizeImage(file, 1600, 0.85);
      } catch (e) {
        blob = null;
      }
      if (!blob) {
        note = t('profile.photo_failed');
        continue;
      }
      photos.push({ path: null, blob: blob, url: URL.createObjectURL(blob) });
      if (photos.length === 1) coverIndex = 0; // 처음 올린 사진이 기본 대표 사진 (바꾸려면 체크를 옮기면 됨)
      editor.insertBlock(t('photo.token', { n: photos.length }));
    }
    message.textContent = note;
    button.disabled = false;
    renderPhotos();
  });

  button.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();

    if (!title || !content) {
      message.textContent = t('write.need_both');
      return;
    }

    const tags = parseTags(tagsInput.value);
    if (tags.length > 5) {
      message.textContent = t('write.tags_too_many');
      return;
    }

    // 저장할 사진 = 대표 사진 + 글에 자리를 잡은 사진. 나머지는 저장하지 않고, 번호를 새로 맞춘다.
    const placed = mdPlacedPhotos(content);
    const kept = [];
    photos.forEach(function (p, i) {
      if (i === coverIndex || placed.indexOf(i + 1) !== -1) kept.push(i);
    });
    const newNumber = {};
    kept.forEach(function (idx, k) { newNumber[idx + 1] = k + 1; });
    const finalContent = content.split('\n').map(function (line) {
      const m = PHOTO_LINE.exec(line);
      if (!m) return line;
      const k = newNumber[Number(m[2])];
      return k ? '[' + m[1] + k + ']' : line;
    }).join('\n');

    button.disabled = true;
    message.textContent = t('write.saving');

    const uploaded = [];
    const finalPaths = [];
    const pending = kept.filter(function (idx) { return photos[idx].blob; }).length;
    for (const idx of kept) {
      const p = photos[idx];
      if (!p.blob) {
        finalPaths.push(p.path);
        continue;
      }
      message.textContent = t('photo.uploading', { i: uploaded.length + 1, n: pending });
      const path =
        session.user.id + '/' + Date.now() + '-' +
        Math.random().toString(36).slice(2, 8) + '.jpg';
      const { error: uploadError } = await db.storage
        .from('post-images')
        .upload(path, p.blob, { contentType: 'image/jpeg' });
      if (uploadError) {
        if (uploaded.length > 0) await db.storage.from('post-images').remove(uploaded);
        message.textContent = t('profile.photo_failed');
        button.disabled = false;
        return;
      }
      uploaded.push(path);
      finalPaths.push(path);
    }

    const coverPath = coverIndex >= 0 ? finalPaths[kept.indexOf(coverIndex)] : null;
    const fields = {
      title,
      content: finalContent,
      category: categoryInput.value,
      tags: tags,
      images: finalPaths,
      image_path: coverPath,
    };

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
      if (uploaded.length > 0) {
        await db.storage.from('post-images').remove(uploaded);
      }
      message.textContent =
        error && error.message && error.message.includes('Too many')
          ? t('write.too_many')
          : t('write.failed');
      button.disabled = false;
      return;
    }

    // 수정으로 빠진 사진 파일은 저장소에서 지운다
    const obsolete = oldPaths.filter(function (p) { return finalPaths.indexOf(p) === -1; });
    if (editId && obsolete.length > 0) {
      await db.storage.from('post-images').remove(obsolete);
    }

    window.dispatchEvent(new Event('tidnote:published'));
    window.location.href = 'post.html?id=' + saved.id;
  });
})();
