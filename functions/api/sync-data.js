/**
 * PROFITIVO — Cloudflare Pages Function: Cloud Database Sync
 * Endpoint: /api/sync-data
 * Sincronización 100% Web en Tiempo Real (GitHub Contents API oficial)
 * Elimina completamente el uso de raw CDN con lag de 5 minutos.
 */

const GITHUB_TOKEN = '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';
const OWNER = 'puneta29';
const REPO = 'profitivo-videos';
const FILE_PATH = 'data/profitivo_cloud_db.json';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cache-Control, Pragma',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0'
};

// Decodificación y codificación UTF-8 segura para español, acentos y emojis
function decodeUtf8Base64(base64) {
  const clean = base64.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function encodeUtf8Base64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// Caché en memoria del Worker para respuestas ultra rápidas
let memoryDb = null;
let memorySha = null;
let memoryTimestamp = 0;

async function fetchFromGitHub(force = false) {
  if (!force && memoryDb && (Date.now() - memoryTimestamp < 45000)) {
    return { sha: memorySha, data: memoryDb };
  }

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Profitivo-Cloudflare-Worker',
      'Cache-Control': 'no-cache'
    }
  });

  if (res.status === 404) {
    return { sha: null, data: null };
  }

  if (!res.ok) {
    const errText = await res.text();
    // Si falla la consulta y tenemos caché en memoria, retornar caché
    if (memoryDb) return { sha: memorySha, data: memoryDb };
    throw new Error(`GitHub fetch failed (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const decodedStr = decodeUtf8Base64(json.content);
  const parsedData = JSON.parse(decodedStr);

  memoryDb = parsedData;
  memorySha = json.sha;
  memoryTimestamp = Date.now();

  return { sha: json.sha, data: parsedData };
}

function applyActionToDb(db, action, payload) {
  if (!db.courses) db.courses = [];
  if (!db.glossary) db.glossary = [];
  if (!db.categories) db.categories = [];
  if (!db.user_access_map) db.user_access_map = {};

  if (action === 'SAVE_COURSE') {
    const course = payload;
    const idx = db.courses.findIndex(c => c.id === course.id);
    if (idx !== -1) {
      db.courses[idx] = { ...db.courses[idx], ...course };
    } else {
      db.courses.push(course);
    }
    // Sincronización atómica de glosario si viene en el curso
    if (Array.isArray(course.glossary_terms)) {
      db.glossary = db.glossary.filter(g => g.course_id !== course.id);
      course.glossary_terms.forEach(t => {
        if (t && t.term) {
          db.glossary.push({
            id: t.id || ('g-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
            course_id: course.id,
            term: t.term,
            definition: t.definition || ''
          });
        }
      });
    }
  } else if (action === 'DELETE_COURSE') {
    const courseId = payload.id;
    db.courses = db.courses.filter(c => c.id !== courseId);
    db.glossary = db.glossary.filter(g => g.course_id !== courseId);
  } else if (action === 'SAVE_GLOSSARY') {
    const term = payload;
    const idx = db.glossary.findIndex(g => g.id === term.id);
    if (idx !== -1) {
      db.glossary[idx] = { ...db.glossary[idx], ...term };
    } else {
      db.glossary.push(term);
    }
  } else if (action === 'SAVE_GLOSSARY_BATCH') {
    const { course_id, terms } = payload;
    db.glossary = db.glossary.filter(g => g.course_id !== course_id);
    if (Array.isArray(terms)) {
      db.glossary.push(...terms);
    }
  } else if (action === 'DELETE_GLOSSARY') {
    const termId = payload.id;
    db.glossary = db.glossary.filter(g => g.id !== termId);
  } else if (action === 'SAVE_CATEGORY') {
    const cat = payload;
    const idx = db.categories.findIndex(c => c.id === cat.id);
    if (idx !== -1) {
      db.categories[idx] = { ...db.categories[idx], ...cat };
    } else {
      db.categories.push(cat);
    }
  } else if (action === 'DELETE_CATEGORY') {
    const catId = payload.id;
    db.categories = db.categories.filter(c => c.id !== catId);
  } else if (action === 'TOGGLE_USER_COURSE') {
    const { user_id, course_id, should_unlock } = payload;
    let list = db.user_access_map[user_id] ? [...db.user_access_map[user_id]] : [];
    if (should_unlock) {
      if (!list.includes(course_id)) list.push(course_id);
    } else {
      list = list.filter(id => id !== course_id);
    }
    db.user_access_map[user_id] = list;
  } else if (action === 'MERGE_ALL') {
    const { courses, glossary, categories, user_access_map } = payload;
    if (Array.isArray(courses)) {
      courses.forEach(lc => {
        const idx = db.courses.findIndex(c => c.id === lc.id);
        if (idx !== -1) db.courses[idx] = { ...db.courses[idx], ...lc };
        else db.courses.push(lc);
      });
    }
    if (Array.isArray(glossary)) {
      glossary.forEach(lg => {
        const idx = db.glossary.findIndex(g => g.id === lg.id);
        if (idx !== -1) db.glossary[idx] = { ...db.glossary[idx], ...lg };
        else db.glossary.push(lg);
      });
    }
    if (Array.isArray(categories)) {
      categories.forEach(lcat => {
        const idx = db.categories.findIndex(c => c.id === lcat.id);
        if (idx !== -1) db.categories[idx] = lcat;
        else db.categories.push(lcat);
      });
    }
    if (user_access_map && typeof user_access_map === 'object') {
      for (const [uid, cids] of Object.entries(user_access_map)) {
        if (!db.user_access_map[uid]) db.user_access_map[uid] = [];
        cids.forEach(cid => {
          if (!db.user_access_map[uid].includes(cid)) {
            db.user_access_map[uid].push(cid);
          }
        });
      }
    }
  }
}

async function writeToGitHubWithRetry(action, payload, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const current = await fetchFromGitHub(true);
    let db = current.data || {
      version: 1,
      courses: [],
      glossary: [],
      categories: [],
      user_access_map: {},
      orders: []
    };

    applyActionToDb(db, action, payload);
    db.updated_at = new Date().toISOString();

    const base64Content = encodeUtf8Base64(JSON.stringify(db, null, 2));
    const body = {
      message: `Profitivo Cloud Sync: ${action} [${new Date().toISOString()}]`,
      content: base64Content
    };
    if (current.sha) {
      body.sha = current.sha;
    }

    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Profitivo-Cloudflare-Worker'
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const putRes = await res.json();
      const newSha = putRes.content?.sha || current.sha;
      memoryDb = db;
      memorySha = newSha;
      memoryTimestamp = Date.now();
      return db;
    }

    if (res.status === 409 && attempt < maxRetries) {
      // Conflicto de SHA concurrente: reintentar con el SHA más reciente
      await new Promise(r => setTimeout(r, 250 * attempt));
      continue;
    }

    const errText = await res.text();
    throw new Error(`GitHub save failed (${res.status}): ${errText}`);
  }
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const force = url.searchParams.get('_force') === 'true';
    const result = await fetchFromGitHub(force);
    return new Response(JSON.stringify({ success: true, data: result.data, sha: result.sha }), {
      status: 200,
      headers: CORS_HEADERS
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { action, payload } = body;

    const updatedDb = await writeToGitHubWithRetry(action, payload);

    return new Response(JSON.stringify({ success: true, data: updatedDb }), {
      status: 200,
      headers: CORS_HEADERS
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}
