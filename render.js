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

// 글 카드. showAuthor 가 true 이면(홈) 맨 위에 [프로필 사진 + 닉네임]이 붙고, 작성자 화면에서는 붙지 않는다.
// 구조: 작성자 줄 / 날짜·카테고리 / (제목·미리보기 + 오른쪽 미리보기 사진) / 아래 줄: 댓글 수 + 해시태그
function renderPostCard(post, showAuthor) {
  const article = document.createElement('article');
  article.className = 'post';

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
  if (post.category && typeof categoryLabel === 'function') {
    dateText += ' · ' + categoryLabel(post.category);
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
  preview.textContent = post.content.slice(0, 100);

  text.append(h2, preview);
  main.append(text);

  if (post.image_path) {
    const img = document.createElement('img');
    img.dataset.imagePath = post.image_path; // 실제 주소는 fillPostImages가 채운다
    img.alt = post.title;
    img.className = 'post-thumb';
    img.loading = 'lazy';
    main.append(img);
  }
  link.append(main);
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
