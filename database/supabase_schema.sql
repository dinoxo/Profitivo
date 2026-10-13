-- ==============================================================================
-- PROFITIVO — SCRIPT OFICIAL DE BASE DE DATOS (SUPABASE / POSTGRESQL)
-- ==============================================================================
-- Este script crea todas las tablas, relaciones, vistas de seguridad para ocultar
-- al Shadow Admin (PAPUCHO), almacenamiento para comprobantes y datos iniciales.
-- ==============================================================================

-- 1. Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA DE USUARIOS
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    username VARCHAR(60) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(40),
    password_hash TEXT NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'ADMIN_OWNER', 'SHADOW_SUPERADMIN')),
    is_lifetime_active BOOLEAN NOT NULL DEFAULT FALSE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. TABLA DE ACEPTACIÓN DE CONTRATO (T&C Y POLÍTICAS)
CREATE TABLE IF NOT EXISTS public.terms_acceptances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    terms_version VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    ip_address VARCHAR(50),
    user_agent TEXT,
    accepted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. TABLA DE MÉTODOS DE PAGO CONFIGURABLES POR ADMINISTRADORES
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(120) NOT NULL,
    method_type VARCHAR(50) NOT NULL DEFAULT 'CRYPTO' CHECK (method_type IN ('CRYPTO', 'BANK_TRANSFER', 'BINANCE_PAY', 'OTHER')),
    currency VARCHAR(20) NOT NULL DEFAULT 'USDT',
    account_identifier TEXT NOT NULL, -- Dirección de Wallet o Número de Cuenta
    network VARCHAR(50) DEFAULT 'TRC20', -- Red cripto o Tipo de cuenta
    account_holder VARCHAR(150), -- Titular
    instructions TEXT, -- Pasos específicos
    qr_image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. TABLA DE CURSOS
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    category VARCHAR(60) NOT NULL DEFAULT 'TRADING' CHECK (category IN ('TRADING', 'CRYPTO', 'TECH_UX', 'FINANCE')),
    description TEXT,
    thumbnail_url TEXT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    is_included_in_lifetime BOOLEAN NOT NULL DEFAULT TRUE, -- TRUE: Cursos base; FALSE: Cursos especializados de pago individual
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. TABLA DE GLOSARIO Y DEFINICIONES TÉCNICAS DEL CURSO
CREATE TABLE IF NOT EXISTS public.course_glossary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    term VARCHAR(150) NOT NULL,
    definition TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. TABLA DE MÓDULOS DE CURSO
CREATE TABLE IF NOT EXISTS public.modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

-- 8. TABLA DE LECCIONES / VIDEOS
CREATE TABLE IF NOT EXISTS public.lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    video_url TEXT NOT NULL,
    duration_seconds INT DEFAULT 0,
    is_preview BOOLEAN DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0
);

-- 9. TABLA DE TRANSACCIONES / REPORTES DE PAGO
CREATE TABLE IF NOT EXISTS public.orders_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL, -- Nullable para Membresía Vitalicia
    payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
    order_type VARCHAR(40) NOT NULL CHECK (order_type IN ('LIFETIME_MEMBERSHIP', 'COURSE_UNLOCK')),
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(20) NOT NULL DEFAULT 'USDT',
    reference_number VARCHAR(120) NOT NULL,
    receipt_file_url TEXT NOT NULL,
    user_notes TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
    reviewed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. TABLA DE ACCESO INDIVIDUAL A CURSOS POR ALUMNO
CREATE TABLE IF NOT EXISTS public.user_course_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders_transactions(id) ON DELETE SET NULL,
    is_manually_granted BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE, -- Switch manual para bloquear
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, course_id)
);

-- 11. TABLA DE SOLICITUDES DE RECUPERACIÓN DE CUENTA (USUARIO O CONTRASEÑA)
CREATE TABLE IF NOT EXISTS public.account_recovery_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    contact_email_or_phone VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'REJECTED')),
    resolved_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- 12. TABLA DE NOTICIAS Y ACTUALIZACIONES
CREATE TABLE IF NOT EXISTS public.news_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(250) NOT NULL,
    slug VARCHAR(250) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'CRYPTO' CHECK (category IN ('CRYPTO', 'TRADING', 'TECH', 'ANNOUNCEMENT')),
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    cover_image_url TEXT,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- VISTAS DE SEGURIDAD (PROTECCIÓN DE CONTRASEÑAS Y DEL SHADOW ADMIN)
-- ==============================================================================

-- Vista que usan los 2 administradores dueños: NUNCA muestra contraseñas y NUNCA muestra a PAPUCHO
CREATE OR REPLACE VIEW public.visible_users AS
SELECT 
    u.id,
    u.first_name,
    u.last_name,
    u.username,
    u.email,
    u.phone_number,
    u.role,
    u.is_lifetime_active,
    u.must_change_password,
    u.is_active,
    u.created_at,
    ta.accepted_at AS terms_accepted_at,
    ta.ip_address AS terms_ip_address,
    ta.terms_version
FROM public.users u
LEFT JOIN LATERAL (
    SELECT accepted_at, ip_address, terms_version 
    FROM public.terms_acceptances 
    WHERE user_id = u.id 
    ORDER BY accepted_at DESC 
    LIMIT 1
) ta ON true
WHERE u.role != 'SHADOW_SUPERADMIN';

-- ==============================================================================
-- BUCKET DE STORAGE EN SUPABASE (COMPROBANTES)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('comprobantes', 'comprobantes', true)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- DATOS INICIALES SEMILLA (MÉTODOS DE PAGO Y CURSOS DE PRUEBA)
-- ==============================================================================

-- Métodos de pago iniciales configurados
INSERT INTO public.payment_methods (title, method_type, currency, account_identifier, network, account_holder, instructions, sort_order)
VALUES 
('Tether USDT (Red TRC-20)', 'CRYPTO', 'USDT', 'TXabcdef1234567890ProfitivoOfficialTRC20', 'TRC-20 (Tron)', 'Profitivo Treasury', 'Transfiera el monto exacto por la red Tron TRC20 y copie el Hash de la transacción (TxID).', 1),
('Binance Pay (ID Directo)', 'BINANCE_PAY', 'USDT', '987654321', 'Binance Internal', 'Profitivo Academy', 'Envíe mediante Binance Pay usando el ID indicado. Libre de comisiones internas.', 2),
('Transferencia Bancaria / Pago Móvil', 'BANK_TRANSFER', 'USD', '0102-0000-00-0000000000', 'Bancaribe / Banco Nacional', 'Profitivo C.A. - J-00000000-0', 'Coloque su número de cédula o referencia bancaria en el concepto.', 3)
ON CONFLICT DO NOTHING;

-- Cursos iniciales de ejemplo
INSERT INTO public.courses (title, slug, category, description, price, is_included_in_lifetime, sort_order)
VALUES 
('Fundamentos de Criptoeconomía y Blockchain', 'fundamentos-criptoeconomia', 'CRYPTO', 'Domina la estructura de Bitcoin, Ethereum, contratos inteligentes y billeteras frías sin relleno.', 0.00, true, 1),
('Análisis Técnico y Lectura de Velas Japonesas', 'analisis-tecnico-velas', 'TRADING', 'Aprende a interpretar la acción del precio, soportes, resistencias y divergencias en gráficos de trading.', 0.00, true, 2),
('Diseño UX/UI para Plataformas Fintech & Web3', 'ux-ui-fintech-web3', 'TECH_UX', 'Crea interfaces bancarias y de trading de alto rendimiento con estética profesional.', 0.00, true, 3),
('Estrategias Avanzadas de Scalping y Futuros', 'scalping-avanzado-futuros', 'TRADING', 'Masterclass intensiva de gestión de riesgo en temporalidades bajas. Desbloqueable de nivel Pro.', 49.99, false, 4)
ON CONFLICT DO NOTHING;

-- Glosario de ejemplo para el primer curso
INSERT INTO public.course_glossary (course_id, term, definition, sort_order)
SELECT id, 'Blockchain (Cadena de Bloques)', 'Libro contable digital descentralizado e inmutable que registra transacciones en una red de nodos.', 1
FROM public.courses WHERE slug = 'fundamentos-criptoeconomia'
ON CONFLICT DO NOTHING;

INSERT INTO public.course_glossary (course_id, term, definition, sort_order)
SELECT id, 'Vela Japonesa (Candlestick)', 'Representación gráfica de la acción del precio que muestra el precio de apertura, máximo, mínimo y cierre en un intervalo de tiempo.', 1
FROM public.courses WHERE slug = 'analisis-tecnico-velas'
ON CONFLICT DO NOTHING;
