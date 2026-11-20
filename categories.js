// 글 카테고리(분류) 9개. 아래 영문 이름(slug)은 DB의 posts.category 와 똑같아야 한다.
// 화면에 보이는 이름은 i18n.js 의 cat.<slug> 문구이다. 순서를 바꾸면 화면의 순서가 바뀐다.
const CATEGORIES = ['daily', 'travel', 'food', 'language', 'it', 'hobby', 'study', 'culture', 'etc'];

function isCategory(value) {
  return CATEGORIES.indexOf(value) !== -1;
}

function categoryLabel(slug) {
  return isCategory(slug) ? t('cat.' + slug) : '';
}
