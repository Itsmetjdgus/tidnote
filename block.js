// 차단 공용 코드: 관계 조회, 숨길 사용자 목록, 차단/해제 버튼
async function getBlockRelation(targetId) {
  const { data, error } = await db.rpc('get_block_relation', { target: targetId });
  if (error || !data) return 'none';
  return data; // 'none' | 'blocking' | 'blocked'
}

async function getHiddenIds() {
  const { data, error } = await db.rpc('hidden_user_ids');
  if (error || !Array.isArray(data)) return [];
  // setof uuid 는 문자열 배열로 오지만, 객체로 와도 대응
  return data.map(function (x) {
    return typeof x === 'string' ? x : Object.values(x)[0];
  });
}

async function blockUser(targetId) {
  const { error } = await db.from('blocks').insert({ blocked_id: targetId });
  return !error;
}

async function unblockUser(targetId) {
  const { data, error } = await db
    .from('blocks')
    .delete()
    .eq('blocked_id', targetId)
    .select('blocked_id');
  return !error && data && data.length > 0;
}

// 프로필 화면의 "차단 / 차단 해제" 링크 버튼
function createBlockControl(targetId, nickname, relation) {
  const wrapper = document.createElement('div');
  wrapper.className = 'report-box';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'link-danger';
  btn.textContent = relation === 'blocking' ? t('block.unblock') : t('block.block');

  const msg = document.createElement('p');
  msg.className = 'form-message';
  msg.setAttribute('role', 'status');

  btn.addEventListener('click', async function () {
    const isUnblock = relation === 'blocking';
    const question = isUnblock
      ? t('block.confirm_unblock', { name: nickname })
      : t('block.confirm_block', { name: nickname });
    if (!confirm(question)) return;

    btn.disabled = true;
    msg.textContent = '';
    const ok = isUnblock ? await unblockUser(targetId) : await blockUser(targetId);
    if (!ok) {
      msg.textContent = t('block.error');
      btn.disabled = false;
      return;
    }
    // 상태가 여러 곳(팔로우 버튼, 글 목록)에 영향을 주므로 화면을 새로 불러온다
    location.reload();
  });

  wrapper.append(btn, msg);
  return wrapper;
}