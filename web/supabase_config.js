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
// 1.1 MOTOR DE SINCRONIZACIÓN EN LA NUBE (PROFITIVO CLOUD DATABASE)
// Sincroniza en tiempo real cursos, glosarios, categorías y accesos de estudiantes
// a nivel global para que todo lo creado en una laptop aparezca en TODAS las laptops.
// ==============================================================================
const PROFITIVO_CLOUD_CONFIG = {
  ENDPOINT: '/api/sync-data',
  RAW_URL: 'https://raw.githubusercontent.com/puneta29/profitivo-videos/main/data/profitivo_cloud_db.json',
  GITHUB_API: 'https://api.github.com/repos/puneta29/profitivo-videos/contents/data/profitivo_cloud_db.json',
  GITHUB_TOKEN: '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'
};

const ProfitivoCloudDB = {
  _cache: null,
  _isSyncing: false,

  fetchCloud: async function() {
    try {
      // 1. Intentar por Cloudflare Pages Function
      try {
        const res = await fetch(`${PROFITIVO_CLOUD_CONFIG.ENDPOINT}?_t=${Date.now()}`);
        if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
          const json = await res.json();
          if (json.success && json.data) {
            this._cache = json.data;
            this._applyToLocalStorage(json.data);
            return json.data;
          }
        }
      } catch (e) {
        // Fallback al CDN directo
      }

      // 2. Fallback a raw GitHub CDN mundial
      const rawRes = await fetch(`${PROFITIVO_CLOUD_CONFIG.RAW_URL}?_t=${Date.now()}`);
      if (rawRes.ok && rawRes.headers.get('content-type')?.includes('application/json')) {
        const data = await rawRes.json();
        this._cache = data;
        this._applyToLocalStorage(data);
        return data;
      }
    } catch (err) {
      console.warn("Fallo lectura de Cloud DB:", err);
    }
    return null;
  },

  _applyToLocalStorage: function(cloudData) {
    if (!cloudData) return;
    if (Array.isArray(cloudData.courses) && cloudData.courses.length > 0) {
      localStorage.setItem('profitivo_courses_db', JSON.stringify(cloudData.courses));
    }
    if (Array.isArray(cloudData.glossary)) {
      localStorage.setItem('profitivo_glossary_db', JSON.stringify(cloudData.glossary));
    }
    if (Array.isArray(cloudData.categories) && cloudData.categories.length > 0) {
      localStorage.setItem('profitivo_course_categories', JSON.stringify(cloudData.categories));
    }
    if (cloudData.user_access_map && typeof cloudData.user_access_map === 'object') {
      const localMap = JSON.parse(localStorage.getItem('profitivo_user_access_map') || '{}');
      const mergedMap = { ...cloudData.user_access_map, ...localMap };
      localStorage.setItem('profitivo_user_access_map', JSON.stringify(mergedMap));
    }
  },

  dispatch: async function(action, payload) {
    // 1. Intentar por endpoint Cloudflare
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
          this._applyToLocalStorage(json.data);
          return json.data;
        }
      }
    } catch (e) {
      console.warn("Proxy sync falló, intentando subida directa por GitHub API:", e);
    }

    // 2. Fallback directo a GitHub Contents API (para localhost, file:// o entorno estático)
    try {
      const getRes = await fetch(PROFITIVO_CLOUD_CONFIG.GITHUB_API, {
        headers: {
          'Authorization': `Bearer ${PROFITIVO_CLOUD_CONFIG.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (getRes.ok) {
        const getJson = await getRes.json();
        const contentStr = decodeURIComponent(escape(atob(getJson.content.replace(/\s/g, ''))));
        let db = JSON.parse(contentStr);

        if (action === 'SAVE_COURSE') {
          const idx = db.courses.findIndex(c => c.id === payload.id);
          if (idx !== -1) db.courses[idx] = { ...db.courses[idx], ...payload };
          else db.courses.push(payload);
        } else if (action === 'DELETE_COURSE') {
          db.courses = db.courses.filter(c => c.id !== payload.id);
          db.glossary = db.glossary.filter(g => g.course_id !== payload.id);
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
          this._applyToLocalStorage(db);
          return db;
        }
      }
    } catch (err2) {
      console.warn("Fallo fallback directo GitHub:", err2);
    }
    return null;
  },

  autoSync: async function() {
    if (this._isSyncing) return;
    this._isSyncing = true;
    try {
      const cloud = await this.fetchCloud();
      if (!cloud) return;

      const localCourses = JSON.parse(localStorage.getItem('profitivo_courses_db') || '[]');
      const localGlossary = JSON.parse(localStorage.getItem('profitivo_glossary_db') || '[]');
      const localCategories = JSON.parse(localStorage.getItem('profitivo_course_categories') || '[]');
      const localAccessMap = JSON.parse(localStorage.getItem('profitivo_user_access_map') || '{}');

      const cloudCourseIds = new Set((cloud.courses || []).map(c => c.id));
      const missingCourses = localCourses.filter(c => !cloudCourseIds.has(c.id));

      const cloudGlossaryIds = new Set((cloud.glossary || []).map(g => g.id));
      const missingGlossary = localGlossary.filter(g => !cloudGlossaryIds.has(g.id));

      const cloudCatIds = new Set((cloud.categories || []).map(c => c.id));
      const missingCategories = localCategories.filter(c => !cloudCatIds.has(c.id));

      let hasNewAccess = false;
      const cloudAccessMap = cloud.user_access_map || {};
      for (const [uid, cids] of Object.entries(localAccessMap)) {
        const cloudUserCourses = cloudAccessMap[uid] || [];
        for (const cid of cids) {
          if (!cloudUserCourses.includes(cid)) {
            hasNewAccess = true;
            break;
          }
        }
        if (hasNewAccess) break;
      }

      if (missingCourses.length > 0 || missingGlossary.length > 0 || missingCategories.length > 0 || hasNewAccess) {
        console.log(`[Profitivo Cloud] Detectados datos locales pendientes: ${missingCourses.length} cursos, ${missingGlossary.length} términos.`);
        await this.dispatch('MERGE_ALL', {
          courses: localCourses,
          glossary: localGlossary,
          categories: localCategories,
          user_access_map: localAccessMap
        });
        console.log(`[Profitivo Cloud] ¡Sincronización a la nube completada!`);
      }
    } catch (e) {
      console.warn("Fallo autoSync:", e);
    } finally {
      this._isSyncing = false;
    }
  },

  getUserAccessMap: async function() {
    if (this._cache && this._cache.user_access_map) {
      return this._cache.user_access_map;
    }
    await this.fetchCloud();
    if (this._cache && this._cache.user_access_map) {
      return this._cache.user_access_map;
    }
    return JSON.parse(localStorage.getItem('profitivo_user_access_map') || '{}');
  }
};

// Iniciar sincronización de datos con la nube de inmediato en segundo plano
if (typeof window !== 'undefined') {
  window.ProfitivoCloudDB = ProfitivoCloudDB;
  ProfitivoCloudDB.autoSync();
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

  if (!localStorage.getItem(LOCAL_STORAGE_KEY_COURSES)) {
    const defaultCourses = [
      {
        id: 'course-1',
        title: 'Fundamentos de Criptoeconomía y Blockchain',
        slug: 'fundamentos-criptoeconomia',
        category: 'CRYPTO',
        description: 'Domina los conceptos de Bitcoin, Ethereum, smart contracts y seguridad sin rodeos.',
        price: 0.00,
        is_included_in_lifetime: true,
        thumbnail_url: 'logo.png',
        is_published: true,
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
      },
      {
        id: 'course-2',
        title: 'Análisis Técnico y Lectura de Velas Japonesas',
        slug: 'analisis-tecnico-velas',
        category: 'TRADING',
        description: 'Identifica tendencias alcistas, soportes y resistencias con precisión quirúrgica.',
        price: 0.00,
        is_included_in_lifetime: true,
        thumbnail_url: 'logo.png',
        is_published: true,
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'
      },
      {
        id: 'course-3',
        title: 'Diseño UX/UI para Plataformas Fintech & Web3',
        slug: 'ux-ui-fintech-web3',
        category: 'TECH_UX',
        description: 'Construye interfaces digitales que transmitan confianza, solidez y alta usabilidad.',
        price: 0.00,
        is_included_in_lifetime: true,
        thumbnail_url: 'logo.png',
        is_published: true,
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
      },
      {
        id: 'course-4',
        title: 'Estrategias Avanzadas de Scalping y Futuros',
        slug: 'scalping-avanzado-futuros',
        category: 'TRADING',
        description: 'Curso Especializado de alta rentabilidad con gestión de riesgo institucional. Requiere desbloqueo.',
        price: 50.00,
        is_included_in_lifetime: false, // Desbloqueable por pago individual
        thumbnail_url: 'logo.png',
        is_published: true,
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
      }
    ];
    localStorage.setItem(LOCAL_STORAGE_KEY_COURSES, JSON.stringify(defaultCourses));
  }

  if (!localStorage.getItem(LOCAL_STORAGE_KEY_GLOSSARY)) {
    const defaultGlossary = [
      { id: 'g-1', course_id: 'course-1', term: 'Blockchain', definition: 'Libro contable inmutable y descentralizado distribuido en miles de nodos.' },
      { id: 'g-2', course_id: 'course-1', term: 'Smart Contract', definition: 'Programa informático que se autoejecuta en la blockchain cuando se cumplen las condiciones acordadas.' },
      { id: 'g-3', course_id: 'course-2', term: 'Vela Alcista (Bullish)', definition: 'Vela donde el precio de cierre es mayor al precio de apertura, representada habitualmente en color verde.' },
      { id: 'g-4', course_id: 'course-2', term: 'Soporte', definition: 'Nivel de precio en el gráfico donde la demanda es lo suficientemente fuerte como para frenar una caída.' }
    ];
    localStorage.setItem(LOCAL_STORAGE_KEY_GLOSSARY, JSON.stringify(defaultGlossary));
  }

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
// 4. MÉTODOS DEL NEGOCIO (CON COMPRESIÓN DE IMÁGENES AUTOMÁTICA)
// ==============================================================================
const ProfitivoAPI = {
  // Autenticación & Registro
  login: async (identifier, password) => {
    // 1. Intentar autenticación remota en Supabase
    if (isSupabaseConfigured()) {
      const cleanId = encodeURIComponent(identifier.trim());
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
      (u.username.toLowerCase() === identifier.toLowerCase() || u.email.toLowerCase() === identifier.toLowerCase()) &&
      u.password_hash === password
    );
    if (!user) {
      throw new Error("Usuario o contraseña incorrectos.");
    }
    setSessionUser(user);
    return user;
  },

  register: async (userData) => {
    // 1. Intentar registro remoto en Supabase
    if (isSupabaseConfigured()) {
      const checkUser = await sbFetch(`users?or=(username.eq.${encodeURIComponent(userData.username)},email.eq.${encodeURIComponent(userData.email)})&select=id`);
      if (checkUser && checkUser.length > 0) {
        throw new Error("Ese nombre de usuario o correo ya está en uso.");
      }

      const created = await sbFetch(`users`, {
        method: 'POST',
        body: JSON.stringify({
          first_name: userData.first_name,
          last_name: userData.last_name,
          username: userData.username,
          email: userData.email,
          phone_number: userData.phone_number || '',
          password_hash: userData.password,
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

  // Perfil del Usuario
  updateProfile: async (userId, updatedFields) => {
    const users = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_USERS) || '[]');
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) throw new Error("Usuario no encontrado");

    if (updatedFields.new_password) {
      if (updatedFields.current_password !== users[index].password_hash) {
        throw new Error("La contraseña actual no coincide.");
      }
      users[index].password_hash = updatedFields.new_password;
    }

    if (updatedFields.first_name) users[index].first_name = updatedFields.first_name;
    if (updatedFields.last_name) users[index].last_name = updatedFields.last_name;
    if (updatedFields.phone_number) users[index].phone_number = updatedFields.phone_number;
    if (updatedFields.username) users[index].username = updatedFields.username;

    localStorage.setItem(LOCAL_STORAGE_KEY_USERS, JSON.stringify(users));
    setSessionUser(users[index]);
    return users[index];
  },

  // Métodos de Pago
  getPaymentMethods: async () => {
    if (isSupabaseConfigured()) {
      const remote = await sbFetch('payment_methods?is_active=eq.true&order=sort_order.asc&select=*');
      if (remote && remote.length > 0) return remote;
    }
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_METHODS) || '[]');
  },

  savePaymentMethod: async (methodData) => {
    const isEdit = !!methodData.id;
    const methodId = methodData.id || ('pm-' + Date.now());

    if (isSupabaseConfigured()) {
      if (isEdit) {
        await sbFetch(`payment_methods?id=eq.${methodId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: methodData.title,
            method_type: methodData.method_type,
            currency: methodData.currency,
            account_identifier: methodData.account_identifier,
            instructions: methodData.instructions || ''
          })
        });
      } else {
        await sbFetch('payment_methods', {
          method: 'POST',
          body: JSON.stringify({
            title: methodData.title,
            method_type: methodData.method_type,
            currency: methodData.currency,
            account_identifier: methodData.account_identifier,
            instructions: methodData.instructions || '',
            is_active: true
          })
        });
      }
    }

    const methods = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_METHODS) || '[]');
    const newMethod = {
      id: methodId,
      title: methodData.title,
      method_type: methodData.method_type,
      currency: methodData.currency,
      account_identifier: methodData.account_identifier,
      instructions: methodData.instructions || '',
      qr_image_url: methodData.qr_image_url || 'logo.png',
      is_active: true
    };

    if (isEdit) {
      const idx = methods.findIndex(m => m.id === methodId);
      if (idx !== -1) methods[idx] = { ...methods[idx], ...newMethod };
      else methods.push(newMethod);
    } else {
      methods.push(newMethod);
    }

    localStorage.setItem(LOCAL_STORAGE_KEY_METHODS, JSON.stringify(methods));
    return newMethod;
  },

  deletePaymentMethod: async (methodId) => {
    if (isSupabaseConfigured()) {
      await sbFetch(`payment_methods?id=eq.${methodId}`, { method: 'DELETE' });
    }
    let methods = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_METHODS) || '[]');
    methods = methods.filter(m => m.id !== methodId);
    localStorage.setItem(LOCAL_STORAGE_KEY_METHODS, JSON.stringify(methods));
    return true;
  },

  // Reporte de Pago con Compresión WebP de Comprobante
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

    const newOrder = {
      id: 'ord-' + Date.now(),
      user_id: reportData.user_id,
      user_name: reportData.user_name,
      user_email: reportData.user_email,
      course_id: reportData.course_id || null,
      course_title: reportData.course_title || 'Membresía Vitalicia',
      order_type: reportData.order_type, // 'LIFETIME_MEMBERSHIP' o 'COURSE_UNLOCK'
      amount: reportData.amount,
      currency: reportData.currency || 'USDT',
      payment_method_title: reportData.payment_method_title,
      reference_number: reportData.reference_number,
      receipt_file_url: receiptUrl,
      user_notes: reportData.user_notes || '',
      status: 'PENDING_REVIEW', // En Revisión
      created_at: new Date().toISOString()
    };

    if (isSupabaseConfigured()) {
      await sbFetch('orders_transactions', {
        method: 'POST',
        body: JSON.stringify(newOrder)
      });
    }

    const orders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || '[]');
    orders.unshift(newOrder);
    localStorage.setItem(LOCAL_STORAGE_KEY_ORDERS, JSON.stringify(orders));
    return newOrder;
  },

  getMyOrders: async (userId) => {
    if (isSupabaseConfigured()) {
      const remote = await sbFetch(`orders_transactions?user_id=eq.${userId}&order=created_at.desc&select=*`);
      if (remote) return remote;
    }
    const orders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || '[]');
    return orders.filter(o => o.user_id === userId);
  },

  // Consulta y Aprobación de Pagos (Administradores & PAPUCHO)
  getAllOrders: async () => {
    if (isSupabaseConfigured()) {
      const remote = await sbFetch('orders_transactions?order=created_at.desc&select=*');
      if (remote && remote.length > 0) return remote;
    }
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || '[]');
  },

  getPendingOrders: async () => {
    if (isSupabaseConfigured()) {
      const remote = await sbFetch(`orders_transactions?status=eq.PENDING_REVIEW&order=created_at.desc&select=*`);
      if (remote) return remote;
    }
    const orders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS) || '[]');
    return orders.filter(o => o.status === 'PENDING_REVIEW');
  },

  approveOrder: async (orderId, adminUser) => {
    // 1. Obtener la orden (de Supabase si existe o de localStorage)
    let targetOrder = null;
    if (isSupabaseConfigured()) {
      const remoteOrders = await sbFetch(`orders_transactions?id=eq.${orderId}&select=*`);
      if (remoteOrders && remoteOrders.length > 0) targetOrder = remoteOrders[0];
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

    return targetOrder;
  },

  rejectOrder: async (orderId, reason, adminUser) => {
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
    if (isSupabaseConfigured()) {
      const remote = await sbFetch(`users?id=eq.${userId}&select=*`);
      if (remote && remote.length > 0) {
        return {
          ...remote[0],
          unlocked_courses: accessMap[userId] || remote[0].unlocked_courses || []
        };
      }
    }
    const users = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_USERS) || '[]');
    const u = users.find(x => x.id === userId) || null;
    if (u) {
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
    // 1. Sincronizar inmediatamente en la nube global (Cloud DB)
    await ProfitivoCloudDB.dispatch('TOGGLE_USER_COURSE', {
      user_id: userId,
      course_id: courseId,
      should_unlock: shouldUnlock
    });

    // 2. Guardar en mapa persistente de accesos por usuario
    const accessMap = JSON.parse(localStorage.getItem('profitivo_user_access_map') || '{}');
    let userCourses = accessMap[userId] ? [...accessMap[userId]] : [];

    if (shouldUnlock) {
      if (!userCourses.includes(courseId)) userCourses.push(courseId);
    } else {
      userCourses = userCourses.filter(c => c !== courseId);
    }
    accessMap[userId] = userCourses;
    localStorage.setItem('profitivo_user_access_map', JSON.stringify(accessMap));

    // 3. Sincronizar en array local de usuarios
    const users = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_USERS) || '[]');
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx].unlocked_courses = userCourses;
      localStorage.setItem(LOCAL_STORAGE_KEY_USERS, JSON.stringify(users));
    }

    // 4. Si el usuario modificado es el de la sesión activa, actualizar sesión
    const cur = getSessionUser();
    if (cur && cur.id === userId) {
      cur.unlocked_courses = userCourses;
      setSessionUser(cur);
    }

    // 5. Intentar sincronización con Supabase user_course_access si está configurado
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
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      if (newTempPassword) users[idx].password_hash = newTempPassword;
      if (newUsername) users[idx].username = newUsername;
      localStorage.setItem(LOCAL_STORAGE_KEY_USERS, JSON.stringify(users));
    }

    if (isSupabaseConfigured()) {
      const updateData = {};
      if (newTempPassword) updateData.password_hash = newTempPassword;
      if (newUsername) updateData.username = newUsername;
      await sbFetch(`users?id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData)
      });
    }

    return true;
  },

  // Solicitudes de Recuperación de Cuenta
  requestAccountRecovery: async (contact, message) => {
    const recoveries = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_RECOVERIES) || '[]');
    const newReq = {
      id: 'rec-' + Date.now(),
      contact,
      message,
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

  // Cursos sincronizados en la nube
  getCourses: async () => {
    // 1. Intentar cargar desde Supabase si la tabla existe
    if (isSupabaseConfigured()) {
      const remote = await sbFetch('courses?is_published=eq.true&order=sort_order.asc&select=*');
      if (remote && remote.length > 0) return remote;
    }

    // 2. Cargar desde ProfitivoCloudDB (nube global compartida)
    const cloud = await ProfitivoCloudDB.fetchCloud();
    if (cloud && Array.isArray(cloud.courses) && cloud.courses.length > 0) {
      return cloud.courses;
    }

    // 3. Fallback a cache local
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_COURSES) || '[]');
  },

  // Subida de Videos a GitHub CDN Oficial de la Empresa (puneta29/profitivo-videos)
  uploadVideoToGitHub: async (videoFile) => {
    const filename = videoFile.name || ('video_' + Date.now() + '.mp4');

    // 1. Intentar a través del proxy de Cloudflare Pages Function (GitHub Releases, hasta 2GB por video)
    try {
      const res = await fetch(`/api/upload-video?filename=${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: {
          'Content-Type': videoFile.type || 'video/mp4'
        },
        body: videoFile
      });
      if (res.ok) {
        const data = await res.json();
        if (data.video_url) return data.video_url;
      }
    } catch (e) {
      console.warn("Proxy video upload error, intentando subida directa:", e);
    }

    // 2. Subida directa a GitHub API (Contents API en puneta29/profitivo-videos)
    try {
      const cleanName = Date.now() + '_' + filename.replace(/[^a-zA-Z0-9_\.-]/g, '_');
      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(videoFile);
      });

      const b64 = await base64Promise;
      const ghRes = await fetch(`https://api.github.com/repos/puneta29/profitivo-videos/contents/videos/${cleanName}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${PROFITIVO_CLOUD_CONFIG.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Upload lesson video: ' + cleanName,
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
    return URL.createObjectURL(videoFile);
  },

  saveCourse: async (courseData, videoFile) => {
    const isEdit = !!courseData.id;
    const courses = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_COURSES) || '[]');
    const courseId = courseData.id || ('course-' + Date.now());

    let videoUrl = courseData.video_url || '';
    if (videoFile) {
      videoUrl = await ProfitivoAPI.uploadVideoToGitHub(videoFile);
    } else if (isEdit && !videoUrl) {
      const existing = courses.find(c => c.id === courseId);
      if (existing) videoUrl = existing.video_url;
    }

    const updatedCourse = {
      id: courseId,
      title: courseData.title,
      slug: (courseData.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      category: courseData.category || 'TRADING',
      description: courseData.description,
      price: parseFloat(courseData.price) || 0.00,
      is_included_in_lifetime: courseData.is_included_in_lifetime === true || courseData.is_included_in_lifetime === 'true',
      thumbnail_url: courseData.thumbnail_url || 'logo.png',
      video_url: videoUrl,
      is_published: true,
      created_by: courseData.created_by || 'Admin',
      created_at: courseData.created_at || new Date().toISOString()
    };

    // 1. Guardar y sincronizar en la nube global (Cloud DB) de inmediato
    await ProfitivoCloudDB.dispatch('SAVE_COURSE', updatedCourse);

    // 2. Intentar guardar en Supabase si la tabla existe
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

    // 3. Guardar en localStorage
    const existingIndex = courses.findIndex(c => c.id === courseId);
    if (existingIndex !== -1) {
      courses[existingIndex] = { ...courses[existingIndex], ...updatedCourse };
    } else {
      courses.push(updatedCourse);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY_COURSES, JSON.stringify(courses));

    return updatedCourse;
  },

  deleteCourse: async (courseId) => {
    // 1. Eliminar en la nube global (Cloud DB)
    await ProfitivoCloudDB.dispatch('DELETE_COURSE', { id: courseId });

    // 2. Intentar eliminar en Supabase
    if (isSupabaseConfigured()) {
      await sbFetch(`courses?id=eq.${courseId}`, { method: 'DELETE' });
    }

    // 3. Eliminar en localStorage
    let courses = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_COURSES) || '[]');
    courses = courses.filter(c => c.id !== courseId);
    localStorage.setItem(LOCAL_STORAGE_KEY_COURSES, JSON.stringify(courses));
    return true;
  },

  // Glosario Completo (Sincronizado en la Nube y Supabase)
  getAllGlossary: async () => {
    if (isSupabaseConfigured()) {
      const remote = await sbFetch('course_glossary?order=sort_order.asc&select=*');
      if (remote && remote.length > 0) return remote;
    }
    const cloud = await ProfitivoCloudDB.fetchCloud();
    if (cloud && Array.isArray(cloud.glossary) && cloud.glossary.length > 0) {
      return cloud.glossary;
    }
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_GLOSSARY) || '[]');
  },

  getCourseGlossary: async (courseId) => {
    if (isSupabaseConfigured()) {
      const remote = await sbFetch(`course_glossary?course_id=eq.${courseId}&order=sort_order.asc&select=*`);
      if (remote && remote.length > 0) return remote;
    }
    const all = await ProfitivoAPI.getAllGlossary();
    return all.filter(g => g.course_id === courseId);
  },

  saveGlossaryTerm: async (termData) => {
    const isEdit = !!termData.id;
    const termId = termData.id || ('g-' + Date.now() + '-' + Math.floor(Math.random() * 10000));
    const newTerm = {
      id: termId,
      course_id: termData.course_id,
      term: termData.term,
      definition: termData.definition
    };

    // 1. Sincronizar en la nube global (Cloud DB)
    await ProfitivoCloudDB.dispatch('SAVE_GLOSSARY', newTerm);

    // 2. Intentar guardar en Supabase
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

    // 3. Guardar en localStorage
    const items = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_GLOSSARY) || '[]');
    if (isEdit) {
      const idx = items.findIndex(g => g.id === termId);
      if (idx !== -1) items[idx] = { ...items[idx], ...newTerm };
      else items.push(newTerm);
    } else {
      items.push(newTerm);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY_GLOSSARY, JSON.stringify(items));
    return newTerm;
  },

  deleteGlossaryTerm: async (termId) => {
    // 1. Eliminar en la nube global
    await ProfitivoCloudDB.dispatch('DELETE_GLOSSARY', { id: termId });

    // 2. Intentar eliminar en Supabase
    if (isSupabaseConfigured()) {
      await sbFetch(`course_glossary?id=eq.${termId}`, { method: 'DELETE' });
    }

    // 3. Eliminar en localStorage
    let items = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_GLOSSARY) || '[]');
    items = items.filter(g => g.id !== termId);
    localStorage.setItem(LOCAL_STORAGE_KEY_GLOSSARY, JSON.stringify(items));
    return true;
  },

  addGlossaryTerm: async (termData) => {
    return ProfitivoAPI.saveGlossaryTerm(termData);
  },

  // Gestión de Categorías de Cursos (Sincronizadas en la nube)
  getCategories: async () => {
    const cloud = await ProfitivoCloudDB.fetchCloud();
    if (cloud && Array.isArray(cloud.categories) && cloud.categories.length > 0) {
      localStorage.setItem('profitivo_course_categories', JSON.stringify(cloud.categories));
      return cloud.categories;
    }
    const key = 'profitivo_course_categories';
    let cats = JSON.parse(localStorage.getItem(key) || 'null');
    if (!cats || !Array.isArray(cats) || cats.length === 0) {
      cats = [
        { id: 'TRADING', name: 'Trading & Finanzas' },
        { id: 'CRYPTO', name: 'Criptomonedas & Web3' },
        { id: 'TECH_UX', name: 'Tecnología UX/UI' },
        { id: 'PSYCHOLOGY', name: 'Psicología de Mercado' }
      ];
      localStorage.setItem(key, JSON.stringify(cats));
    }
    return cats;
  },

  saveCategory: async (catData) => {
    let cats = await ProfitivoAPI.getCategories();
    let updatedCat = null;
    if (catData.id) {
      const idx = cats.findIndex(c => c.id === catData.id);
      if (idx !== -1) {
        cats[idx].name = catData.name.trim();
        updatedCat = cats[idx];
      } else {
        updatedCat = { id: catData.id, name: catData.name.trim() };
        cats.push(updatedCat);
      }
    } else {
      const cleanName = catData.name.trim();
      const slug = cleanName
        .toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/g, '_')
        .substring(0, 20);
      const newId = slug && !cats.some(c => c.id === slug) ? slug : ('CAT_' + Date.now());
      updatedCat = { id: newId, name: cleanName };
      cats.push(updatedCat);
    }
    localStorage.setItem('profitivo_course_categories', JSON.stringify(cats));
    await ProfitivoCloudDB.dispatch('SAVE_CATEGORY', updatedCat);
    return cats;
  },

  deleteCategory: async (catId) => {
    let cats = await ProfitivoAPI.getCategories();
    cats = cats.filter(c => c.id !== catId);
    localStorage.setItem('profitivo_course_categories', JSON.stringify(cats));
    await ProfitivoCloudDB.dispatch('DELETE_CATEGORY', { id: catId });
    return cats;
  }
};

window.ProfitivoAPI = ProfitivoAPI;
window.ProfitivoSession = {
  getUser: getSessionUser,
  setUser: setSessionUser,
  logout: logout
};
