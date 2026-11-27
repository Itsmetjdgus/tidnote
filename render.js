// 글 사진은 비공개 저장소에 있으므로, 서버에서 받은 짧은 유효기간의 주소(서명 URL)를 사용한다.
const IMAGE_URL_TTL = 3600; // 초 (1시간)
const imageUrlCache = {};   // 경로 -> { url, expires }  (페이지가 열려 있는 동안만 유지)

async function signImagePaths(paths) {
  const now = Date.now();
  const need = [];
  paths.forEach(function (p) {
    const cached = imageUrlCache[p];
    const fresh = cached && cached.expires > now + 60000;
    if (!fresh && need.indexOf(p) === -1) need.push(p);
  });
  if (need.length === 0) return;

  const { data, error } = await db.storage
    .from('post-images')
    .createSignedUrls(need, IMAGE_URL_TTL);

  if (error || !Array.isArray(data)) return;
  data.forEach(function (item) {
    if (item && item.signedUrl && !item.error) {
      imageUrlCache[item.path] = { url: item.signedUrl, expires: now + IMAGE_URL_TTL * 1000 };
    }
  });
}

// root 안의 <img data-image-path="..."> 에 사진 주소를 채운다. 볼 권한이 없으면 사진 칸을 제거한다.
async function fillPostImages(root) {
  const scope = root || document;
  const imgs = Array.from(scope.querySelectorAll('img[data-image-path]'));
  if (imgs.length === 0) return;

  await signImagePaths(imgs.map(function (img) { return img.dataset.imagePath; }));

  imgs.forEach(function (img) {
    const path = img.dataset.imagePath;
    const cached = imageUrlCache[path];
    if (!cached) {
      img.remove();
      return;
    }

    // 페이지를 오래 열어 둬서 주소가 만료된 경우 한 번만 새 주소로 다시 시도
    img.addEventListener('error', async function () {
      if (img.dataset.retried) {
        img.remove();
        return;
      }
      img.dataset.retried = '1';
      delete imageUrlCache[path];
      await signImagePaths([path]);
      const again = imageUrlCache[path];
      if (again) img.src = again.url;
      else img.remove();
    });

    img.src = cached.url;
  });
}

// 77일차: 카드에 보여 줄 사진 경로 목록. 대표 사진을 맨 앞으로, 최대 10장
function cardPhotoPaths(post) {
  const list = Array.isArray(post.images) ? post.images.slice() : [];
  if (post.image_path) {
    const i = list.indexOf(post.image_path);
    if (i > 0) list.splice(i, 1);
    if (i !== 0) list.unshift(post.image_path);
  }
  return list.slice(0, 10);
}

// 사진 넘겨 보기: 손가락으로 옆으로 밀거나(폰), 좌우 단추(PC)로 넘긴다. 사진을 누르면 글로 간다
function createPhotoCarousel(paths, post) {
  const box = document.createElement('div');
  box.className = 'card-photos';
  const track = document.createElement('div');
  track.className = 'card-photos-track';
  track.setAttribute('aria-label', t('photo.carousel', { n: paths.length }));
  track.tabIndex = paths.length > 1 ? 0 : -1;
  paths.forEach(function (path, i) {
    const a = document.createElement('a');
    a.className = 'card-photo';
    a.href = 'post.html?id=' + post.id;
    a.tabIndex = -1;
    const img = document.createElement('img');
    img.dataset.imagePath = path; // 실제 주소는 fillPostImages가 채운다
    img.alt = paths.length > 1 ? post.title + ' (' + (i + 1) + '/' + paths.length + ')' : post.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    a.append(img);
    track.append(a);
  });
  box.append(track);
  if (paths.length < 2) return box;

  const count = document.createElement('span');
  count.className = 'card-photos-count';
  count.setAttribute('aria-hidden', 'true');
  const dots = document.createElement('div');
  dots.className = 'card-photos-dots';
  dots.setAttribute('aria-hidden', 'true');
  paths.forEach(function () { dots.append(document.createElement('span')); });

  function make(dir) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card-photos-nav ' + (dir < 0 ? 'prev' : 'next');
    b.setAttribute('aria-label', t(dir < 0 ? 'photo.prev' : 'photo.next'));
    b.textContent = dir < 0 ? '‹' : '›';
    b.addEventListener('click', function (e) {
      e.preventDefault();
      go(current() + dir);
    });
    return b;
  }
  const prev = make(-1);
  const next = make(1);
  box.append(prev, next, count, dots);

  function current() {
    return Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  }
  function go(i) {
    i = Math.max(0, Math.min(paths.length - 1, i));
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  }
  function paint() {
    const i = current();
    count.textContent = (i + 1) + '/' + paths.length;
    Array.from(dots.children).forEach(function (d, k) { d.classList.toggle('on', k === i); });
    prev.hidden = i === 0;
    next.hidden = i === paths.length - 1;
  }
  let raf = 0;
  track.addEventListener('scroll', function () {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(paint);
  }, { passive: true });
  track.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(current() - 1); }
  });
  paint();
  return box;
}

// 글 카드. showAuthor 가 true 이면(홈) 맨 위에 [프로필 사진 + 닉네임]이 붙고, 작성자 화면에서는 붙지 않는다.
// 구조: 작성자 줄 / 날짜·카테고리 / (제목·미리보기 + 오른쪽 미리보기 사진) / 아래 줄: 댓글 수 + 해시태그
function renderPostCard(post, showAuthor) {
  const article = document.createElement('article');
  article.className = 'post';
  // ⋯ 메뉴(post-menu.js)가 읽는 값
  article.dataset.postId = String(post.id);
  if (post.author_id) article.dataset.authorId = post.author_id;
  if (post.profiles && post.profiles.nickname) article.dataset.nickname = post.profiles.nickname;

  if (showAuthor) {
    const name = post.profiles && post.profiles.nickname ? post.profiles.nickname : t('post.anonymous');
    const who = document.createElement(post.author_id && post.profiles ? 'a' : 'span');
    who.className = 'card-author';
    if (post.author_id && post.profiles) who.href = 'author.html?id=' + post.author_id;
    if (typeof createAvatar === 'function') {
      who.append(createAvatar(name, post.profiles ? post.profiles.avatar_path : null, true));
    }
    const nick = document.createElement('span');
    nick.className = 'card-nick';
    nick.textContent = name;
    who.append(nick);
    article.append(who);
  }

  const date = document.createElement('p');
  date.className = 'date card-meta';
  let dateText = new Date(post.created_at).toLocaleDateString(dateLocale());
  if (typeof postCategories === 'function') {
    const labels = postCategories(post).map(categoryLabel);
    if (labels.length) dateText += ' · ' + labels.join(', ');
  }
  date.textContent = dateText;
  article.append(date);

  const link = document.createElement('a');
  link.className = 'post-link';
  link.href = 'post.html?id=' + post.id;

  const main = document.createElement('div');
  main.className = 'card-main';

  const text = document.createElement('div');
  text.className = 'card-text';

  const h2 = document.createElement('h2');
  h2.textContent = post.title;

  const preview = document.createElement('p');
  preview.textContent = stripMarkdown(post.content);

  text.append(h2, preview);
  main.append(text);

  link.append(main);

  // 77일차: 사진은 카드 위에 크게, 여러 장이면 옆으로 넘겨 보기(대표 사진이 첫 장)
  const photos = cardPhotoPaths(post);
  if (photos.length > 0) article.append(createPhotoCarousel(photos, post));
  article.append(link);

  // 아래 줄: 왼쪽 댓글 수, 오른쪽 해시태그(길면 ... 으로 줄임)
  const foot = document.createElement('div');
  foot.className = 'card-foot';

  const count = post.comments && post.comments[0] && post.comments[0].count ? post.comments[0].count : 0;
  const comments = document.createElement('a');
  comments.className = 'card-comments';
  comments.href = 'post.html?id=' + post.id + '#comments';
  comments.setAttribute('aria-label', t('post.comment_count', { n: count }));
  comments.title = t('post.comment_count', { n: count });
  if (typeof navIcon === 'function') comments.append(navIcon('comment', 18));
  const num = document.createElement('span');
  num.textContent = String(count);
  comments.append(num);
  if (typeof createLikeButton === 'function') foot.append(createLikeButton(post.id));
  foot.append(comments);

  if (Array.isArray(post.tags) && post.tags.length > 0) {
    const tags = document.createElement('p');
    tags.className = 'card-tags';
    tags.setAttribute('aria-label', t('post.tags'));
    post.tags.forEach(function (tag, i) {
      if (i > 0) tags.append(' ');
      const a = document.createElement('a');
      a.href = 'index.html?tag=' + encodeURIComponent(tag);
      a.textContent = '#' + tag;
      tags.append(a);
    });
    foot.append(tags);
  }

  article.append(foot);
  return article;
}
