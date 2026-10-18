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

function sanitizeServerText(str, maxLen = 2000) {
  if (str === null || str === undefined) return '';
  let s = String(str);
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  s = s.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  s = s.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  s = s.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
  s = s.replace(/<[^>]*>/g, '');
  s = s.replace(/javascript\s*:/gi, '');
  s = s.replace(/vbscript\s*:/gi, '');
  s = s.replace(/data\s*:\s*text\/html/gi, '');
  s = s.replace(/on\w+\s*=/gi, '');
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  s = s.trim();
  if (maxLen && s.length > maxLen) s = s.substring(0, maxLen);
  return s;
}

function sanitizeServerUrl(url) {
  if (!url) return '';
  const s = String(url).trim();
  if (/^(https?:\/\/|\/|blob:|data:image\/(jpeg|png|webp|gif|svg\+xml);base64,)/i.test(s)) {
    return s.replace(/[<>"'`\\]/g, '');
  }
  return '';
}

function applyActionToDb(db, action, payload) {
  if (!db.courses) db.courses = [];
  if (!db.glossary) db.glossary = [];
  if (!db.categories) db.categories = [];
  if (!db.user_access_map) db.user_access_map = {};
  if (!db.settings) db.settings = { membership_price: 50.00, currency: 'USDT' };
  if (!db.orders) db.orders = [];
  if (!db.lifetime_users) db.lifetime_users = [];
  if (!db.payment_methods) db.payment_methods = [];

  if (action === 'SAVE_COURSE') {
    const course = {
      id: sanitizeServerText(payload.id, 60),
      title: sanitizeServerText(payload.title, 150),
      slug: sanitizeServerText(payload.slug, 150),
      category: sanitizeServerText(payload.category, 50),
      description: sanitizeServerText(payload.description, 2000),
      price: Math.max(0, parseFloat(payload.price) || 0),
      is_included_in_lifetime: payload.is_included_in_lifetime === true || payload.is_included_in_lifetime === 'true',
      thumbnail_url: sanitizeServerUrl(payload.thumbnail_url) || 'logo.png',
      video_url: sanitizeServerUrl(payload.video_url),
      is_published: true,
      created_by: sanitizeServerText(payload.created_by, 50) || 'Admin',
      created_at: payload.created_at || new Date().toISOString()
    };

    const idx = db.courses.findIndex(c => c.id === course.id);
    if (idx !== -1) {
      db.courses[idx] = { ...db.courses[idx], ...course };
    } else {
      db.courses.push(course);
    }
    // Sincronización atómica y sanitizada de glosario si viene en el curso
    if (Array.isArray(payload.glossary_terms)) {
      db.glossary = db.glossary.filter(g => g.course_id !== course.id);
      payload.glossary_terms.forEach(t => {
        if (t && t.term) {
          db.glossary.push({
            id: sanitizeServerText(t.id, 60) || ('g-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
            course_id: course.id,
            term: sanitizeServerText(t.term, 100),
            definition: sanitizeServerText(t.definition, 1000)
          });
        }
      });
    }
  } else if (action === 'DELETE_COURSE') {
    const courseId = sanitizeServerText(payload.id, 60);
    db.courses = db.courses.filter(c => c.id !== courseId);
    db.glossary = db.glossary.filter(g => g.course_id !== courseId);
    if (db.user_access_map && typeof db.user_access_map === 'object') {
      for (const uid in db.user_access_map) {
        if (Array.isArray(db.user_access_map[uid])) {
          db.user_access_map[uid] = db.user_access_map[uid].filter(id => id !== courseId);
        }
      }
    }
  } else if (action === 'SAVE_GLOSSARY') {
    const term = {
      id: sanitizeServerText(payload.id, 60),
      course_id: sanitizeServerText(payload.course_id, 60),
      term: sanitizeServerText(payload.term, 100),
      definition: sanitizeServerText(payload.definition, 1000)
    };
    const idx = db.glossary.findIndex(g => g.id === term.id);
    if (idx !== -1) {
      db.glossary[idx] = { ...db.glossary[idx], ...term };
    } else {
      db.glossary.push(term);
    }
  } else if (action === 'SAVE_GLOSSARY_BATCH') {
    const course_id = sanitizeServerText(payload.course_id, 60);
    db.glossary = db.glossary.filter(g => g.course_id !== course_id);
    if (Array.isArray(payload.terms)) {
      payload.terms.forEach(t => {
        if (t && t.term) {
          db.glossary.push({
            id: sanitizeServerText(t.id, 60) || ('g-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
            course_id: course_id,
            term: sanitizeServerText(t.term, 100),
            definition: sanitizeServerText(t.definition, 1000)
          });
        }
      });
    }
  } else if (action === 'DELETE_GLOSSARY') {
    const termId = sanitizeServerText(payload.id, 60);
    db.glossary = db.glossary.filter(g => g.id !== termId);
  } else if (action === 'SAVE_CATEGORY') {
    const cat = {
      id: sanitizeServerText(payload.id, 50),
      name: sanitizeServerText(payload.name, 60)
    };
    const idx = db.categories.findIndex(c => c.id === cat.id);
    if (idx !== -1) {
      db.categories[idx] = { ...db.categories[idx], ...cat };
    } else {
      db.categories.push(cat);
    }
  } else if (action === 'DELETE_CATEGORY') {
    const catId = sanitizeServerText(payload.id, 50);
    db.categories = db.categories.filter(c => c.id !== catId);
  } else if (action === 'TOGGLE_USER_COURSE') {
    const user_id = sanitizeServerText(payload.user_id, 60);
    const course_id = sanitizeServerText(payload.course_id, 60);
    const should_unlock = payload.should_unlock === true || payload.should_unlock === 'true';
    let list = db.user_access_map[user_id] ? [...db.user_access_map[user_id]] : [];
    if (should_unlock) {
      if (!list.includes(course_id)) list.push(course_id);
    } else {
      list = list.filter(id => id !== course_id);
    }
    db.user_access_map[user_id] = list;
  } else if (action === 'MERGE_ALL') {
    const { courses, glossary, categories, user_access_map } = payload;
    const mockCourseIds = ['course-1', 'course-2', 'course-3', 'course-4'];
    const mockGlossaryIds = ['g-1', 'g-2', 'g-3', 'g-4'];

    if (Array.isArray(courses)) {
      courses.forEach(lc => {
        if (lc && lc.id && !mockCourseIds.includes(lc.id)) {
          const idx = db.courses.findIndex(c => c.id === lc.id);
          if (idx !== -1) db.courses[idx] = { ...db.courses[idx], ...lc };
          else db.courses.push(lc);
        }
      });
    }
    if (Array.isArray(glossary)) {
      glossary.forEach(lg => {
        if (lg && lg.id && !mockGlossaryIds.includes(lg.id) && !mockCourseIds.includes(lg.course_id)) {
          const idx = db.glossary.findIndex(g => g.id === lg.id);
          if (idx !== -1) db.glossary[idx] = { ...db.glossary[idx], ...lg };
          else db.glossary.push(lg);
        }
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
  } else if (action === 'SAVE_SETTINGS') {
    if (!db.settings) db.settings = {};
    if (payload.membership_price !== undefined) {
      db.settings.membership_price = Math.max(0, parseFloat(payload.membership_price) || 0);
    }
    if (payload.currency) {
      db.settings.currency = sanitizeServerText(payload.currency, 10) || 'USDT';
    }
    db.settings.updated_at = new Date().toISOString();
  } else if (action === 'UPDATE_COURSE_PRICE') {
    const courseId = sanitizeServerText(payload.id, 60);
    const idx = db.courses.findIndex(c => c.id === courseId);
    if (idx !== -1) {
      if (payload.price !== undefined) {
        db.courses[idx].price = Math.max(0, parseFloat(payload.price) || 0);
      }
      if (payload.is_included_in_lifetime !== undefined) {
        db.courses[idx].is_included_in_lifetime = payload.is_included_in_lifetime === true || payload.is_included_in_lifetime === 'true';
      }
    }
  } else if (action === 'BATCH_UPDATE_PRICES') {
    if (payload.settings) {
      if (!db.settings) db.settings = {};
      if (payload.settings.membership_price !== undefined) {
        db.settings.membership_price = Math.max(0, parseFloat(payload.settings.membership_price) || 0);
      }
      if (payload.settings.currency) {
        db.settings.currency = sanitizeServerText(payload.settings.currency, 10) || 'USDT';
      }
      db.settings.updated_at = new Date().toISOString();
    }
    if (Array.isArray(payload.courses)) {
      payload.courses.forEach(cp => {
        const cId = sanitizeServerText(cp.id, 60);
        const idx = db.courses.findIndex(c => c.id === cId);
        if (idx !== -1) {
          if (cp.price !== undefined) {
            db.courses[idx].price = Math.max(0, parseFloat(cp.price) || 0);
          }
          if (cp.is_included_in_lifetime !== undefined) {
            db.courses[idx].is_included_in_lifetime = cp.is_included_in_lifetime === true || cp.is_included_in_lifetime === 'true';
          }
        }
      });
    }
  } else if (action === 'SAVE_ORDER') {
    if (!db.orders) db.orders = [];
    const order = {
      id: sanitizeServerText(payload.id, 60) || ('ord-' + Date.now()),
      user_id: sanitizeServerText(payload.user_id, 60),
      user_name: sanitizeServerText(payload.user_name, 100),
      user_email: sanitizeServerText(payload.user_email, 100),
      course_id: payload.course_id ? sanitizeServerText(payload.course_id, 60) : null,
      course_title: sanitizeServerText(payload.course_title, 150) || 'Membresía Vitalicia',
      order_type: sanitizeServerText(payload.order_type, 40) || 'LIFETIME_MEMBERSHIP',
      amount: Math.max(0, parseFloat(payload.amount) || 0),
      currency: sanitizeServerText(payload.currency, 10) || 'USDT',
      payment_method_title: sanitizeServerText(payload.payment_method_title, 80),
      reference_number: sanitizeServerText(payload.reference_number, 100),
      receipt_file_url: sanitizeServerUrl(payload.receipt_file_url) || payload.receipt_file_url || 'logo.png',
      user_notes: sanitizeServerText(payload.user_notes, 500),
      status: 'PENDING_REVIEW',
      created_at: payload.created_at || new Date().toISOString()
    };
    const idx = db.orders.findIndex(o => o.id === order.id);
    if (idx !== -1) {
      db.orders[idx] = { ...db.orders[idx], ...order };
    } else {
      db.orders.unshift(order);
    }
    if (db.orders.length > 300) {
      db.orders = db.orders.slice(0, 300);
    }
  } else if (action === 'APPROVE_ORDER') {
    if (!db.orders) db.orders = [];
    const orderId = sanitizeServerText(payload.order_id, 60);
    const reviewedBy = sanitizeServerText(payload.reviewed_by, 50) || 'Admin';
    const idx = db.orders.findIndex(o => o.id === orderId);
    let order = null;
    if (idx !== -1) {
      db.orders[idx].status = 'APPROVED';
      db.orders[idx].reviewed_by = reviewedBy;
      db.orders[idx].reviewed_at = new Date().toISOString();
      order = db.orders[idx];
    }
    const userId = payload.user_id || (order ? order.user_id : null);
    const courseId = payload.course_id || (order ? order.course_id : null);
    const isLifetime = payload.is_lifetime || (order ? (order.order_type === 'LIFETIME_MEMBERSHIP' || !order.course_id) : false);

    if (userId) {
      if (isLifetime) {
        if (!db.lifetime_users) db.lifetime_users = [];
        if (!db.lifetime_users.includes(userId)) db.lifetime_users.push(userId);
      }
      if (courseId) {
        if (!db.user_access_map) db.user_access_map = {};
        if (!db.user_access_map[userId]) db.user_access_map[userId] = [];
        if (!db.user_access_map[userId].includes(courseId)) {
          db.user_access_map[userId].push(courseId);
        }
      }
    }
  } else if (action === 'REJECT_ORDER') {
    if (!db.orders) db.orders = [];
    const orderId = sanitizeServerText(payload.order_id, 60);
    const reason = sanitizeServerText(payload.rejection_reason, 500);
    const reviewedBy = sanitizeServerText(payload.reviewed_by, 50) || 'Admin';
    const idx = db.orders.findIndex(o => o.id === orderId);
    if (idx !== -1) {
      db.orders[idx].status = 'REJECTED';
      db.orders[idx].rejection_reason = reason;
      db.orders[idx].reviewed_by = reviewedBy;
      db.orders[idx].reviewed_at = new Date().toISOString();
    }
  } else if (action === 'DELETE_STUDENT_CASCADE') {
    const userId = sanitizeServerText(payload.user_id, 60);
    const userEmail = sanitizeServerText(payload.user_email, 100).toLowerCase();
    const userName = sanitizeServerText(payload.user_name, 100).toLowerCase();

    // 1. Eliminar órdenes del estudiante
    if (Array.isArray(db.orders)) {
      db.orders = db.orders.filter(o => {
        if (userId && o.user_id === userId) return false;
        if (userEmail && o.user_email && o.user_email.toLowerCase() === userEmail) return false;
        if (userName && o.user_name && o.user_name.toLowerCase() === userName) return false;
        return true;
      });
    }

    // 2. Eliminar accesos a cursos
    if (db.user_access_map && userId) {
      delete db.user_access_map[userId];
    }

    // 3. Eliminar de membresía vitalicia
    if (Array.isArray(db.lifetime_users) && userId) {
      db.lifetime_users = db.lifetime_users.filter(id => id !== userId);
    }

    // 4. Si existen usuarios almacenados en la nube, purgarlo
    if (Array.isArray(db.users)) {
      db.users = db.users.filter(u => {
        if (userId && u.id === userId) return false;
        if (userEmail && u.email && u.email.toLowerCase() === userEmail) return false;
        if (userName && u.username && u.username.toLowerCase() === userName) return false;
        return true;
      });
    }
  } else if (action === 'SAVE_PAYMENT_METHOD') {
    if (!db.payment_methods) db.payment_methods = [];
    const method = {
      id: sanitizeServerText(payload.id, 60) || ('pm-' + Date.now()),
      title: sanitizeServerText(payload.title, 100),
      method_type: sanitizeServerText(payload.method_type, 40) || 'PAGO_MOVIL',
      currency: sanitizeServerText(payload.currency, 20) || 'USDT',
      account_identifier: sanitizeServerText(payload.account_identifier, 300),
      network: sanitizeServerText(payload.network, 100),
      account_holder: sanitizeServerText(payload.account_holder, 150),
      instructions: sanitizeServerText(payload.instructions, 1500),
      qr_image_url: sanitizeServerUrl(payload.qr_image_url) || 'logo.png',
      is_active: payload.is_active !== false && payload.is_active !== 'false'
    };
    const idx = db.payment_methods.findIndex(m => m.id === method.id);
    if (idx !== -1) {
      db.payment_methods[idx] = { ...db.payment_methods[idx], ...method };
    } else {
      db.payment_methods.push(method);
    }
  } else if (action === 'DELETE_PAYMENT_METHOD') {
    if (!db.payment_methods) db.payment_methods = [];
    const methodId = sanitizeServerText(payload.id, 60);
    db.payment_methods = db.payment_methods.filter(m => m.id !== methodId);
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
      orders: [],
      settings: { membership_price: 50.00, currency: 'USDT' },
      payment_methods: []
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
