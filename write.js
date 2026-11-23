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
  // ---- 카테고리: 칩을 눌러 여러 개 고르기(최소 1개). 처음 고른 것이 대표 카테고리 ----
  const categoryPicker = document.getElementById('category-picker');
  let selectedCats = ['daily'];
  const catBoxes = {};
  CATEGORIES.forEach(function (c) {
    const label = document.createElement('label');
    label.className = 'cat-chip';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = c;
    const text = document.createElement('span');
    text.textContent = categoryLabel(c);
    label.append(box, text);
    box.addEventListener('change', function () {
      if (box.checked) {
        if (selectedCats.indexOf(c) === -1) selectedCats.push(c);
      } else {
        selectedCats = selectedCats.filter(function (x) { return x !== c; });
      }
      paintCats();
      window.dispatchEvent(new Event('tidnote:changed'));
    });
    catBoxes[c] = box;
    categoryPicker.append(label);
  });
  function paintCats() {
    CATEGORIES.forEach(function (c) {
      catBoxes[c].checked = selectedCats.indexOf(c) !== -1;
      catBoxes[c].parentNode.classList.toggle('on', catBoxes[c].checked);
    });
  }
  function setCats(list) {
    selectedCats = (Array.isArray(list) ? list : []).filter(isCategory);
    if (selectedCats.length === 0) selectedCats = ['daily'];
    paintCats();
  }
  paintCats();

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
  const MAX_TAGS = 50;
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
      .select('id, title, content, author_id, image_path, images, category, categories, tags')
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
    setCats(postCategories(post));
    tagsInput.value = Array.isArray(post.tags) ? post.tags.map(function (tag) { return '#' + tag; }).join(' ') : '';

    const stored = Array.isArray(post.images) ? post.images.slice() : [];
    if (post.image_path && stored.indexOf(post.image_path) === -1) stored.unshift(post.image_path);
    oldPaths = stored.slice();
    photos = stored.map(function (path) { return { path: path, blob: null, url: '' }; });
    coverIndex = post.image_path ? stored.indexOf(post.image_path) : -1;
    renderPhotos();
  }

  contentInput.addEventListener('input', updateBadges);

  // ---- 임시저장 (새 글에서만, 59일차) ----
  // 제목·본문·카테고리·태그를 서버(post_drafts, 본인만 볼 수 있음)에 저장한다. 사진은 저장하지 않는다.
  // 사지방처럼 재부팅하면 브라우저 기록이 지워지는 컴퓨터에서도 이어 쓸 수 있다.
  // [임시저장] 단추 또는 내용을 바꾸고 30초가 지나면 자동 저장. 게시하면 그 임시저장본은 지운다.
  let draftId = null;
  let dirty = false;
  if (!editId) {
    const draftActions = document.getElementById('draft-actions');
    const draftSave = document.getElementById('draft-save');
    const draftCount = document.getElementById('draft-count');
    const draftPanel = document.getElementById('draft-panel');
    const draftList = document.getElementById('draft-list');
    const draftStatus = document.getElementById('draft-status');
    const AUTO_MS = 30000;
    let autoTimer = null;
    let saving = false;
    let drafts = [];

    draftActions.hidden = false;
    try { localStorage.removeItem('tidnote_draft'); } catch (e) {} // 예전(브라우저 저장) 방식의 흔적 정리

    function timeText(at) {
      return new Date(at).toLocaleString(dateLocale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    function isEmpty() {
      return !titleInput.value.trim() && !contentInput.value.trim() && !tagsInput.value.trim();
    }
    function paintCount() {
      draftCount.textContent = String(drafts.length);
      draftCount.setAttribute('aria-label', t('draft.count', { n: drafts.length }));
      draftCount.title = t('draft.count', { n: drafts.length });
    }

    async function loadDrafts() {
      const { data, error } = await db
        .from('post_drafts')
        .select('id, title, content, categories, tags, updated_at')
        .order('updated_at', { ascending: false })
        .limit(20);
      if (error) {
        console.error(error);
        drafts = [];
      } else {
        drafts = data || [];
      }
      paintCount();
      renderDraftList();
    }

    function renderDraftList() {
      draftList.replaceChildren();
      if (drafts.length === 0) {
        const li = document.createElement('li');
        li.className = 'state-message';
        li.textContent = t('draft.none');
        draftList.append(li);
        return;
      }
      drafts.forEach(function (d) {
        const li = document.createElement('li');
        li.className = 'draft-item' + (d.id === draftId ? ' current' : '');
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'draft-open';
        const title = document.createElement('strong');
        title.textContent = d.title.trim() || t('draft.untitled');
        const when = document.createElement('span');
        when.className = 'date';
        when.textContent = timeText(d.updated_at) + (d.id === draftId ? ' · ' + t('draft.editing') : '');
        open.append(title, when);
        open.addEventListener('click', function () { openDraft(d); });
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'link-danger';
        del.textContent = t('draft.delete');
        del.setAttribute('aria-label', t('draft.delete') + ': ' + (d.title.trim() || t('draft.untitled')));
        del.addEventListener('click', async function () {
          if (!confirm(t('draft.confirm_delete'))) return;
          const { error } = await db.from('post_drafts').delete().eq('id', d.id);
          if (error) {
            alert(t('draft.failed'));
            return;
          }
          if (d.id === draftId) draftId = null;
          await loadDrafts();
        });
        li.append(open, del);
        draftList.append(li);
      });
    }

    function openDraft(d) {
      if (d.id !== draftId && dirty && !isEmpty() && !confirm(t('draft.confirm_replace'))) return;
      titleInput.value = d.title;
      contentInput.value = d.content;
      editor.refresh();
      setCats(d.categories);
      tagsInput.value = (d.tags || []).map(function (tag) { return '#' + tag; }).join(' ');
      // 사진은 임시저장하지 않으므로, 지금 올려 둔 사진도 비운다
      photos.forEach(function (p) { if (p.blob) URL.revokeObjectURL(p.url); });
      photos = [];
      coverIndex = -1;
      renderPhotos();
      draftId = d.id;
      dirty = false;
      draftStatus.textContent = t('draft.opened', { time: timeText(d.updated_at) });
      togglePanel(false);
      renderDraftList();
      titleInput.focus();
    }

    async function saveDraft(auto) {
      clearTimeout(autoTimer);
      if (saving) return;
      if (isEmpty()) {
        if (!auto) draftStatus.textContent = t('draft.empty');
        return;
      }
      saving = true;
      draftSave.disabled = true;
      const row = {
        title: titleInput.value.slice(0, 100),
        content: contentInput.value.slice(0, 20000),
        categories: selectedCats.slice(0, 9),
        tags: parseTags(tagsInput.value).slice(0, 50),
      };
      let result;
      if (draftId) {
        result = await db.from('post_drafts').update(row).eq('id', draftId).select('id, updated_at').maybeSingle();
        if (!result.error && !result.data) draftId = null; // 다른 곳에서 지운 임시저장본 → 새로 만든다
      }
      if (!draftId) {
        result = await db.from('post_drafts').insert(row).select('id, updated_at').single();
      }
      saving = false;
      draftSave.disabled = false;
      if (result.error || !result.data) {
        const msg = result.error && result.error.message ? result.error.message : '';
        draftStatus.textContent = msg.includes('Draft limit') ? t('draft.limit') : t('draft.failed');
        return;
      }
      draftId = result.data.id;
      dirty = false;
      draftStatus.textContent = t(auto ? 'draft.auto_saved' : 'draft.saved', { time: timeText(result.data.updated_at) }) +
        (photos.length ? ' ' + t('draft.no_photos') : '');
      await loadDrafts();
    }

    function markChanged() {
      dirty = true;
      clearTimeout(autoTimer);
      autoTimer = setTimeout(function () { saveDraft(true); }, AUTO_MS);
    }

    function togglePanel(on) {
      draftPanel.hidden = !on;
      draftCount.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) draftPanel.scrollIntoView({ block: 'nearest' });
    }

    draftSave.addEventListener('click', function () { saveDraft(false); });
    draftCount.addEventListener('click', function () { togglePanel(draftPanel.hidden); });
    document.getElementById('draft-panel-close').addEventListener('click', function () {
      togglePanel(false);
      draftCount.focus();
    });

    titleInput.addEventListener('input', markChanged);
    contentInput.addEventListener('input', markChanged);
    tagsInput.addEventListener('input', markChanged);
    window.addEventListener('tidnote:changed', markChanged);

    // Ctrl+S(맥은 Cmd+S): 임시저장
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveDraft(false);
      }
    });

    // 게시에 성공하면 그 임시저장본을 지운다
    window.addEventListener('tidnote:published', function () {
      clearTimeout(autoTimer);
      dirty = false;
    });

    await loadDrafts();
    // 가장 최근 임시저장본이 있으면 불러올지 묻는다
    if (drafts.length > 0 && isEmpty()) {
      const latest = drafts[0];
      const bar = document.getElementById('draft-bar');
      document.getElementById('draft-text').textContent = t('draft.found', { time: timeText(latest.updated_at), n: drafts.length });
      bar.hidden = false;
      document.getElementById('draft-load').addEventListener('click', function () {
        bar.hidden = true;
        openDraft(latest);
      });
      document.getElementById('draft-discard').addEventListener('click', function () {
        bar.hidden = true;
        titleInput.focus();
      });
    }
  } else {
    titleInput.addEventListener('input', function () { dirty = true; });
    contentInput.addEventListener('input', function () { dirty = true; });
    tagsInput.addEventListener('input', function () { dirty = true; });
    window.addEventListener('tidnote:changed', function () { dirty = true; });
  }

  // 저장하지 않은 내용이 있으면 창을 닫기 전에 한 번 묻는다
  window.addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
  window.addEventListener('tidnote:published', function () { dirty = false; });

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
    if (tags.length > MAX_TAGS) {
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
      categories: selectedCats.slice(),
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

    if (!editId && draftId) await db.from('post_drafts').delete().eq('id', draftId);
    window.dispatchEvent(new Event('tidnote:published'));
    window.location.href = 'post.html?id=' + saved.id;
  });
})();
