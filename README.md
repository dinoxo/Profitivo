# PROFITIVO — TAKING YOU UPWARDS | TRADING SOLUTIONS

Plataforma web educativa de alto rendimiento especializada en trading institucional, criptoeconomía, tecnología y diseño UX/UI.

---

## 🚀 Despliegue en Cloudflare Pages (`profitivo.pages.dev`)

Igual que en proyectos como **NailsApp** o **SrPapa**, el despliegue en Cloudflare Pages es 100% automático y gratuito:

1. Ve a tu panel de **Cloudflare** -> **Workers & Pages** -> **Create application** -> **Pages**.
2. Conéctate con tu cuenta de GitHub y selecciona el repositorio: `dinoxo/Profitivo`.
3. Configura los parámetros de compilación (*Build settings*):
   - **Framework preset:** `None`
   - **Build command:** *(dejar en blanco / vacío)*
   - **Build output directory:** `web`
4. Haz clic en **Save and Deploy**.
5. ¡Listo! Cloudflare generará tu URL pública oficial con SSL:
   👉 **`https://profitivo.pages.dev`**

---

## 🗄️ Conexión con Supabase (Base de Datos & Storage)

1. En tu proyecto de [Supabase](https://supabase.com), entra en la barra lateral a **SQL Editor**.
2. Abre el archivo [`database/supabase_schema.sql`](./database/supabase_schema.sql), copia todo el contenido, pégalo en el editor y haz clic en **Run**.
   - Creará automáticamente las tablas (`users`, `orders_transactions`, `courses`, `course_glossary`, `payment_methods`).
   - Creará el bucket de almacenamiento seguro `comprobantes`.
   - Creará la vista de seguridad `visible_users` que oculta de forma inmutable al **Shadow Admin (PAPUCHO)**.
3. Ve a **Project Settings -> API** y copia tu `Project URL` y tu `anon public key`.
4. Pégalos en el archivo [`web/supabase_config.js`](./web/supabase_config.js).

---

## 👥 Estructura de Usuarios y Roles Iniciales

| Usuario | Rol | Contraseña Inicial | Notas |
| :--- | :--- | :--- | :--- |
| `puñe` | `ADMIN_OWNER` | `puñeta26` | Administrador Co-Fundador (Dueño 1) |
| `admin2` | `ADMIN_OWNER` | `admin2` | Administrador Co-Fundador (Dueño 2) |
| `papucho` | `SHADOW_SUPERADMIN` | `mart.Papucho1` | **Super-Admin Oculto (Invisible)** — Control Total |
| `demo1` | `STUDENT` | `demo1` | Estudiante de prueba |

---

## 🛠️ Tecnologías y Arquitectura

- **Frontend:** HTML5, CSS3 Glassmorphism (`theme_profitivo.css`), JavaScript modular.
- **Identidad Visual:** Inspirada en el logotipo oficial (Paleta *Deep Midnight*, *Neon Bullish Green*, *Prestige Gold*).
- **Compresión de Imágenes:** [`web/image_optimization.js`](./web/image_optimization.js) convierte y optimiza capturas y comprobantes bancarios a WebP reduciendo un 85-90% de peso sin perder nitidez.
- **Hosting & CDN:** Cloudflare Pages (`*.pages.dev`) con soporte PWA para celular.
