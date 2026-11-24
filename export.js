// 64일차: 설정 > 내 활동 > 내 글 내보내기(백업).
// 내 글·내가 쓴 댓글·임시저장 글과 글 사진 원본을 ZIP 파일 하나로 받는다. 모두 이 브라우저 안에서 만들고, 서버로 보내는 것은 없다.
// ZIP 안: 읽기용 tidnote-posts.txt, 다시 쓰기 좋은 tidnote-data.json, photos/ 폴더(글 사진)
(function () {
  const btn = document.getElementById('export-btn');
  const msg = document.getElementById('export-message');
  if (!btn) return;

  // ---- 아주 작은 ZIP 만들기(압축 없이 묶기만. 사진은 이미 압축돼 있어서 크기 차이가 거의 없다) ----
  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function makeZip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    files.forEach(function (f) {
      const name = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // 파일 이름이 UTF-8(한글 이름이 깨지지 않게)
      local.setUint16(8, 0, true); // 압축 없음
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, dosTime, true);
      cen.setUint16(14, dosDate, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const centralSize = central.reduce(function (n, p) { return n + p.length; }, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  // 여러 쪽으로 나눠 모두 읽기(한 번에 최대 1000줄씩)
  async function readAll(build) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build().range(from, from + 999);
      if (error) throw error;
      out.push.apply(out, data || []);
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  function stamp(at) {
    return new Date(at).toLocaleString(dateLocale());
  }

  // 읽기용 파일에는 서식 기호를 빼고 글자만(원본 그대로는 .json 에 들어 있다)
  function plainBody(text, postId) {
    return String(text).replace(/\r\n?/g, '\n').split('\n').map(function (line) {
      const photo = /^\[(?:사진|photo)(\d{1,2})\][ \t]*$/i.exec(line);
      if (photo) return '[' + t('photo.n', { n: Number(photo[1]) }) + ': photos/' + postId + '-' + photo[1] + '.jpg]';
      if (/^[ \t]*---+[ \t]*$/.test(line)) return '────────';
      line = line.replace(/^#{2,3}[ \t]+/, '').replace(/^>[ \t]?/, '│ ').replace(/^-[ \t]+/, '• ');
      return line
        .replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s()]{1,500})\)/g, '$1 ($2)')
        .replace(/\*\*\*(\S(?:.*?\S)?)\*\*\*/g, '$1')
        .replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '$1')
        .replace(/~~(\S(?:.*?\S)?)~~/g, '$1')
        .replace(/\*([^\s*](?:[^*\n]*?[^\s*])?)\*/g, '$1');
    }).join('\n');
  }

  function postText(p) {
    const cats = (Array.isArray(p.categories) && p.categories.length ? p.categories : [p.category]).filter(Boolean).map(categoryLabel).join(', ');
    const lines = ['■ ' + p.title, stamp(p.created_at) + (cats ? ' · ' + cats : '')];
    if (Array.isArray(p.tags) && p.tags.length) lines.push(p.tags.map(function (x) { return '#' + x; }).join(' '));
    if (Array.isArray(p.images) && p.images.length) {
      lines.push(t('export.photos_line', { list: p.images.map(function (path, i) { return '[' + (i + 1) + '] photos/' + p.id + '-' + (i + 1) + '.jpg'; }).join(', ') }));
    }
    lines.push('', plainBody(p.content, p.id), '', '----------------------------------------', '');
    return lines.join('\n');
  }

  btn.addEventListener('click', async function () {
    const { data: sessionData } = await db.auth.getSession();
    const session = sessionData.session;
    if (!session) return;
    const uid = session.user.id;

    btn.disabled = true;
    msg.className = 'form-message';
    msg.textContent = t('export.reading');
    try {
      const posts = await readAll(function () {
        return db.from('posts')
          .select('id, title, content, category, categories, tags, images, image_path, created_at')
          .eq('author_id', uid)
          .order('created_at', { ascending: true });
      });
      const comments = await readAll(function () {
        return db.from('comments')
          .select('id, post_id, content, created_at')
          .eq('author_id', uid)
          .order('created_at', { ascending: true });
      });
      let drafts = [];
      try {
        drafts = await readAll(function () {
          return db.from('post_drafts')
            .select('title, content, categories, tags, updated_at')
            .order('updated_at', { ascending: true });
        });
      } catch (e) {
        drafts = []; // 임시저장 표가 없어도 나머지는 받는다
      }

      const enc = new TextEncoder();
      const files = [];

      // 사진 원본
      const photoJobs = [];
      posts.forEach(function (p) {
        (Array.isArray(p.images) ? p.images : []).forEach(function (path, i) {
          photoJobs.push({ path: path, name: 'photos/' + p.id + '-' + (i + 1) + '.jpg' });
        });
      });
      let failedPhotos = 0;
      for (let i = 0; i < photoJobs.length; i++) {
        msg.textContent = t('export.photos', { i: i + 1, n: photoJobs.length });
        const { data: blob, error } = await db.storage.from('post-images').download(photoJobs[i].path);
        if (error || !blob) {
          failedPhotos++;
          continue;
        }
        files.push({ name: photoJobs[i].name, data: new Uint8Array(await blob.arrayBuffer()) });
      }

      // 읽기용 글자 파일
      const head = [
        t('export.txt_title'),
        t('export.txt_meta', { date: stamp(new Date()), posts: posts.length, comments: comments.length }),
        '========================================',
        '',
      ].join('\n');
      let txt = head + posts.map(postText).join('');
      if (drafts.length) {
        txt += '\n' + t('export.txt_drafts') + '\n\n' + drafts.map(function (d) {
          return '□ ' + (d.title || t('draft.untitled')) + '\n' + stamp(d.updated_at) + '\n\n' + plainBody(d.content, 0) + '\n\n----------------------------------------\n';
        }).join('\n');
      }
      if (comments.length) {
        txt += '\n' + t('export.txt_comments') + '\n\n' + comments.map(function (c) {
          return stamp(c.created_at) + ' (post.html?id=' + c.post_id + ')\n' + c.content + '\n';
        }).join('\n');
      }
      files.unshift({ name: 'tidnote-posts.txt', data: enc.encode('﻿' + txt.replace(/\n/g, '\r\n')) });

      // 데이터 파일
      const json = {
        exported_at: new Date().toISOString(),
        format: 'tidnote-export-1',
        posts: posts,
        comments: comments,
        drafts: drafts,
      };
      files.splice(1, 0, { name: 'tidnote-data.json', data: enc.encode(JSON.stringify(json, null, 2)) });

      const zip = makeZip(files);
      const day = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zip);
      a.download = 'tidnote-backup-' + day + '.zip';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);

      msg.className = 'form-message ok';
      msg.textContent = t('export.done', { posts: posts.length, photos: photoJobs.length - failedPhotos }) +
        (failedPhotos ? ' ' + t('export.photo_failed', { n: failedPhotos }) : '');
    } catch (e) {
      console.error(e);
      msg.textContent = t('export.failed');
    }
    btn.disabled = false;
  });
})();
