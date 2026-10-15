/**
 * PROFITIVO — Cloudflare Pages Function: Cloud Database Sync
 * Endpoint: /api/sync-data
 * Sincroniza cursos, glosarios, categorías y accesos de estudiantes en la nube
 * utilizando el repositorio oficial de GitHub de la empresa (puneta29/profitivo-videos).
 */

const GITHUB_TOKEN = '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';
const OWNER = 'puneta29';
const REPO = 'profitivo-videos';
const FILE_PATH = 'data/profitivo_cloud_db.json';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

async function fetchFromGitHub() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Profitivo-Cloudflare-Worker'
    }
  });

  if (res.status === 404) {
    return { sha: null, data: null };
  }

  const json = await res.json();
  const content = atob(json.content.replace(/\s/g, ''));
  return { sha: json.sha, data: JSON.parse(content) };
}

async function writeToGitHub(newData, existingSha = null) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
  
  let sha = existingSha;
  if (!sha) {
    const current = await fetchFromGitHub();
    sha = current.sha;
  }

  const body = {
    message: `Profitivo Cloud Sync update [${new Date().toISOString()}]`,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(newData, null, 2))))
  };
  if (sha) {
    body.sha = sha;
  }

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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub save failed (${res.status}): ${errText}`);
  }

  return await res.json();
}

export async function onRequestGet() {
  try {
    // 1. Intentar leer rápido por raw CDN
    const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${FILE_PATH}?_t=${Date.now()}`;
    const rawRes = await fetch(rawUrl, {
      headers: { 'User-Agent': 'Profitivo-Cloudflare-Worker' }
    });

    if (rawRes.ok) {
      const data = await rawRes.json();
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: CORS_HEADERS
      });
    }

    // 2. Si falla raw, consultar API de GitHub
    const gh = await fetchFromGitHub();
    return new Response(JSON.stringify({ success: true, data: gh.data, sha: gh.sha }), {
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

    // Obtener estado actual
    const current = await fetchFromGitHub();
    let db = current.data || {
      version: 1,
      courses: [],
      glossary: [],
      categories: [],
      user_access_map: {},
      orders: []
    };

    if (action === 'SAVE_COURSE') {
      const course = payload;
      const idx = db.courses.findIndex(c => c.id === course.id);
      if (idx !== -1) {
        db.courses[idx] = { ...db.courses[idx], ...course };
      } else {
        db.courses.push(course);
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
      // Reemplazar o agregar los términos de este curso
      db.glossary = db.glossary.filter(g => g.course_id !== course_id);
      db.glossary.push(...terms);
    } else if (action === 'DELETE_GLOSSARY') {
      const termId = payload.id;
      db.glossary = db.glossary.filter(g => g.id !== termId);
    } else if (action === 'SAVE_CATEGORY') {
      const cat = payload;
      if (!db.categories) db.categories = [];
      const idx = db.categories.findIndex(c => c.id === cat.id);
      if (idx !== -1) {
        db.categories[idx] = cat;
      } else {
        db.categories.push(cat);
      }
    } else if (action === 'DELETE_CATEGORY') {
      const catId = payload.id;
      if (!db.categories) db.categories = [];
      db.categories = db.categories.filter(c => c.id !== catId);
    } else if (action === 'TOGGLE_USER_COURSE') {
      const { user_id, course_id, should_unlock } = payload;
      if (!db.user_access_map) db.user_access_map = {};
      let list = db.user_access_map[user_id] ? [...db.user_access_map[user_id]] : [];
      if (should_unlock) {
        if (!list.includes(course_id)) list.push(course_id);
      } else {
        list = list.filter(id => id !== course_id);
      }
      db.user_access_map[user_id] = list;
    } else if (action === 'MERGE_ALL') {
      // Sincronización bidireccional desde localStorage
      const { courses, glossary, categories, user_access_map } = payload;
      
      // Merge courses
      if (Array.isArray(courses)) {
        courses.forEach(lc => {
          const idx = db.courses.findIndex(c => c.id === lc.id);
          if (idx !== -1) {
            db.courses[idx] = { ...db.courses[idx], ...lc };
          } else {
            db.courses.push(lc);
          }
        });
      }

      // Merge glossary
      if (Array.isArray(glossary)) {
        glossary.forEach(lg => {
          const idx = db.glossary.findIndex(g => g.id === lg.id);
          if (idx !== -1) {
            db.glossary[idx] = { ...db.glossary[idx], ...lg };
          } else {
            db.glossary.push(lg);
          }
        });
      }

      // Merge categories
      if (Array.isArray(categories)) {
        if (!db.categories) db.categories = [];
        categories.forEach(lcat => {
          const idx = db.categories.findIndex(c => c.id === lcat.id);
          if (idx !== -1) {
            db.categories[idx] = lcat;
          } else {
            db.categories.push(lcat);
          }
        });
      }

      // Merge user_access_map
      if (user_access_map && typeof user_access_map === 'object') {
        if (!db.user_access_map) db.user_access_map = {};
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

    db.updated_at = new Date().toISOString();
    await writeToGitHub(db, current.sha);

    return new Response(JSON.stringify({ success: true, data: db }), {
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
