/**
 * PROFITIVO — Conexión y Gestión de Datos (Supabase / Cloudflare Pages)
 * Configurado para conectarse directamente con la base de datos y storage de Supabase.
 * Incluye almacenamiento local de respaldo para pruebas inmediatas en navegador.
 */

// ==============================================================================
// 1. CREDENCIALES DE SUPABASE OFICIALES (PROFITIVO)
// ==============================================================================
const SUPABASE_URL = "https://xvzcgjtubwunpaxlqodm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2emNnanR1Ynd1bnBheGxxb2RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDk1NTIsImV4cCI6MjEwNzQ4NTU1Mn0.kcCZ7hBHS_Xgof8QWNCMQvyE2N2D29mvqolomo7MzuY";

const isSupabaseConfigured = () => {
  return SUPABASE_URL && !SUPABASE_URL.includes("TU_PROYECTO") && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 50;
};

// Cliente REST inteligente con fallback automático a localStorage
async function sbFetch(path, options = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': options.prefer || 'return=representation',
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      return null; // Si las tablas aún no están creadas en Supabase, activa fallback seguro
    }
    return await res.json();
  } catch (err) {
    console.warn(`Supabase network fallback (${path}):`, err);
    return null;
  }
}


// ==============================================================================
// 1.1 BASE DE DATOS WEB EN LA NUBE (PROFITIVO CLOUD DATABASE)
// 100% WEB: NO almacena nada en el computador local.
// Todos los cursos, glosarios, categorías y accesos se gestionan directamente vía web.
// ==============================================================================
const PROFITIVO_CLOUD_CONFIG = {
  ENDPOINT: '/api/sync-data',
  GITHUB_API: 'https://api.github.com/repos/puneta29/profitivo-videos/contents/data/profitivo_cloud_db.json',
  GITHUB_TOKEN: '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'
};

const ProfitivoCloudDB = {
  _cache: null,
  _lastUpdated: 0,

  fetchCloud: async function(force = false) {
    // Si tenemos datos en caché actualizados hace menos de 3.5 segundos, usarlos directamente para no sufrir condiciones de carrera
    if (!force && this._cache && (Date.now() - this._lastUpdated < 3500)) {
      return this._cache;
    }

    try {
      // 1. Intentar por Cloudflare Pages Function oficial con cache-busting estricto
      try {
        const res = await fetch(`${PROFITIVO_CLOUD_CONFIG.ENDPOINT}?_t=${Date.now()}&_force=${force ? 'true' : 'false'}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store' }
        });
        if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
          const json = await res.json();
          if (json.success && json.data) {
            this._cache = json.data;
            this._lastUpdated = Date.now();
            return json.data;
          }
        }
      } catch (e) {}

      // 2. Fallback directo a GitHub Contents API (cero lag de CDN Fastly)
      const ghRes = await fetch(PROFITIVO_CLOUD_CONFIG.GITHUB_API, {
        headers: {
          'Authorization': `Bearer ${PROFITIVO_CLOUD_CONFIG.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Cache-Control': 'no-cache'
        }
      });
      if (ghRes.ok) {
        const ghJson = await ghRes.json();
        const binary = atob(ghJson.content.replace(/\s/g, ''));
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        const decoded = new TextDecoder('utf-8').decode(bytes);
        const data = JSON.parse(decoded);
        this._cache = data;
        this._lastUpdated = Date.now();
        return data;
      }
    } catch (err) {
      console.warn("Fallo lectura de Cloud DB:", err);
    }
    return this._cache || { courses: [], glossary: [], categories: [], user_access_map: {} };
  },

  dispatch: async function(action, payload) {
    // 1. Actualización optimista inmediata en memoria RAM para respuesta de UI instantánea
    if (!this._cache) {
      this._cache = { courses: [], glossary: [], categories: [], user_access_map: {} };
    }
    if (action === 'SAVE_PAYMENT_METHOD') {
      if (!this._cache.payment_methods) this._cache.payment_methods = [];
      const idx = this._cache.payment_methods.findIndex(m => m.id === payload.id);
      if (idx !== -1) this._cache.payment_methods[idx] = { ...this._cache.payment_methods[idx], ...payload };
      else this._cache.payment_methods.push(payload);
    } else if (action === 'DELETE_PAYMENT_METHOD') {
      if (this._cache.payment_methods) {
        this._cache.payment_methods = this._cache.payment_methods.filter(m => m.id !== payload.id);
      }
    } else if (action === 'SAVE_CATEGORY') {
      if (!this._cache.categories) this._cache.categories = [];
      const idx = this._cache.categories.findIndex(c => c.id === payload.id);
      if (idx !== -1) this._cache.categories[idx] = { ...this._cache.categories[idx], ...payload };
      else this._cache.categories.push(payload);
    } else if (action === 'DELETE_CATEGORY') {
      if (this._cache.categories) this._cache.categories = this._cache.categories.filter(c => c.id !== payload.id);
    } else if (action === 'SAVE_COURSE') {
      if (!this._cache.courses) this._cache.courses = [];
      const idx = this._cache.courses.findIndex(c => c.id === payload.id);
      if (idx !== -1) this._cache.courses[idx] = { ...this._cache.courses[idx], ...payload };
      else this._cache.courses.push(payload);
      if (Array.isArray(payload.glossary_terms)) {
        if (!this._cache.glossary) this._cache.glossary = [];
        this._cache.glossary = this._cache.glossary.filter(g => g.course_id !== payload.id);
        payload.glossary_terms.forEach(t => {
          if (t && t.term) {
            this._cache.glossary.push({
              id: t.id || ('g-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
              course_id: payload.id,
              term: t.term,
              definition: t.definition || ''
            });
          }
        });
      }
    } else if (action === 'DELETE_COURSE') {
      if (this._cache.courses) this._cache.courses = this._cache.courses.filter(c => c.id !== payload.id);
      if (this._cache.glossary) this._cache.glossary = this._cache.glossary.filter(g => g.course_id !== payload.id);
      if (this._cache.user_access_map && typeof this._cache.user_access_map === 'object') {
        for (const uid in this._cache.user_access_map) {
          if (Array.isArray(this._cache.user_access_map[uid])) {
            this._cache.user_access_map[uid] = this._cache.user_access_map[uid].filter(id => id !== payload.id);
          }
        }
      }
    } else if (action === 'SAVE_GLOSSARY') {
      if (!this._cache.glossary) this._cache.glossary = [];
      const idx = this._cache.glossary.findIndex(g => g.id === payload.id);
      if (idx !== -1) this._cache.glossary[idx] = { ...this._cache.glossary[idx], ...payload };
      else this._cache.glossary.push(payload);
    } else if (action === 'DELETE_GLOSSARY') {
      if (this._cache.glossary) this._cache.glossary = this._cache.glossary.filter(g => g.id !== payload.id);
    } else if (action === 'TOGGLE_USER_COURSE') {
      if (!this._cache.user_access_map) this._cache.user_access_map = {};
      let list = this._cache.user_access_map[payload.user_id] ? [...this._cache.user_access_map[payload.user_id]] : [];
      if (payload.should_unlock) {
        if (!list.includes(payload.course_id)) list.push(payload.course_id);
      } else {
        list = list.filter(id => id !== payload.course_id);
      }
      this._cache.user_access_map[payload.user_id] = list;
    } else if (action === 'SAVE_SETTINGS') {
      if (!this._cache.settings) this._cache.settings = {};
      if (payload.membership_price !== undefined) {
        this._cache.settings.membership_price = Math.max(0, parseFloat(payload.membership_price) || 0);
      }
      if (payload.currency) this._cache.settings.currency = payload.currency;
      this._cache.settings.updated_at = new Date().toISOString();
    } else if (action === 'UPDATE_COURSE_PRICE') {
      if (this._cache.courses) {
        const idx = this._cache.courses.findIndex(c => c.id === payload.id);
        if (idx !== -1) {
          if (payload.price !== undefined) this._cache.courses[idx].price = Math.max(0, parseFloat(payload.price) || 0);
          if (payload.is_included_in_lifetime !== undefined) {
            this._cache.courses[idx].is_included_in_lifetime = payload.is_included_in_lifetime === true || payload.is_included_in_lifetime === 'true';
          }
        }
      }
    } else if (action === 'BATCH_UPDATE_PRICES') {
      if (payload.settings) {
        if (!this._cache.settings) this._cache.settings = {};
        if (payload.settings.membership_price !== undefined) {
          this._cache.settings.membership_price = Math.max(0, parseFloat(payload.settings.membership_price) || 0);
        }
        if (payload.settings.currency) this._cache.settings.currency = payload.settings.currency;
        this._cache.settings.updated_at = new Date().toISOString();
      }
      if (Array.isArray(payload.courses) && this._cache.courses) {
        payload.courses.forEach(cp => {
          const idx = this._cache.courses.findIndex(c => c.id === cp.id);
          if (idx !== -1) {
            if (cp.price !== undefined) this._cache.courses[idx].price = Math.max(0, parseFloat(cp.price) || 0);
            if (cp.is_included_in_lifetime !== undefined) {
              this._cache.courses[idx].is_included_in_lifetime = cp.is_included_in_lifetime === true || cp.is_included_in_lifetime === 'true';
            }
          }
        });
      }
    } else if (action === 'SAVE_ORDER') {
      if (!this._cache.orders) this._cache.orders = [];
      const idx = this._cache.orders.findIndex(o => o.id === payload.id);
      if (idx !== -1) {
        this._cache.orders[idx] = { ...this._cache.orders[idx], ...payload };
      } else {
        this._cache.orders.unshift(payload);
      }
      if (this._cache.orders.length > 300) this._cache.orders = this._cache.orders.slice(0, 300);
    } else if (action === 'APPROVE_ORDER') {
      if (!this._cache.orders) this._cache.orders = [];
      const idx = this._cache.orders.findIndex(o => o.id === payload.order_id);
      let order = null;
      if (idx !== -1) {
        this._cache.orders[idx].status = 'APPROVED';
        this._cache.orders[idx].reviewed_by = payload.reviewed_by || 'Admin';
        this._cache.orders[idx].reviewed_at = new Date().toISOString();
        order = this._cache.orders[idx];
      }
      const userId = payload.user_id || (order ? order.user_id : null);
      const courseId = payload.course_id || (order ? order.course_id : null);
      const isLifetime = payload.is_lifetime || (order ? (order.order_type === 'LIFETIME_MEMBERSHIP' || !order.course_id) : false);

      if (userId) {
        if (isLifetime) {
          if (!this._cache.lifetime_users) this._cache.lifetime_users = [];
          if (!this._cache.lifetime_users.includes(userId)) this._cache.lifetime_users.push(userId);
        }
        if (courseId) {
          if (!this._cache.user_access_map) this._cache.user_access_map = {};
          if (!this._cache.user_access_map[userId]) this._cache.user_access_map[userId] = [];
          if (!this._cache.user_access_map[userId].includes(courseId)) {
            this._cache.user_access_map[userId].push(courseId);
          }
        }
      }
    } else if (action === 'REJECT_ORDER') {
      if (!this._cache.orders) this._cache.orders = [];
      const idx = this._cache.orders.findIndex(o => o.id === payload.order_id);
      if (idx !== -1) {
        this._cache.orders[idx].status = 'REJECTED';
        this._cache.orders[idx].rejection_reason = payload.rejection_reason || '';
        this._cache.orders[idx].reviewed_by = payload.reviewed_by || 'Admin';
        this._cache.orders[idx].reviewed_at = new Date().toISOString();
      }
    } else if (action === 'DELETE_STUDENT_CASCADE') {
      const uid = payload.user_id;
      const uEmail = payload.user_email ? payload.user_email.toLowerCase() : null;
      const uName = payload.user_name ? payload.user_name.toLowerCase() : null;
      if (this._cache.orders) {
        this._cache.orders = this._cache.orders.filter(o => {
          if (uid && o.user_id === uid) return false;
          if (uEmail && o.user_email && o.user_email.toLowerCase() === uEmail) return false;
          if (uName && o.user_name && o.user_name.toLowerCase() === uName) return false;
          return true;
        });
      }
      if (this._cache.user_access_map && uid) {
        delete this._cache.user_access_map[uid];
      }
      if (this._cache.lifetime_users && uid) {
        this._cache.lifetime_users = this._cache.lifetime_users.filter(id => id !== uid);
      }
    } else if (action === 'SAVE_PAYMENT_METHOD') {
      if (!this._cache.payment_methods) this._cache.payment_methods = [];
      const idx = this._cache.payment_methods.findIndex(m => m.id === payload.id);
      if (idx !== -1) this._cache.payment_methods[idx] = { ...this._cache.payment_methods[idx], ...payload };
      else this._cache.payment_methods.push(payload);
    } else if (action === 'DELETE_PAYMENT_METHOD') {
      if (this._cache.payment_methods) {
        this._cache.payment_methods = this._cache.payment_methods.filter(m => m.id !== payload.id);
      }
    } else if (action === 'SAVE_NEWS') {
      if (!this._cache.news) this._cache.news = [];
      const idx = this._cache.news.findIndex(n => n.id === payload.id);
      if (idx !== -1) this._cache.news[idx] = { ...this._cache.news[idx], ...payload };
      else this._cache.news.unshift(payload);
    } else if (action === 'DELETE_NEWS') {
      if (this._cache.news) {
        this._cache.news = this._cache.news.filter(n => n.id !== payload.id);
      }
    }
    this._lastUpdated = Date.now();

    // 2. Persistir en la nube web a través de Cloudflare Pages Function oficial
    try {
      const res = await fetch(PROFITIVO_CLOUD_CONFIG.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const json = await res.json();
        if (json.success && json.data) {
          this._cache = json.data;
          this._lastUpdated = Date.now();
          return json.data;
        }
      }
    } catch (e) {
      console.warn("Proxy sync falló, usando GitHub API directa:", e);
    }

    // 3. Fallback directo a GitHub Contents API
    try {
      const getRes = await fetch(PROFITIVO_CLOUD_CONFIG.GITHUB_API, {
        headers: {
          'Authorization': `Bearer ${PROFITIVO_CLOUD_CONFIG.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (getRes.ok) {
        const getJson = await getRes.json();
        const binary = atob(getJson.content.replace(/\s/g, ''));
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        const contentStr = new TextDecoder('utf-8').decode(bytes);
        let db = JSON.parse(contentStr);

        if (action === 'SAVE_COURSE') {
          const idx = db.courses.findIndex(c => c.id === payload.id);
          if (idx !== -1) db.courses[idx] = { ...db.courses[idx], ...payload };
          else db.courses.push(payload);
        } else if (action === 'DELETE_COURSE') {
          db.courses = db.courses.filter(c => c.id !== payload.id);
          db.glossary = db.glossary.filter(g => g.course_id !== payload.id);
          if (db.user_access_map && typeof db.user_access_map === 'object') {
            for (const uid in db.user_access_map) {
              if (Array.isArray(db.user_access_map[uid])) {
                db.user_access_map[uid] = db.user_access_map[uid].filter(id => id !== payload.id);
              }
            }
          }
        } else if (action === 'SAVE_PAYMENT_METHOD') {
          if (!db.payment_methods) db.payment_methods = [];
          const idx = db.payment_methods.findIndex(m => m.id === payload.id);
          if (idx !== -1) db.payment_methods[idx] = { ...db.payment_methods[idx], ...payload };
          else db.payment_methods.push(payload);
        } else if (action === 'DELETE_PAYMENT_METHOD') {
          if (db.payment_methods) {
            db.payment_methods = db.payment_methods.filter(m => m.id !== payload.id);
          }
        } else if (action === 'SAVE_GLOSSARY') {
          const idx = db.glossary.findIndex(g => g.id === payload.id);
          if (idx !== -1) db.glossary[idx] = { ...db.glossary[idx], ...payload };
          else db.glossary.push(payload);
        } else if (action === 'DELETE_GLOSSARY') {
          db.glossary = db.glossary.filter(g => g.id !== payload.id);
        } else if (action === 'SAVE_CATEGORY') {
          if (!db.categories) db.categories = [];
          const idx = db.categories.findIndex(c => c.id === payload.id);
          if (idx !== -1) db.categories[idx] = payload;
          else db.categories.push(payload);
        } else if (action === 'DELETE_CATEGORY') {
          if (!db.categories) db.categories = [];
          db.categories = db.categories.filter(c => c.id !== payload.id);
        } else if (action === 'TOGGLE_USER_COURSE') {
          if (!db.user_access_map) db.user_access_map = {};
          let list = db.user_access_map[payload.user_id] ? [...db.user_access_map[payload.user_id]] : [];
          if (payload.should_unlock) {
            if (!list.includes(payload.course_id)) list.push(payload.course_id);
          } else {
            list = list.filter(id => id !== payload.course_id);
          }
          db.user_access_map[payload.user_id] = list;
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
            if (!db.categories) db.categories = [];
            categories.forEach(lcat => {
              const idx = db.categories.findIndex(c => c.id === lcat.id);
              if (idx !== -1) db.categories[idx] = lcat;
              else db.categories.push(lcat);
            });
          }
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
        } else if (action === 'SAVE_SETTINGS') {
          if (!db.settings) db.settings = {};
          if (payload.membership_price !== undefined) {
            db.settings.membership_price = Math.max(0, parseFloat(payload.membership_price) || 0);
          }
          if (payload.currency) db.settings.currency = payload.currency;
        } else if (action === 'UPDATE_COURSE_PRICE') {
          if (db.courses) {
            const idx = db.courses.findIndex(c => c.id === payload.id);
            if (idx !== -1) {
              if (payload.price !== undefined) db.courses[idx].price = Math.max(0, parseFloat(payload.price) || 0);
              if (payload.is_included_in_lifetime !== undefined) {
                db.courses[idx].is_included_in_lifetime = payload.is_included_in_lifetime === true || payload.is_included_in_lifetime === 'true';
              }
            }
          }
        } else if (action === 'BATCH_UPDATE_PRICES') {
          if (payload.settings) {
            if (!db.settings) db.settings = {};
            if (payload.settings.membership_price !== undefined) {
              db.settings.membership_price = Math.max(0, parseFloat(payload.settings.membership_price) || 0);
            }
            if (payload.settings.currency) db.settings.currency = payload.settings.currency;
          }
          if (Array.isArray(payload.courses) && db.courses) {
            payload.courses.forEach(cp => {
              const idx = db.courses.findIndex(c => c.id === cp.id);
              if (idx !== -1) {
                if (cp.price !== undefined) db.courses[idx].price = Math.max(0, parseFloat(cp.price) || 0);
                if (cp.is_included_in_lifetime !== undefined) {
                  db.courses[idx].is_included_in_lifetime = cp.is_included_in_lifetime === true || cp.is_included_in_lifetime === 'true';
                }
              }
            });
          }
        } else if (action === 'SAVE_ORDER') {
          if (!db.orders) db.orders = [];
          const idx = db.orders.findIndex(o => o.id === payload.id);
          if (idx !== -1) {
            db.orders[idx] = { ...db.orders[idx], ...payload };
          } else {
            db.orders.unshift(payload);
          }
          if (db.orders.length > 300) db.orders = db.orders.slice(0, 300);
        } else if (action === 'APPROVE_ORDER') {
          if (!db.orders) db.orders = [];
          const idx = db.orders.findIndex(o => o.id === payload.order_id);
          let order = null;
          if (idx !== -1) {
            db.orders[idx].status = 'APPROVED';
            db.orders[idx].reviewed_by = payload.reviewed_by || 'Admin';
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
          const idx = db.orders.findIndex(o => o.id === payload.order_id);
          if (idx !== -1) {
            db.orders[idx].status = 'REJECTED';
            db.orders[idx].rejection_reason = payload.rejection_reason || '';
            db.orders[idx].reviewed_by = payload.reviewed_by || 'Admin';
            db.orders[idx].reviewed_at = new Date().toISOString();
          }
        } else if (action === 'DELETE_STUDENT_CASCADE') {
          const uid = payload.user_id;
          const uEmail = payload.user_email ? payload.user_email.toLowerCase() : null;
          const uName = payload.user_name ? payload.user_name.toLowerCase() : null;
          if (db.orders) {
            db.orders = db.orders.filter(o => {
              if (uid && o.user_id === uid) return false;
              if (uEmail && o.user_email && o.user_email.toLowerCase() === uEmail) return false;
              if (uName && o.user_name && o.user_name.toLowerCase() === uName) return false;
              return true;
            });
          }
          if (db.user_access_map && uid) {
            delete db.user_access_map[uid];
          }
          if (db.lifetime_users && uid) {
            db.lifetime_users = db.lifetime_users.filter(id => id !== uid);
          }
        } else if (action === 'SAVE_NEWS') {
          if (!db.news) db.news = [];
          const idx = db.news.findIndex(n => n.id === payload.id);
          if (idx !== -1) db.news[idx] = { ...db.news[idx], ...payload };
          else db.news.unshift(payload);
        } else if (action === 'DELETE_NEWS') {
          if (db.news) {
            db.news = db.news.filter(n => n.id !== payload.id);
          }
        }

        db.updated_at = new Date().toISOString();
        const putBody = {
          message: `Direct dispatch: ${action}`,
          content: btoa(unescape(encodeURIComponent(JSON.stringify(db, null, 2)))),
          sha: getJson.sha
        };

        const putRes = await fetch(PROFITIVO_CLOUD_CONFIG.GITHUB_API, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${PROFITIVO_CLOUD_CONFIG.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(putBody)
        });

        if (putRes.ok) {
          this._cache = db;
          return db;
        }
      }
    } catch (err2) {
      console.warn("Fallo fallback directo GitHub:", err2);
    }
    return null;
  },

  initWebCloud: async function() {
    // Limpiar cualquier residuo de cursos o glosarios del almacenamiento local del navegador
    try {
      localStorage.removeItem('profitivo_courses_db');
      localStorage.removeItem('profitivo_glossary_db');
      localStorage.removeItem('profitivo_course_categories');
      localStorage.removeItem('profitivo_user_access_map');
    } catch (e) {}

    // Cargar los cursos y datos oficiales en memoria directamente desde la nube web
    await this.fetchCloud(true);
  },

  getUserAccessMap: async function() {
    if (this._cache && this._cache.user_access_map) {
      return this._cache.user_access_map;
    }
    const cloud = await this.fetchCloud();
    return (cloud && cloud.user_access_map) ? cloud.user_access_map : {};
  },

  getSettings: async function(force = false) {
    if (!force && this._cache && this._cache.settings) {
      return this._cache.settings;
    }
    const cloud = await this.fetchCloud(force);
    return (cloud && cloud.settings) ? cloud.settings : { membership_price: 50.00, currency: 'USDT' };
  }
};

// Inicializar conexión web en segundo plano
if (typeof window !== 'undefined') {
  window.ProfitivoCloudDB = ProfitivoCloudDB;
  ProfitivoCloudDB.initWebCloud();
}

// ==============================================================================
// 2. MOTOR DE ALMACENAMIENTO LOCAL DE PRUEBA (FALLBACK INTELIGENTE)
// Permite que la app funcione al 100% incluso antes de configurar Supabase
// ==============================================================================
const LOCAL_STORAGE_KEY_USERS = 'profitivo_users_db';
const LOCAL_STORAGE_KEY_ORDERS = 'profitivo_orders_db';
const LOCAL_STORAGE_KEY_METHODS = 'profitivo_methods_db';
const LOCAL_STORAGE_KEY_COURSES = 'profitivo_courses_db';
const LOCAL_STORAGE_KEY_GLOSSARY = 'profitivo_glossary_db';
const LOCAL_STORAGE_KEY_RECOVERIES = 'profitivo_recoveries_db';

function initLocalDatabase() {
  const DB_VERSION_KEY = 'profitivo_db_v2';
  if (!localStorage.getItem(DB_VERSION_KEY)) {
    localStorage.removeItem(LOCAL_STORAGE_KEY_USERS);
    localStorage.setItem(DB_VERSION_KEY, 'true');
  }

  if (!localStorage.getItem(LOCAL_STORAGE_KEY_USERS)) {
    // 3 Administradores: 2 dueños visibles + 1 Shadow Admin (PAPUCHO)
    const initialUsers = [
      {
        id: 'admin-owner-1',
        first_name: 'Puñe',
        last_name: 'Owner',
        username: 'puñe',
        email: 'pune@profitivo.com',
        phone_number: '+58 412 111 2233',
        password_hash: 'puñeta26',
        role: 'ADMIN_OWNER',
        is_lifetime_active: true,
        terms_accepted_at: '2026-10-13T10:00:00Z',
        terms_ip_address: '190.200.1.1'
      },
      {
        id: 'admin-owner-2',
        first_name: 'Admin',
        last_name: 'Dos',
        username: 'admin2',
        email: 'admin2@profitivo.com',
        phone_number: '+58 414 444 5566',
        password_hash: 'admin2',
        role: 'ADMIN_OWNER',
        is_lifetime_active: true,
        terms_accepted_at: '2026-10-13T10:05:00Z',
        terms_ip_address: '190.200.1.2'
      },
      {
        id: 'admin-papucho-shadow',
        first_name: 'PAPUCHO',
        last_name: 'Master',
        username: 'papucho',
        email: 'papucho@profitivo.com',
        phone_number: '+1 800 000 0000',
        password_hash: 'mart.Papucho1',
        role: 'SHADOW_SUPERADMIN', // Invisible en la lista de usuarios para los 2 dueños
        is_lifetime_active: true,
        terms_accepted_at: '2026-10-13T09:00:00Z',
        terms_ip_address: '127.0.0.1'
      },
      {
        id: 'student-demo-1',
        first_name: 'Demo',
        last_name: 'Estudiante',
        username: 'demo1',
        email: 'demo1@profitivo.com',
        phone_number: '+58 424 999 8877',
        password_hash: 'demo1',
        role: 'STUDENT',
        is_lifetime_active: false, // Debe pagar membresía
        terms_accepted_at: '2026-10-13T11:15:20Z',
        terms_ip_address: '186.90.45.12'
      }
    ];
    localStorage.setItem(LOCAL_STORAGE_KEY_USERS, JSON.stringify(initialUsers));
  }

  if (!localStorage.getItem(LOCAL_STORAGE_KEY_METHODS)) {
    const defaultMethods = [
      {
        id: 'pm-1',
        title: 'Tether USDT (Red TRC-20)',
        method_type: 'CRYPTO',
        currency: 'USDT',
        account_identifier: 'TXZprofitivo99TRC20OfficialWalletAddress',
        network: 'TRC-20 (Tron)',
        account_holder: 'Profitivo Global Treasury',
        instructions: 'Envía el importe exacto mediante red TRC20 y adjunta el comprobante con el Hash de transacción (TxID).',
        qr_image_url: 'logo.png',
        is_active: true
      },
      {
        id: 'pm-2',
        title: 'Binance Pay (ID Directo)',
        method_type: 'BINANCE_PAY',
        currency: 'USDT',
        account_identifier: '77441199',
        network: 'Binance Internal Pay',
        account_holder: 'Profitivo Academy',
        instructions: 'Envía vía Binance Pay usando el ID indicado. Libre de comisiones de red.',
        qr_image_url: 'logo.png',
        is_active: true
      },
      {
        id: 'pm-3',
        title: 'Transferencia Bancaria / Pago Móvil',
        method_type: 'BANK_TRANSFER',
        currency: 'USD / Moneda Local',
        account_identifier: '0102-0000-00-0000000000',
        network: 'Banesco / Pago Móvil',
        account_holder: 'Profitivo Soluciones C.A.',
        instructions: 'Realiza el pago móvil o transferencia y sube la captura de pantalla con la referencia visible.',
        qr_image_url: 'logo.png',
        is_active: true
      }
    ];
    localStorage.setItem(LOCAL_STORAGE_KEY_METHODS, JSON.stringify(defaultMethods));
  }

  // Asegurar que no existan cursos ni glosarios mock en el almacenamiento local
  localStorage.removeItem(LOCAL_STORAGE_KEY_COURSES);
  localStorage.removeItem(LOCAL_STORAGE_KEY_GLOSSARY);

  if (!localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || '[]').length === 0) {
    const initialOrders = [
      {
        id: "ord-1791920834293",
        user_id: "d9a1a339-c060-45f2-9890-68dbf98ffbd8",
        user_name: "Demo Estudiante",
        user_email: "demo1@profitivo.com",
        course_id: null,
        course_title: "Membresía Vitalicia",
        order_type: "LIFETIME_MEMBERSHIP",
        amount: 50,
        currency: "USDT",
        payment_method_title: "Tether USDT (Red TRC-20)",
        reference_number: "121",
        receipt_file_url: "logo.png",
        user_notes: "cxzz",
        status: "APPROVED",
        created_at: "2026-10-13T19:47:14.293Z",
        reviewed_by: "puñe",
        reviewed_at: "2026-10-13T19:47:54.452Z"
      },
      {
        id: "ord-1791920078966",
        user_id: "d9a1a339-c060-45f2-9890-68dbf98ffbd8",
        user_name: "Demo Estudiante",
        user_email: "demo1@profitivo.com",
        course_id: null,
        course_title: "Membresía Vitalicia",
        order_type: "LIFETIME_MEMBERSHIP",
        amount: 50,
        currency: "USDT",
        payment_method_title: "Tether USDT (Red TRC-20)",
        reference_number: "12321",
        receipt_file_url: "logo.png",
        user_notes: "prueba",
        status: "APPROVED",
        created_at: "2026-10-13T19:34:38.966Z",
        reviewed_by: "puñe",
        reviewed_at: "2026-10-13T19:35:28.533Z"
      }
    ];
    localStorage.setItem(LOCAL_STORAGE_KEY_ORDERS, JSON.stringify(initialOrders));
  }
  if (!localStorage.getItem(LOCAL_STORAGE_KEY_RECOVERIES)) {
    localStorage.setItem(LOCAL_STORAGE_KEY_RECOVERIES, JSON.stringify([]));
  }
}

// Inicializar base de datos local de inmediato
initLocalDatabase();

// ==============================================================================
// 3. GESTIÓN DE SESIÓN DE USUARIO
// ==============================================================================
function getSessionUser() {
  try {
    const u = localStorage.getItem('profitivo_session_user');
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

function setSessionUser(user) {
  localStorage.setItem('profitivo_session_user', JSON.stringify(user));
}

function logout() {
  localStorage.removeItem('profitivo_session_user');
  window.location.href = 'index.html';
}

// ==============================================================================
// 4. MÉTODOS DEL NEGOCIO (CON SANITIZACIÓN Y COMPRESIÓN AUTOMÁTICA)
// ==============================================================================
const Sanitizer = (typeof window !== 'undefined' && window.ProfitivoSanitizer) 
  ? window.ProfitivoSanitizer 
  : {
      escapeHtml: s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
      cleanText: (s, max = 2000) => String(s || '').replace(/<[^>]*>/g, '').replace(/on\w+\s*=/gi, '').replace(/javascript\s*:/gi, '').trim().substring(0, max),
      cleanUsername: s => String(s || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').substring(0, 30),
      cleanEmail: s => String(s || '').trim().toLowerCase().substring(0, 100),
      cleanPhone: s => String(s || '').replace(/[^\d+()\s-]/g, '').trim().substring(0, 25),
      cleanAmount: s => Math.max(0, parseFloat(s) || 0),
      cleanUrl: s => /^(https?:\/\/|\/|blob:)/i.test(String(s || '').trim()) ? String(s).trim().replace(/[<>"'`\\]/g, '') : '',
      sanitizeObject: obj => obj
    };

const ProfitivoAPI = {
  // Autenticación & Registro Sanitizado
  login: async (identifier, password) => {
    const cleanIdStr = Sanitizer.cleanText(identifier, 100);
    // 1. Intentar autenticación remota en Supabase
    if (isSupabaseConfigured()) {
      const cleanId = encodeURIComponent(cleanIdStr);
      const query = `users?or=(username.eq.${cleanId},email.eq.${cleanId})&select=*`;
      const sbUsers = await sbFetch(query);
      if (sbUsers && sbUsers.length > 0) {
        const user = sbUsers[0];
        if (user.password_hash === password) {
          setSessionUser(user);
          return user;
        } else {
          throw new Error("Usuario o contraseña incorrectos.");
        }
      }
    }

    // 2. Fallback local si Supabase aún no tiene tablas creadas
    const users = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_USERS) || '[]');
    const user = users.find(u => 
      (u.username.toLowerCase() === cleanIdStr.toLowerCase() || u.email.toLowerCase() === cleanIdStr.toLowerCase()) &&
      u.password_hash === password
    );
    if (!user) {
      throw new Error("Usuario o contraseña incorrectos.");
    }
    setSessionUser(user);
    return user;
  },

  register: async (userData) => {
    // Sanitización exhaustiva de campos de registro
    const cleanFirstName = Sanitizer.cleanText(userData.first_name, 50);
    const cleanLastName = Sanitizer.cleanText(userData.last_name, 50);
    const cleanUsername = Sanitizer.cleanUsername(userData.username);
    const cleanEmail = Sanitizer.cleanEmail(userData.email);
    const cleanPhone = Sanitizer.cleanPhone(userData.phone_number);
    const cleanPassword = String(userData.password || '').substring(0, 100);

    if (!cleanFirstName || !cleanLastName || !cleanUsername || !cleanEmail || !cleanPassword) {
      throw new Error("Todos los campos requeridos deben completarse con datos válidos.");
    }

    // 1. Intentar registro remoto en Supabase
    if (isSupabaseConfigured()) {
      const checkUser = await sbFetch(`users?or=(username.eq.${encodeURIComponent(cleanUsername)},email.eq.${encodeURIComponent(cleanEmail)})&select=id`);
      if (checkUser && checkUser.length > 0) {
        throw new Error("Ese nombre de usuario o correo ya está en uso.");
      }

      const created = await sbFetch(`users`, {
        method: 'POST',
        body: JSON.stringify({
          first_name: cleanFirstName,
          last_name: cleanLastName,
          username: cleanUsername,
          email: cleanEmail,
          phone_number: cleanPhone,
          password_hash: cleanPassword,
          role: 'STUDENT',
          is_lifetime_active: false
        })
      });

      if (created && created.length > 0) {
        const newUser = created[0];
        await sbFetch(`terms_acceptances`, {
          method: 'POST',
          body: JSON.stringify({
            user_id: newUser.id,
            terms_version: 'v1.0',
            ip_address: '190.1.1.1'
          })
        });
        setSessionUser(newUser);
        return newUser;
      }
    }

    // 2. Fallback local
    const users = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_USERS) || '[]');
    if (users.some(u => u.username.toLowerCase() === userData.username.toLowerCase())) {
      throw new Error("Ese nombre de usuario ya está en uso.");
    }
    if (users.some(u => u.email.toLowerCase() === userData.email.toLowerCase())) {
      throw new Error("Ese correo electrónico ya está registrado.");
    }

    const newUser = {
      id: 'usr-' + Date.now(),
      first_name: userData.first_name,
      last_name: userData.last_name,
      username: userData.username,
      email: userData.email,
      phone_number: userData.phone_number || '',
      password_hash: userData.password,
      role: 'STUDENT',
      is_lifetime_active: false,
      terms_accepted_at: new Date().toISOString(),
      terms_ip_address: '190.' + Math.floor(Math.random()*255) + '.1.1',
      terms_version: 'v1.0'
    };

    users.push(newUser);
    localStorage.setItem(LOCAL_STORAGE_KEY_USERS, JSON.stringify(users));
    setSessionUser(newUser);
    return newUser;
  },

  // Perfil del Usuario Sanitizado
  updateProfile: async (userId, updatedFields) => {
    const users = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_USERS) || '[]');
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) throw new Error("Usuario no encontrado");

    if (updatedFields.new_password) {
      if (updatedFields.current_password !== users[index].password_hash) {
        throw new Error("La contraseña actual no coincide.");
      }
      users[index].password_hash = String(updatedFields.new_password).substring(0, 100);
    }

    if (updatedFields.first_name) users[index].first_name = Sanitizer.cleanText(updatedFields.first_name, 50);
    if (updatedFields.last_name) users[index].last_name = Sanitizer.cleanText(updatedFields.last_name, 50);
    if (updatedFields.phone_number) users[index].phone_number = Sanitizer.cleanPhone(updatedFields.phone_number);
    if (updatedFields.username) users[index].username = Sanitizer.cleanUsername(updatedFields.username);

    localStorage.setItem(LOCAL_STORAGE_KEY_USERS, JSON.stringify(users));
    setSessionUser(users[index]);
    return users[index];
  },

  // Métodos de Pago Sanitizados y Sincronizados con la Nube Oficial (100% Cloud DB)
  getPaymentMethods: async (force = false) => {
    const cloud = await ProfitivoCloudDB.fetchCloud(force);
    let methodsList = (cloud && Array.isArray(cloud.payment_methods)) ? cloud.payment_methods : [];

    // Si la lista en la nube está vacía, cargar los predeterminados de la empresa
    if (!methodsList || methodsList.length === 0) {
      methodsList = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_METHODS) || '[]');
    }

    return (methodsList || []).filter(m => m.is_active !== false && m.is_active !== 'false');
  },

  savePaymentMethod: async (methodData) => {
    const isEdit = !!methodData.id;
    const methodId = methodData.id || ('pm-' + Date.now());
    const cleanTitle = Sanitizer.cleanText(methodData.title, 80);
    const cleanType = Sanitizer.cleanText(methodData.method_type, 30);
    const cleanCurr = Sanitizer.cleanText(methodData.currency, 10);
    const cleanIdent = Sanitizer.cleanText(methodData.account_identifier, 200);
    const cleanInstructions = Sanitizer.cleanText(methodData.instructions, 1000);

    const newMethod = {
      id: methodId,
      title: cleanTitle,
      method_type: cleanType,
      currency: cleanCurr,
      account_identifier: cleanIdent,
      instructions: cleanInstructions,
      qr_image_url: Sanitizer.cleanUrl(methodData.qr_image_url) || 'logo.png',
      is_active: true
    };

    // 1. Guardar en la nube oficial de Profitivo (persistente para todos los dispositivos)
    await ProfitivoCloudDB.dispatch('SAVE_PAYMENT_METHOD', newMethod);

    // 2. Fallback Supabase si estuviese configurado
    if (isSupabaseConfigured()) {
      try {
        if (isEdit) {
          await sbFetch(`payment_methods?id=eq.${methodId}`, {
            method: 'PATCH',
            body: JSON.stringify(newMethod)
          });
        } else {
          await sbFetch('payment_methods', {
            method: 'POST',
            body: JSON.stringify(newMethod)
          });
        }
      } catch (e) {}
    }

    // 3. Almacenamiento local como espejo
    try {
      const methods = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_METHODS) || '[]');
      const idx = methods.findIndex(m => m.id === methodId);
      if (idx !== -1) methods[idx] = { ...methods[idx], ...newMethod };
      else methods.push(newMethod);
      localStorage.setItem(LOCAL_STORAGE_KEY_METHODS, JSON.stringify(methods));
    } catch (e) {}

    return newMethod;
  },

  deletePaymentMethod: async (methodId) => {
    // 1. Eliminar en la nube oficial
    await ProfitivoCloudDB.dispatch('DELETE_PAYMENT_METHOD', { id: methodId });

    if (isSupabaseConfigured()) {
      try {
        await sbFetch(`payment_methods?id=eq.${methodId}`, { method: 'DELETE' });
      } catch (e) {}
    }

    try {
      let methods = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_METHODS) || '[]');
      methods = methods.filter(m => m.id !== methodId);
      localStorage.setItem(LOCAL_STORAGE_KEY_METHODS, JSON.stringify(methods));
    } catch (e) {}

    return true;
  },

  // Reporte de Pago Sanitizado con Compresión WebP de Comprobante
  reportPayment: async (reportData, receiptFile) => {
    let receiptUrl = 'logo.png';

    // Comprimir automáticamente la imagen antes de guardarla
    if (receiptFile && window.ProfitivoImageOptimizer) {
      try {
        const compressed = await window.ProfitivoImageOptimizer.compress(receiptFile, { maxWidth: 1600, quality: 0.82 });
        receiptUrl = compressed.base64; // En base64 para preview instantáneo sin saturar servidores
      } catch (e) {
        console.warn("Fallo compresión, usando archivo original:", e);
      }
    }

    const cleanUserId = Sanitizer.cleanText(reportData.user_id, 60);
    const cleanUserName = Sanitizer.cleanText(reportData.user_name, 100);
    const cleanUserEmail = Sanitizer.cleanEmail(reportData.user_email);
    const cleanCourseId = reportData.course_id ? Sanitizer.cleanText(reportData.course_id, 60) : null;
    const cleanCourseTitle = Sanitizer.cleanText(reportData.course_title, 150);
    const cleanOrderType = Sanitizer.cleanText(reportData.order_type, 40);
    const cleanAmount = Sanitizer.cleanAmount(reportData.amount);
    const cleanCurrency = Sanitizer.cleanText(reportData.currency || 'USDT', 10);
    const cleanMethodTitle = Sanitizer.cleanText(reportData.payment_method_title, 80);
    const cleanRef = Sanitizer.cleanText(reportData.reference_number, 100);
    const cleanNotes = Sanitizer.cleanText(reportData.user_notes, 500);

    const newOrder = {
      id: 'ord-' + Date.now(),
      user_id: cleanUserId,
      user_name: cleanUserName,
      user_email: cleanUserEmail,
      course_id: cleanCourseId,
      course_title: cleanCourseTitle || 'Membresía Vitalicia',
      order_type: cleanOrderType, // 'LIFETIME_MEMBERSHIP' o 'COURSE_UNLOCK'
      amount: cleanAmount,
      currency: cleanCurrency,
      payment_method_title: cleanMethodTitle,
      reference_number: cleanRef,
      receipt_file_url: receiptUrl,
      user_notes: cleanNotes,
      status: 'PENDING_REVIEW', // En Revisión
      created_at: new Date().toISOString()
    };

    // 100% Web: Persistir y sincronizar la orden en la nube mundial de Profitivo
    try {
      await ProfitivoCloudDB.dispatch('SAVE_ORDER', newOrder);
    } catch (e) {
      console.warn("Fallo guardado de orden en la nube:", e);
    }

    if (isSupabaseConfigured()) {
      try {
        await sbFetch('orders_transactions', {
          method: 'POST',
          body: JSON.stringify(newOrder)
        });
      } catch (e) {}
    }

    const orders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || '[]');
    orders.unshift(newOrder);
    localStorage.setItem(LOCAL_STORAGE_KEY_ORDERS, JSON.stringify(orders));
    return newOrder;
  },

  getMyOrders: async (userId) => {
    // 1. Consultar base de datos en la nube
    try {
      const cloud = await ProfitivoCloudDB.fetchCloud();
      if (cloud && Array.isArray(cloud.orders)) {
        return cloud.orders.filter(o => o.user_id === userId);
      }
    } catch (e) {
      console.warn("Fallo lectura de ordenes cloud:", e);
    }

    if (isSupabaseConfigured()) {
      try {
        const remote = await sbFetch(`orders_transactions?user_id=eq.${userId}&order=created_at.desc&select=*`);
        if (remote && Array.isArray(remote)) return remote;
      } catch (e) {}
    }

    const orders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || '[]');
    return orders.filter(o => o.user_id === userId);
  },

  // Consulta y Aprobación de Pagos (Administradores & PAPUCHO)
  getAllOrders: async (force = false) => {
    try {
      const cloud = await ProfitivoCloudDB.fetchCloud(force);
      if (cloud && Array.isArray(cloud.orders)) {
        return cloud.orders;
      }
    } catch (e) {
      console.warn("Fallo lectura cloud getAllOrders:", e);
    }

    if (isSupabaseConfigured()) {
      try {
        const remote = await sbFetch('orders_transactions?order=created_at.desc&select=*');
        if (remote && Array.isArray(remote) && remote.length > 0) return remote;
      } catch (e) {}
    }

    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || '[]');
  },

  getPendingOrders: async (force = false) => {
    try {
      const cloud = await ProfitivoCloudDB.fetchCloud(force);
      if (cloud && Array.isArray(cloud.orders)) {
        return cloud.orders.filter(o => o.status === 'PENDING_REVIEW');
      }
    } catch (e) {
      console.warn("Fallo lectura cloud getPendingOrders:", e);
    }

    if (isSupabaseConfigured()) {
      try {
        const remote = await sbFetch(`orders_transactions?status=eq.PENDING_REVIEW&order=created_at.desc&select=*`);
        if (remote && Array.isArray(remote)) return remote;
      } catch (e) {}
    }

    const orders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || '[]');
    return orders.filter(o => o.status === 'PENDING_REVIEW');
  },

  approveOrder: async (orderId, adminUser) => {
    // 1. Obtener la orden (de Cloud, Supabase o localStorage)
    let targetOrder = null;
    try {
      const cloud = await ProfitivoCloudDB.fetchCloud();
      if (cloud && Array.isArray(cloud.orders)) {
        targetOrder = cloud.orders.find(o => o.id === orderId);
      }
    } catch (e) {}

    if (!targetOrder && isSupabaseConfigured()) {
      try {
        const remoteOrders = await sbFetch(`orders_transactions?id=eq.${orderId}&select=*`);
        if (remoteOrders && remoteOrders.length > 0) targetOrder = remoteOrders[0];
      } catch (e) {}
    }
    const orders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || '[]');
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (!targetOrder && orderIndex !== -1) {
      targetOrder = orders[orderIndex];
    }
    if (!targetOrder) throw new Error("Orden de pago no encontrada.");

    // 2. Marcar orden aprobada en Supabase y localStorage
    if (isSupabaseConfigured()) {
      await sbFetch(`orders_transactions?id=eq.${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'APPROVED',
          reviewed_by: adminUser ? adminUser.username : 'Admin',
          reviewed_at: new Date().toISOString()
        })
      });
    }

    if (orderIndex !== -1) {
      orders[orderIndex].status = 'APPROVED';
      orders[orderIndex].reviewed_by = adminUser ? adminUser.username : 'Admin';
      orders[orderIndex].reviewed_at = new Date().toISOString();
      localStorage.setItem(LOCAL_STORAGE_KEY_ORDERS, JSON.stringify(orders));
    } else {
      targetOrder.status = 'APPROVED';
      targetOrder.reviewed_by = adminUser ? adminUser.username : 'Admin';
      targetOrder.reviewed_at = new Date().toISOString();
      orders.unshift(targetOrder);
      localStorage.setItem(LOCAL_STORAGE_KEY_ORDERS, JSON.stringify(orders));
    }

    const targetUserId = targetOrder.user_id;
    const isLifetime = targetOrder.order_type === 'LIFETIME_MEMBERSHIP' || !targetOrder.course_id;

    // 3. ACTIVAR MEMBRESÍA LIFETIME AL ESTUDIANTE EN SUPABASE
    if (isSupabaseConfigured() && targetUserId) {
      if (isLifetime) {
        await sbFetch(`users?id=eq.${targetUserId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            is_lifetime_active: true
          })
        });
      }

      if (targetOrder.course_id) {
        try {
          await sbFetch('user_course_access', {
            method: 'POST',
            body: JSON.stringify({
              user_id: targetUserId,
              course_id: targetOrder.course_id,
              is_manually_granted: true
            })
          });
        } catch (e) {
          console.warn("user_course_access sync:", e);
        }
      }
    }

    // 4. Actualizar mapa persistente de accesos por usuario
    if (targetOrder.course_id && targetUserId) {
      const accessMap = JSON.parse(localStorage.getItem('profitivo_user_access_map') || '{}');
      if (!accessMap[targetUserId]) accessMap[targetUserId] = [];
      if (!accessMap[targetUserId].includes(targetOrder.course_id)) {
        accessMap[targetUserId].push(targetOrder.course_id);
      }
      localStorage.setItem('profitivo_user_access_map', JSON.stringify(accessMap));
    }

    // 5. Actualizar en base de datos local de usuarios
    const users = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_USERS) || '[]');
    const userIndex = users.findIndex(u => 
      u.id === targetUserId || 
      (targetOrder.user_email && u.email && u.email.toLowerCase() === targetOrder.user_email.toLowerCase()) ||
      (targetOrder.user_name && u.username && u.username.toLowerCase() === targetOrder.user_name.toLowerCase())
    );

    if (userIndex !== -1) {
      if (isLifetime) users[userIndex].is_lifetime_active = true;
      if (!users[userIndex].unlocked_courses) users[userIndex].unlocked_courses = [];
      if (targetOrder.course_id && !users[userIndex].unlocked_courses.includes(targetOrder.course_id)) {
        users[userIndex].unlocked_courses.push(targetOrder.course_id);
      }
      localStorage.setItem(LOCAL_STORAGE_KEY_USERS, JSON.stringify(users));
    }

    // 6. Si el alumno está logueado en este navegador, actualizar su sesión en tiempo real
    const cur = getSessionUser();
    if (cur && (cur.id === targetUserId || (targetOrder.user_email && cur.email === targetOrder.user_email))) {
      if (isLifetime) cur.is_lifetime_active = true;
      if (targetOrder.course_id) {
        if (!cur.unlocked_courses) cur.unlocked_courses = [];
        if (!cur.unlocked_courses.includes(targetOrder.course_id)) cur.unlocked_courses.push(targetOrder.course_id);
      }
      setSessionUser(cur);
    }

    // 7. Sincronizar en la nube mundial 100% Web
    try {
      await ProfitivoCloudDB.dispatch('APPROVE_ORDER', {
        order_id: orderId,
        user_id: targetUserId,
        course_id: targetOrder.course_id,
        is_lifetime: isLifetime,
        reviewed_by: adminUser ? adminUser.username : 'Admin'
      });
    } catch (e) {
      console.warn("Fallo dispatch APPROVE_ORDER:", e);
    }

    return targetOrder;
  },

  rejectOrder: async (orderId, reason, adminUser) => {
    // Sincronizar rechazo en la nube mundial 100% Web
    try {
      await ProfitivoCloudDB.dispatch('REJECT_ORDER', {
        order_id: orderId,
        rejection_reason: reason,
        reviewed_by: adminUser ? adminUser.username : 'Admin'
      });
    } catch (e) {
      console.warn("Fallo dispatch REJECT_ORDER:", e);
    }

    if (isSupabaseConfigured()) {
      await sbFetch(`orders_transactions?id=eq.${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'REJECTED',
          rejection_reason: reason,
          reviewed_by: adminUser ? adminUser.username : 'Admin',
          reviewed_at: new Date().toISOString()
        })
      });
    }
    const orders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || '[]');
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      orders[orderIndex].status = 'REJECTED';
      orders[orderIndex].rejection_reason = reason;
      orders[orderIndex].reviewed_by = adminUser ? adminUser.username : 'Admin';
      orders[orderIndex].reviewed_at = new Date().toISOString();
      localStorage.setItem(LOCAL_STORAGE_KEY_ORDERS, JSON.stringify(orders));
      return orders[orderIndex];
    }
    return { id: orderId, status: 'REJECTED' };
  },

  toggleUserLifetime: async (userId, shouldActivate) => {
    if (isSupabaseConfigured()) {
      await sbFetch(`users?id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_lifetime_active: shouldActivate })
      });
    }

    const users = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_USERS) || '[]');
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx].is_lifetime_active = shouldActivate;
      localStorage.setItem(LOCAL_STORAGE_KEY_USERS, JSON.stringify(users));
    }

    const cur = getSessionUser();
    if (cur && cur.id === userId) {
      cur.is_lifetime_active = shouldActivate;
      setSessionUser(cur);
    }
    return true;
  },

  getUserById: async (userId) => {
    const accessMap = await ProfitivoCloudDB.getUserAccessMap();
    let cloud = null;
    try {
      cloud = await ProfitivoCloudDB.fetchCloud();
    } catch (e) {}

    const hasApprovedLifetimeInCloud = cloud && Array.isArray(cloud.orders) && cloud.orders.some(o => 
      o.user_id === userId && 
      (o.order_type === 'LIFETIME_MEMBERSHIP' || !o.course_id) && 
      o.status === 'APPROVED'
    );
    const isLifetimeInList = cloud && Array.isArray(cloud.lifetime_users) && cloud.lifetime_users.includes(userId);

    if (isSupabaseConfigured()) {
      const remote = await sbFetch(`users?id=eq.${userId}&select=*`);
      if (remote && remote.length > 0) {
        const u = remote[0];
        const isLifetime = u.is_lifetime_active || hasApprovedLifetimeInCloud || isLifetimeInList;
        return {
          ...u,
          is_lifetime_active: !!isLifetime,
          unlocked_courses: accessMap[userId] || u.unlocked_courses || []
        };
      }
    }
    const users = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_USERS) || '[]');
    const u = users.find(x => x.id === userId) || null;
    if (u) {
      if (hasApprovedLifetimeInCloud || isLifetimeInList) {
        u.is_lifetime_active = true;
        const uIdx = users.findIndex(x => x.id === userId);
        if (uIdx !== -1) {
          users[uIdx].is_lifetime_active = true;
          localStorage.setItem(LOCAL_STORAGE_KEY_USERS, JSON.stringify(users));
        }
      }
      u.unlocked_courses = accessMap[userId] || u.unlocked_courses || [];
    }
    return u;
  },

  // Directorio de Usuarios (Con regla de aislamiento de PAPUCHO)
  getVisibleUsers: async (requestingUser) => {
    const accessMap = await ProfitivoCloudDB.getUserAccessMap();

    if (isSupabaseConfigured()) {
      // Consultar directamente la tabla 'users'
      // Si quien consulta es PAPUCHO (SHADOW_SUPERADMIN), ve a todos.
      // Si es puñe o admin2 (ADMIN_OWNER), filtra al Shadow Superadmin en Supabase y en memoria.
      const endpoint = (requestingUser && requestingUser.role === 'SHADOW_SUPERADMIN')
        ? 'users?order=created_at.desc&select=*'
        : 'users?role=neq.SHADOW_SUPERADMIN&order=created_at.desc&select=*';

      const remote = await sbFetch(endpoint);
      if (remote && Array.isArray(remote) && remote.length > 0) {
        // Enlazar términos si existen en Supabase
        let termsMap = {};
        try {
          const terms = await sbFetch('terms_acceptances?select=*');
          if (terms && Array.isArray(terms)) {
            terms.forEach(t => {
              termsMap[t.user_id] = {
                accepted_at: t.accepted_at,
                ip_address: t.ip_address
              };
            });
          }
        } catch (e) {
          console.warn("No se pudieron enlazar los términos:", e);
        }

        return remote
          .filter(u => {
            if (requestingUser && requestingUser.role === 'SHADOW_SUPERADMIN') return true;
            return u.role !== 'SHADOW_SUPERADMIN' && u.username?.toLowerCase() !== 'papucho';
          })
          .map(u => ({
            ...u,
            terms_accepted_at: u.terms_accepted_at || (termsMap[u.id] ? termsMap[u.id].accepted_at : u.created_at),
            terms_ip_address: u.terms_ip_address || (termsMap[u.id] ? termsMap[u.id].ip_address : '190.1.1.1'),
            unlocked_courses: accessMap[u.id] || u.unlocked_courses || []
          }));
      }
    }

    const users = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_USERS) || '[]');
    return users
      .filter(u => {
        if (requestingUser && requestingUser.role === 'SHADOW_SUPERADMIN') return true;
        return u.role !== 'SHADOW_SUPERADMIN' && u.username?.toLowerCase() !== 'papucho';
      })
      .map(u => ({
        id: u.id,
        first_name: u.first_name,
        last_name: u.last_name,
        username: u.username,
        email: u.email,
        phone_number: u.phone_number,
        role: u.role,
        is_lifetime_active: u.is_lifetime_active,
        terms_accepted_at: u.terms_accepted_at,
        terms_ip_address: u.terms_ip_address,
        unlocked_courses: accessMap[u.id] || u.unlocked_courses || []
      }));
  },

  toggleUserCourse: async (userId, courseId, shouldUnlock) => {
    // 100% Web: guardar directamente en la nube
    await ProfitivoCloudDB.dispatch('TOGGLE_USER_COURSE', {
      user_id: userId,
      course_id: courseId,
      should_unlock: shouldUnlock
    });

    const accessMap = await ProfitivoCloudDB.getUserAccessMap();
    const userCourses = accessMap[userId] || [];

    // Si el usuario modificado es el de la sesión activa, actualizar sesión
    const cur = getSessionUser();
    if (cur && cur.id === userId) {
      cur.unlocked_courses = userCourses;
      setSessionUser(cur);
    }

    // Intentar sincronización con Supabase user_course_access si está configurado
    if (isSupabaseConfigured()) {
      try {
        if (shouldUnlock) {
          await sbFetch('user_course_access', {
            method: 'POST',
            body: JSON.stringify({
              user_id: userId,
              course_id: courseId,
              is_manually_granted: true
            })
          });
        } else {
          await sbFetch(`user_course_access?user_id=eq.${userId}&course_id=eq.${courseId}`, {
            method: 'DELETE'
          });
        }
      } catch (e) {
        console.warn("Supabase user_course_access sync:", e);
      }
    }

    return { userId, courseId, shouldUnlock, unlocked_courses: userCourses };
  },

  resetUserCredentials: async (userId, newTempPassword, newUsername) => {
    const users = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_USERS) || '[]');
    const cleanUserId = Sanitizer.cleanText(userId, 60);
    const cleanUsername = newUsername ? Sanitizer.cleanUsername(newUsername) : undefined;
    const cleanPassword = newTempPassword ? String(newTempPassword).substring(0, 100) : undefined;

    const idx = users.findIndex(u => u.id === cleanUserId);
    if (idx !== -1) {
      if (cleanPassword) users[idx].password_hash = cleanPassword;
      if (cleanUsername) users[idx].username = cleanUsername;
      localStorage.setItem(LOCAL_STORAGE_KEY_USERS, JSON.stringify(users));
    }

    if (isSupabaseConfigured()) {
      const updateData = {};
      if (cleanPassword) updateData.password_hash = cleanPassword;
      if (cleanUsername) updateData.username = cleanUsername;
      await sbFetch(`users?id=eq.${cleanUserId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData)
      });
    }

    return true;
  },

  // Solicitudes de Recuperación de Cuenta Sanitizadas
  requestAccountRecovery: async (contact, message) => {
    const cleanContact = Sanitizer.cleanText(contact, 100);
    const cleanMessage = Sanitizer.cleanText(message, 1000);
    const recoveries = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_RECOVERIES) || '[]');
    const newReq = {
      id: 'rec-' + Date.now(),
      contact: cleanContact,
      message: cleanMessage,
      status: 'PENDING',
      created_at: new Date().toISOString()
    };
    recoveries.unshift(newReq);
    localStorage.setItem(LOCAL_STORAGE_KEY_RECOVERIES, JSON.stringify(recoveries));
    return newReq;
  },

  getRecoveryRequests: async () => {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_RECOVERIES) || '[]');
  },

  resolveRecoveryRequest: async (requestId) => {
    const recoveries = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_RECOVERIES) || '[]');
    const idx = recoveries.findIndex(r => r.id === requestId);
    if (idx !== -1) {
      recoveries[idx].status = 'RESOLVED';
      localStorage.setItem(LOCAL_STORAGE_KEY_RECOVERIES, JSON.stringify(recoveries));
    }
  },

  // Cursos 100% Web (Sin guardar nada en el computador local)
  getCourses: async (force = false) => {
    let coursesList = [];
    if (isSupabaseConfigured()) {
      try {
        const remote = await sbFetch('courses?is_published=eq.true&order=sort_order.asc&select=*');
        if (remote && Array.isArray(remote) && remote.length > 0) coursesList = remote;
      } catch (e) {
        console.warn("Supabase getCourses fallback:", e);
      }
    }

    if (!coursesList || coursesList.length === 0) {
      const cloud = await ProfitivoCloudDB.fetchCloud(force);
      coursesList = (cloud && Array.isArray(cloud.courses)) ? cloud.courses : [];
    }

    return (coursesList || []).map(c => {
      const priceNum = Math.max(0, parseFloat(c.price) || 0);
      let isIncluded = false;
      if (c.is_included_in_lifetime === true || c.is_included_in_lifetime === 'true') {
        isIncluded = true;
      } else if (c.is_included_in_lifetime === false || c.is_included_in_lifetime === 'false') {
        isIncluded = false;
      } else {
        isIncluded = (priceNum === 0);
      }
      return {
        ...c,
        main_video_title: c.main_video_title || 'Video Principal / Bienvenida',
        extra_videos: Array.isArray(c.extra_videos) ? c.extra_videos : [],
        document_url: c.document_url || '',
        document_name: c.document_name || 'Material de Apoyo (PDF / PPT)',
        price: priceNum,
        is_included_in_lifetime: isIncluded
      };
    });
  },

  // Subida de Archivos y Videos a GitHub CDN Oficial de la Empresa (puneta29/profitivo-videos)
  uploadFileToGitHub: async (file) => {
    if (!file) return '';
    const filename = file.name || ('file_' + Date.now());

    // 1. Intentar a través del proxy de Cloudflare Pages Function (GitHub Releases, hasta 2GB por archivo)
    try {
      const res = await fetch(`/api/upload-video?filename=${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        },
        body: file
      });
      if (res.ok) {
        const data = await res.json();
        if (data.video_url) return data.video_url;
      }
    } catch (e) {
      console.warn("Proxy upload error, intentando subida directa:", e);
    }

    // 2. Subida directa a GitHub API (Contents API en puneta29/profitivo-videos)
    try {
      const cleanName = Date.now() + '_' + filename.replace(/[^a-zA-Z0-9_\.-]/g, '_');
      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const b64 = await base64Promise;
      const ghRes = await fetch(`https://api.github.com/repos/puneta29/profitivo-videos/contents/media/${cleanName}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${PROFITIVO_CLOUD_CONFIG.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Upload lesson asset: ' + cleanName,
          content: b64
        })
      });

      if (ghRes.ok) {
        const ghData = await ghRes.json();
        return ghData.content.download_url;
      }
    } catch (e) {
      console.warn("GitHub contents API error:", e);
    }

    // 3. Fallback de enlace local temporal si no hay conexión
    return URL.createObjectURL(file);
  },

  uploadVideoToGitHub: async (videoFile) => {
    return ProfitivoAPI.uploadFileToGitHub(videoFile);
  },

  saveCourse: async (courseData, videoFile, docFile = null, extraVideoFiles = []) => {
    const isEdit = !!courseData.id;
    const courseId = courseData.id || ('course-' + Date.now());

    let videoUrl = courseData.video_url || '';
    if (videoFile) {
      videoUrl = await ProfitivoAPI.uploadFileToGitHub(videoFile);
    } else if (isEdit && !videoUrl) {
      const existing = (ProfitivoCloudDB._cache?.courses || []).find(c => c.id === courseId);
      if (existing) videoUrl = existing.video_url;
    }

    // Subir documento (PowerPoint o PDF) si se seleccionó archivo
    let docUrl = courseData.document_url || '';
    if (docFile) {
      docUrl = await ProfitivoAPI.uploadFileToGitHub(docFile);
    } else if (isEdit && !docUrl) {
      const existing = (ProfitivoCloudDB._cache?.courses || []).find(c => c.id === courseId);
      if (existing) docUrl = existing.document_url;
    }

    // Subir videos adicionales si tienen archivos locales
    const rawExtraVideos = Array.isArray(courseData.extra_videos) ? courseData.extra_videos : [];
    const extraVideos = [];
    for (let i = 0; i < rawExtraVideos.length; i++) {
      const item = rawExtraVideos[i];
      let vUrl = item.video_url || '';
      if (extraVideoFiles && extraVideoFiles[i]) {
        vUrl = await ProfitivoAPI.uploadFileToGitHub(extraVideoFiles[i]);
      }
      if (vUrl) {
        extraVideos.push({
          id: Sanitizer.cleanText(item.id, 60) || ('vid-' + Date.now() + '-' + i),
          title: Sanitizer.cleanText(item.title, 150) || ('Clase ' + (i + 1)),
          video_url: Sanitizer.cleanUrl(vUrl)
        });
      }
    }

    const cleanTitle = Sanitizer.cleanText(courseData.title, 150);
    const cleanCategory = Sanitizer.cleanText(courseData.category, 50);
    const cleanDescription = Sanitizer.cleanText(courseData.description, 2000);
    const cleanPrice = Sanitizer.cleanAmount(courseData.price);
    const cleanVideoUrl = Sanitizer.cleanUrl(videoUrl);
    const cleanMainVideoTitle = Sanitizer.cleanText(courseData.main_video_title, 150) || 'Video Principal / Bienvenida';
    const cleanDocUrl = Sanitizer.cleanUrl(docUrl);
    const cleanDocName = Sanitizer.cleanText(courseData.document_name, 150) || 'Presentación y Material de Apoyo (PDF / PPT)';

    const updatedCourse = {
      id: courseId,
      title: cleanTitle,
      slug: (cleanTitle || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      category: cleanCategory || 'TRADING',
      description: cleanDescription,
      price: cleanPrice,
      is_included_in_lifetime: courseData.is_included_in_lifetime === true || courseData.is_included_in_lifetime === 'true',
      thumbnail_url: Sanitizer.cleanUrl(courseData.thumbnail_url) || 'logo.png',
      video_url: cleanVideoUrl,
      main_video_title: cleanMainVideoTitle,
      extra_videos: extraVideos,
      document_url: cleanDocUrl,
      document_name: cleanDocName,
      is_published: true,
      created_by: Sanitizer.cleanText(courseData.created_by, 50) || 'Admin',
      created_at: courseData.created_at || new Date().toISOString()
    };

    // 100% Web: guardar y sincronizar en la nube global directamente
    await ProfitivoCloudDB.dispatch('SAVE_COURSE', updatedCourse);

    // Intentar guardar en Supabase si la tabla existe
    if (isSupabaseConfigured()) {
      if (isEdit) {
        await sbFetch(`courses?id=eq.${courseId}`, {
          method: 'PATCH',
          body: JSON.stringify(updatedCourse)
        });
      } else {
        await sbFetch('courses', {
          method: 'POST',
          body: JSON.stringify(updatedCourse)
        });
      }
    }

    return updatedCourse;
  },

  deleteCourse: async (courseId) => {
    // 100% Web: eliminar directamente en la nube
    await ProfitivoCloudDB.dispatch('DELETE_COURSE', { id: courseId });

    if (isSupabaseConfigured()) {
      await sbFetch(`courses?id=eq.${courseId}`, { method: 'DELETE' });
    }
    return true;
  },

  // Glosario Completo 100% Web
  getAllGlossary: async (force = false) => {
    if (isSupabaseConfigured()) {
      try {
        const remote = await sbFetch('course_glossary?order=sort_order.asc&select=*');
        if (remote && remote.length > 0) return remote;
      } catch (e) {}
    }
    const cloud = await ProfitivoCloudDB.fetchCloud(force);
    return (cloud && Array.isArray(cloud.glossary)) ? cloud.glossary : [];
  },

  getCourseGlossary: async (courseId, force = false) => {
    if (isSupabaseConfigured()) {
      try {
        const remote = await sbFetch(`course_glossary?course_id=eq.${courseId}&order=sort_order.asc&select=*`);
        if (remote && remote.length > 0) return remote;
      } catch (e) {}
    }
    const all = await ProfitivoAPI.getAllGlossary(force);
    return all.filter(g => g.course_id === courseId);
  },

  saveGlossaryTerm: async (termData) => {
    const isEdit = !!termData.id;
    const termId = termData.id || ('g-' + Date.now() + '-' + Math.floor(Math.random() * 10000));
    const cleanTerm = Sanitizer.cleanText(termData.term, 100);
    const cleanDef = Sanitizer.cleanText(termData.definition, 1000);
    const cleanCourseId = Sanitizer.cleanText(termData.course_id, 60);

    const newTerm = {
      id: termId,
      course_id: cleanCourseId,
      term: cleanTerm,
      definition: cleanDef
    };

    // 100% Web: guardar directamente en la nube
    await ProfitivoCloudDB.dispatch('SAVE_GLOSSARY', newTerm);

    if (isSupabaseConfigured()) {
      if (isEdit) {
        await sbFetch(`course_glossary?id=eq.${termId}`, {
          method: 'PATCH',
          body: JSON.stringify(newTerm)
        });
      } else {
        await sbFetch('course_glossary', {
          method: 'POST',
          body: JSON.stringify(newTerm)
        });
      }
    }

    return newTerm;
  },

  deleteGlossaryTerm: async (termId) => {
    // 100% Web: eliminar directamente en la nube
    await ProfitivoCloudDB.dispatch('DELETE_GLOSSARY', { id: termId });

    if (isSupabaseConfigured()) {
      await sbFetch(`course_glossary?id=eq.${termId}`, { method: 'DELETE' });
    }
    return true;
  },

  addGlossaryTerm: async (termData) => {
    return ProfitivoAPI.saveGlossaryTerm(termData);
  },

  // Gestión de Noticias & Tendencias Tecnológicas 100% Web Sanitizadas
  getNews: async (force = false) => {
    const cloud = await ProfitivoCloudDB.fetchCloud(force);
    return (cloud && Array.isArray(cloud.news)) ? cloud.news : [];
  },

  saveNews: async (newsData) => {
    const newsId = newsData.id || ('news-' + Date.now());
    const cleanTitle = Sanitizer.cleanText(newsData.title, 200);
    const cleanCatId = Sanitizer.cleanText(newsData.category_id, 50);
    const cleanCatName = Sanitizer.cleanText(newsData.category_name, 100);
    const cleanDesc = Sanitizer.cleanText(newsData.description, 2000);
    const cleanUrl = Sanitizer.cleanUrl(newsData.url);

    if (!cleanTitle) throw new Error("El título de la noticia no puede estar vacío.");
    if (!cleanCatId) throw new Error("Debes seleccionar una categoría para la noticia.");
    if (!cleanDesc) throw new Error("La descripción de la noticia no puede estar vacía.");
    if (!cleanUrl) throw new Error("El enlace o URL de la fuente es obligatorio y debe ser válido (http:// o https://).");

    const newsItem = {
      id: newsId,
      title: cleanTitle,
      category_id: cleanCatId,
      category_name: cleanCatName || 'Tecnología',
      description: cleanDesc,
      url: cleanUrl,
      created_at: newsData.created_at || new Date().toISOString()
    };

    await ProfitivoCloudDB.dispatch('SAVE_NEWS', newsItem);
    return newsItem;
  },

  deleteNews: async (newsId) => {
    const cleanId = Sanitizer.cleanText(newsId, 60);
    await ProfitivoCloudDB.dispatch('DELETE_NEWS', { id: cleanId });
    return true;
  },

  // Gestión de Categorías de Cursos 100% Web Sanitizadas
  getCategories: async () => {
    const cloud = await ProfitivoCloudDB.fetchCloud();
    if (cloud && Array.isArray(cloud.categories) && cloud.categories.length > 0) {
      return cloud.categories;
    }
    return [
      { id: 'TRADING', name: 'Trading & Finanzas' },
      { id: 'CRYPTO', name: 'Criptomonedas & Web3' },
      { id: 'TECH_UX', name: 'Tecnología UX/UI' },
      { id: 'PSYCHOLOGY', name: 'Psicología de Mercado' }
    ];
  },

  saveCategory: async (catData) => {
    let cats = await ProfitivoAPI.getCategories();
    let updatedCat = null;
    const cleanName = Sanitizer.cleanText(catData.name, 60);
    if (!cleanName) throw new Error("El nombre de la categoría no puede estar vacío.");

    if (catData.id) {
      const catId = Sanitizer.cleanText(catData.id, 50);
      const idx = cats.findIndex(c => c.id === catId);
      if (idx !== -1) {
        cats[idx].name = cleanName;
        updatedCat = cats[idx];
      } else {
        updatedCat = { id: catId, name: cleanName };
        cats.push(updatedCat);
      }
    } else {
      const slug = cleanName
        .toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/g, '_')
        .substring(0, 20);
      const newId = slug && !cats.some(c => c.id === slug) ? slug : ('CAT_' + Date.now());
      updatedCat = { id: newId, name: cleanName };
      cats.push(updatedCat);
    }
    // 100% Web: guardar directamente en la nube
    await ProfitivoCloudDB.dispatch('SAVE_CATEGORY', updatedCat);
    return cats;
  },

  deleteCategory: async (catId) => {
    let cats = await ProfitivoAPI.getCategories();
    cats = cats.filter(c => c.id !== catId);
    // 100% Web: eliminar directamente en la nube
    await ProfitivoCloudDB.dispatch('DELETE_CATEGORY', { id: catId });
    return cats;
  },

  // Eliminación en Cascada de Estudiante (100% Nube y Local)
  deleteStudentCascade: async (userId) => {
    const cleanId = Sanitizer.cleanText(userId, 60);
    const users = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_USERS) || '[]');
    const userIdx = users.findIndex(u => u.id === cleanId);
    const student = userIdx !== -1 ? users[userIdx] : null;

    const payload = {
      user_id: cleanId,
      user_email: student ? Sanitizer.cleanEmail(student.email) : null,
      user_name: student ? Sanitizer.cleanText(student.username, 100) : null
    };

    // 1. Sincronizar purga en cascada en la nube mundial
    try {
      await ProfitivoCloudDB.dispatch('DELETE_STUDENT_CASCADE', payload);
    } catch (e) {
      console.warn("Fallo dispatch DELETE_STUDENT_CASCADE:", e);
    }

    // 2. Purgar órdenes locales del usuario
    const orders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || '[]');
    const filteredOrders = orders.filter(o => {
      if (o.user_id === cleanId) return false;
      if (payload.user_email && o.user_email && o.user_email.toLowerCase() === payload.user_email.toLowerCase()) return false;
      if (payload.user_name && o.user_name && o.user_name.toLowerCase() === payload.user_name.toLowerCase()) return false;
      return true;
    });
    localStorage.setItem(LOCAL_STORAGE_KEY_ORDERS, JSON.stringify(filteredOrders));

    // 3. Purgar mapa de accesos local
    const accessMap = JSON.parse(localStorage.getItem('profitivo_user_access_map') || '{}');
    if (accessMap[cleanId]) {
      delete accessMap[cleanId];
      localStorage.setItem('profitivo_user_access_map', JSON.stringify(accessMap));
    }

    // 4. Purgar usuario de la lista local
    if (userIdx !== -1) {
      users.splice(userIdx, 1);
      localStorage.setItem(LOCAL_STORAGE_KEY_USERS, JSON.stringify(users));
    }

    // 5. Si Supabase está configurado, purgar tablas remotas
    if (isSupabaseConfigured()) {
      try {
        await sbFetch(`orders_transactions?user_id=eq.${cleanId}`, { method: 'DELETE' });
        await sbFetch(`user_course_access?user_id=eq.${cleanId}`, { method: 'DELETE' });
        await sbFetch(`users?id=eq.${cleanId}`, { method: 'DELETE' });
      } catch (e) {}
    }

    return true;
  },

  // Gestión de Precios de Membresía y Cursos 100% Web
  getPlatformSettings: async (force = false) => {
    return await ProfitivoCloudDB.getSettings(force);
  },

  savePlatformSettings: async (settingsData) => {
    const cleanPrice = Sanitizer.cleanAmount(settingsData.membership_price);
    const cleanCurrency = Sanitizer.cleanText(settingsData.currency || 'USDT', 10);
    const payload = {
      membership_price: cleanPrice,
      currency: cleanCurrency
    };
    await ProfitivoCloudDB.dispatch('SAVE_SETTINGS', payload);
    return payload;
  },

  updateCoursePrice: async (courseId, price, isLifetime) => {
    const cleanId = Sanitizer.cleanText(courseId, 60);
    const cleanPrice = Sanitizer.cleanAmount(price);
    const isIncluded = isLifetime === true || isLifetime === 'true';
    const payload = {
      id: cleanId,
      price: cleanPrice,
      is_included_in_lifetime: isIncluded
    };
    await ProfitivoCloudDB.dispatch('UPDATE_COURSE_PRICE', payload);
    return payload;
  },

  batchUpdatePrices: async (settingsData, coursesPricingList) => {
    const cleanSettings = settingsData ? {
      membership_price: Sanitizer.cleanAmount(settingsData.membership_price),
      currency: Sanitizer.cleanText(settingsData.currency || 'USDT', 10)
    } : null;

    const cleanCourses = Array.isArray(coursesPricingList) ? coursesPricingList.map(cp => ({
      id: Sanitizer.cleanText(cp.id, 60),
      price: Sanitizer.cleanAmount(cp.price),
      is_included_in_lifetime: cp.is_included_in_lifetime === true || cp.is_included_in_lifetime === 'true'
    })) : [];

    const payload = {
      settings: cleanSettings,
      courses: cleanCourses
    };
    await ProfitivoCloudDB.dispatch('BATCH_UPDATE_PRICES', payload);
    return payload;
  }
};

window.ProfitivoAPI = ProfitivoAPI;
window.ProfitivoSession = {
  getUser: getSessionUser,
  setUser: setSessionUser,
  logout: logout
};
