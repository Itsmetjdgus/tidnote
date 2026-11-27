// 79일차: "번역 보기" 서버 함수 (Supabase Edge Function, Deno)
// 화면에서 { post_id, target } 를 보내면, 그 사람이 볼 수 있는 글일 때만 DeepL로 번역해 돌려준다.
// - DeepL 키는 서버 비밀값(DEEPL_API_KEY)에만 있다. 화면 코드·저장소에는 절대 넣지 않는다.
// - 글 읽기는 "요청한 사람의 로그인"으로 한다 → 비공개 계정·차단 규칙(RLS)이 그대로 적용된다.
// - 같은 글·같은 언어는 한 번만 번역해 post_translations 에 저장하고 다시 쓴다(글이 바뀌면 다시 번역).
// - 한 사람이 하루에 새로 번역할 수 있는 횟수를 제한해 무료 한도(월 50만 자)를 지킨다.
// 배포: supabase functions deploy translate --no-verify-jwt   (로그인 확인은 아래에서 직접 한다)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const DAILY_LIMIT = 30; // 한 사람이 하루에 새로 번역할 수 있는 글 수(저장된 번역을 다시 보는 것은 세지 않음)
const MAX_CHARS = 6000; // 글 하나에서 번역할 최대 글자 수
const TARGETS = new Set([
  'AR', 'BG', 'CS', 'DA', 'DE', 'EL', 'EN-GB', 'EN-US', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT', 'JA', 'KO',
  'LT', 'LV', 'NB', 'NL', 'PL', 'PT-BR', 'PT-PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH-HANS',
]);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 글을 줄 단위로 나눠, 번역할 글자만 뽑는다. 사진 자리·구분선·빈 줄은 그대로 두고, 줄 앞 서식(## > - 1.)은 떼었다 붙인다
const PHOTO = /^\[(사진|photo)\d{1,2}\][ \t]*$/i;
const HR = /^[ \t]*---+[ \t]*$/;
const PREFIX = /^(#{2,3}[ \t]+|>[ \t]?|-[ \t]+|\d{1,3}\.[ \t]+)/;

type Piece = { keep: string } | { prefix: string; text: string };

function split(content: string): Piece[] {
  return content.replace(/\r\n?/g, '\n').split('\n').map((line): Piece => {
    if (line.trim() === '' || PHOTO.test(line) || HR.test(line)) return { keep: line };
    const m = PREFIX.exec(line);
    const prefix = m ? m[0] : '';
    const text = line.slice(prefix.length);
    return text.trim() === '' ? { keep: line } : { prefix, text };
  });
}

async function deepl(texts: string[], target: string, key: string) {
  // DEEPL_API_URL 은 시험용(가짜 DeepL 서버). 실제 배포에서는 넣지 않는다
  const host = Deno.env.get('DEEPL_API_URL') || (key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com');
  const out: string[] = [];
  let detected = '';
  for (let i = 0; i < texts.length; i += 50) {
    const res = await fetch(host + '/v2/translate', {
      method: 'POST',
      headers: { Authorization: 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: texts.slice(i, i + 50), target_lang: target, preserve_formatting: true }),
    });
    if (res.status === 456) throw new Error('quota');
    if (!res.ok) throw new Error('deepl_' + res.status);
    const data = await res.json();
    for (const t of data.translations) {
      out.push(t.text);
      if (!detected) detected = t.detected_source_language || '';
    }
  }
  return { out, detected };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);

  const KEY = Deno.env.get('DEEPL_API_KEY');
  const URL_ = Deno.env.get('SUPABASE_URL');
  const ANON = Deno.env.get('SUPABASE_ANON_KEY');
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!KEY || !URL_ || !ANON || !SERVICE) return reply({ error: 'not_configured' }, 503);

  let body: { post_id?: number; target?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'bad_request' }, 400);
  }
  const postId = Number(body.post_id);
  const target = String(body.target || '').toUpperCase();
  if (!Number.isInteger(postId) || postId <= 0 || !TARGETS.has(target)) return reply({ error: 'bad_request' }, 400);

  // 로그인 확인
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData && userData.user;
  if (!user) return reply({ error: 'login_required' }, 401);

  // 요청한 사람의 권한으로 글 읽기(볼 수 없는 글이면 없음)
  const asUser = createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: 'Bearer ' + token } },
  });
  const { data: post } = await asUser.from('posts').select('id, title, content').eq('id', postId).maybeSingle();
  if (!post) return reply({ error: 'not_found' }, 404);

  const hash = await sha256(post.title + '\n' + post.content);
  const { data: cached } = await admin
    .from('post_translations')
    .select('source_hash, title, content, detected')
    .eq('post_id', postId)
    .eq('target', target)
    .maybeSingle();
  if (cached && cached.source_hash === hash) {
    return reply({ title: cached.title, content: cached.content, detected: cached.detected, cached: true });
  }

  // 하루 사용 횟수
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin
    .from('translation_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since);
  if ((count || 0) >= DAILY_LIMIT) return reply({ error: 'too_many' }, 429);

  // 번역할 조각 만들기(제목 + 본문 줄들), 길면 앞부분까지만
  const pieces = split(post.content);
  const texts: string[] = [post.title];
  let chars = post.title.length;
  const idx: number[] = [];
  pieces.forEach((p, i) => {
    if ('text' in p && chars + p.text.length <= MAX_CHARS) {
      texts.push(p.text);
      idx.push(i);
      chars += p.text.length;
    }
  });

  let result;
  try {
    result = await deepl(texts, target, KEY);
  } catch (e) {
    const msg = String((e as Error).message || e);
    return reply({ error: msg === 'quota' ? 'quota' : 'translate_failed' }, msg === 'quota' ? 503 : 502);
  }

  const lines = pieces.map((p) => ('keep' in p ? p.keep : p.prefix + p.text));
  idx.forEach((pieceIndex, k) => {
    const p = pieces[pieceIndex] as { prefix: string; text: string };
    lines[pieceIndex] = p.prefix + result.out[k + 1];
  });
  const translated = { title: result.out[0], content: lines.join('\n'), detected: result.detected };

  await admin.from('translation_log').insert({ user_id: user.id, chars });
  await admin.from('translation_log').delete().eq('user_id', user.id).lt('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());
  await admin.from('post_translations').upsert({
    post_id: postId,
    target,
    source_hash: hash,
    title: translated.title,
    content: translated.content,
    detected: translated.detected,
    created_at: new Date().toISOString(),
  });

  return reply({ ...translated, cached: false, partial: idx.length < pieces.filter((p) => 'text' in p).length });
});
