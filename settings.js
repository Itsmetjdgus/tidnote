(async function () {
  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const errorBox = document.getElementById('settings-error');

  // 메뉴(분류·항목) 나누기는 settings-nav.js 가 한다(67일차)

  // ----- 내 프로필 읽기 -----
  const { data: profile, error } = await db
    .from('profiles')
    .select('id, nickname, is_private')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !profile) {
    errorBox.textContent = t('settings.load_failed');
    return;
  }

  // ----- 계정: 닉네임 -----
  const nicknameForm = document.getElementById('nickname-form');
  const nicknameInput = document.getElementById('nickname');
  const nicknameBtn = document.getElementById('nickname-btn');
  const nicknameMessage = document.getElementById('nickname-message');

  nicknameInput.value = profile.nickname;
  setSettingValue('nickname', profile.nickname);

  nicknameForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    nicknameMessage.className = 'form-message';

    const nickname = nicknameInput.value.trim();

    if (nickname.length < 2 || nickname.length > 20) {
      nicknameMessage.textContent = t('settings.nickname_length');
      return;
    }
    if (nickname.indexOf('@') !== -1) {
      nicknameMessage.textContent = t('settings.nickname_at');
      return;
    }

    nicknameBtn.disabled = true;

    const { data: updated, error: updateError } = await db
      .from('profiles')
      .update({ nickname: nickname })
      .eq('id', profile.id)
      .select('nickname')
      .maybeSingle();

    nicknameBtn.disabled = false;

    if (updateError || !updated) {
      if (updateError && updateError.code === '23505') {
        nicknameMessage.textContent = t('settings.nickname_taken');
      } else {
        nicknameMessage.textContent = t('settings.nickname_failed');
      }
      return;
    }

    nicknameInput.value = updated.nickname;
    setSettingValue('nickname', updated.nickname);
    nicknameMessage.className = 'form-message ok';
    nicknameMessage.textContent = t('settings.saved');
  });

  // ----- 개인정보 보호: 공개 / 비공개 -----
  const privacyStatus = document.getElementById('privacy-status');
  const privacySave = document.getElementById('privacy-save');
  const privacyMessage = document.getElementById('privacy-message');
  const radios = document.querySelectorAll('input[name="privacy"]');

  let current = profile.is_private ? 'private' : 'public';

  function showCurrent() {
    privacyStatus.textContent = t('settings.privacy_current', {
      state: t(current === 'private' ? 'settings.state_private' : 'settings.state_public'),
    });
    radios.forEach(function (radio) {
      radio.checked = radio.value === current;
    });
    setSettingValue('visibility', t(current === 'private' ? 'settings.private' : 'settings.public'));
  }

  showCurrent();

  privacySave.addEventListener('click', async function () {
    privacyMessage.className = 'form-message';

    const selected = document.querySelector('input[name="privacy"]:checked');
    if (!selected) {
      privacyMessage.textContent = t('settings.choose');
      return;
    }
    if (selected.value === current) {
      privacyMessage.textContent = t('settings.no_change');
      return;
    }

    const goingPublic = selected.value === 'public';
    if (!confirm(t(goingPublic ? 'settings.confirm_public' : 'settings.confirm_private'))) return;

    privacySave.disabled = true;

    const { data, error: updateError } = await db
      .from('profiles')
      .update({ is_private: !goingPublic })
      .eq('id', session.user.id)
      .select('is_private')
      .maybeSingle();

    privacySave.disabled = false;

    if (updateError || !data) {
      privacyMessage.textContent = t('settings.save_failed');
      return;
    }

    current = data.is_private ? 'private' : 'public';
    showCurrent();
    privacyMessage.className = 'form-message ok';
    privacyMessage.textContent = t('settings.saved');
  });

  // ----- 보안: 계정 삭제 (비밀번호 재확인) -----
  const deleteForm = document.getElementById('delete-form');
  const deletePassword = document.getElementById('delete-password');
  const deleteConfirm = document.getElementById('delete-confirm');
  const deleteBtn = document.getElementById('delete-account-btn');
  const deleteMessage = document.getElementById('delete-message');

  // 저장소의 내 폴더 파일을 "목록 보기 → 지우기"로 비울 때까지 반복한다.
  // (폴더 목록은 한 번에 최대 1000개만 돌려주므로, 한 번만 하면 1000개를 넘는 파일이 남는다)
  // 돌려주는 값: 'ok' 다 지움 / 'list' 목록 실패 / 'remove' 삭제 실패(또는 비정상적으로 많음)
  async function removeAllFiles(bucket, userId) {
    for (let round = 0; round < 50; round++) {
      const { data: files, error: listError } = await db.storage.from(bucket).list(userId, { limit: 1000 });
      if (listError) return 'list';
      const objects = (files || []).filter(function (f) { return f.id !== null; });
      if (objects.length === 0) return 'ok';
      const { error: removeError } = await db.storage
        .from(bucket)
        .remove(objects.map(function (f) { return userId + '/' + f.name; }));
      if (removeError) return 'remove';
    }
    return 'remove';
  }

  deleteForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    deleteMessage.className = 'form-message';

    if (!deletePassword.value) {
      deleteMessage.textContent = t('settings.delete_need_pw');
      return;
    }
    if (deleteConfirm.value !== 'DELETE') {
      deleteMessage.textContent = t('settings.delete_need_word');
      return;
    }
    if (!confirm(t('settings.delete_confirm'))) return;

    deleteBtn.disabled = true;
    deleteMessage.textContent = t('settings.deleting');

    // 1) 비밀번호 재확인
    const { error: passwordError } = await db.auth.signInWithPassword({
      email: session.user.email,
      password: deletePassword.value,
    });
    if (passwordError) {
      deleteMessage.textContent = t('settings.delete_bad_pw');
      deleteBtn.disabled = false;
      return;
    }

    const userId = session.user.id;

    // 2) 글 이미지 삭제 (내 폴더의 파일을 전부 지운다. 글에 연결되지 않은 파일도 포함)
    const imageResult = await removeAllFiles('post-images', userId);
    if (imageResult === 'list') {
      deleteMessage.textContent = t('settings.delete_failed');
      deleteBtn.disabled = false;
      return;
    }
    if (imageResult === 'remove') {
      deleteMessage.textContent = t('settings.delete_images_failed');
      deleteBtn.disabled = false;
      return;
    }

    // 3) 프로필 사진 삭제
    const avatarResult = await removeAllFiles('avatars', userId);
    if (avatarResult !== 'ok') {
      deleteMessage.textContent = t('settings.delete_images_failed');
      deleteBtn.disabled = false;
      return;
    }

    // 4) 계정 삭제
    const { error: rpcError } = await db.rpc('delete_my_account');
    if (rpcError) {
      deleteMessage.textContent = t('settings.delete_failed');
      deleteBtn.disabled = false;
      return;
    }

    try { localStorage.removeItem('tidnote_draft'); } catch (e) {}
    try {
      await db.auth.signOut();
    } catch (e) {}

    window.location.href = 'index.html';
  });
})();