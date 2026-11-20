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

function renderPostCard(post, showAuthor) {
  const article = document.createElement('article');
  article.className = 'post';

  const link = document.createElement('a');
  link.className = 'post-link';
  link.href = 'post.html?id=' + post.id;

  const h2 = document.createElement('h2');
  h2.textContent = post.title;

  const date = document.createElement('p');
  date.className = 'date';
  let dateText = new Date(post.created_at).toLocaleDateString(dateLocale());
  if (showAuthor) {
    const name = post.profiles && post.profiles.nickname ? post.profiles.nickname : t('post.anonymous');
    dateText += ' · ' + t('post.by_label') + name;
  }
  if (post.category && typeof categoryLabel === 'function') {
    dateText += ' · ' + categoryLabel(post.category);
  }
  date.textContent = dateText;

  const preview = document.createElement('p');
  preview.textContent = post.content.slice(0, 100);

  if (post.image_path) {
    const img = document.createElement('img');
    img.dataset.imagePath = post.image_path; // 실제 주소는 fillPostImages가 채운다
    img.alt = post.title;
    img.className = 'post-thumb';
    img.loading = 'lazy';
    link.append(img);
  }
  link.append(h2, date, preview);
  article.append(link);
  return article;
}