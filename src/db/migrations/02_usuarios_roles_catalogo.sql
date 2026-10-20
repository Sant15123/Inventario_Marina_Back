-- =========================================================================
-- MIGRACIÓN 02: Gestión de Usuarios, Perfiles RLS y Ampliación de Categorías
-- Proyecto: SIGA - Fundación Marina Orth
-- =========================================================================

-- 1. Ampliación de Categorías y Tipo de Inventario en Activos y Consumibles
ALTER TABLE activos ADD COLUMN IF NOT EXISTS tipo_inventario VARCHAR(50) DEFAULT 'tecnologia';
ALTER TABLE activos ADD COLUMN IF NOT EXISTS ubicacion_estante VARCHAR(255);
ALTER TABLE activos ADD COLUMN IF NOT EXISTS custodio_documento VARCHAR(50);
ALTER TABLE activos ADD COLUMN IF NOT EXISTS usuario_id UUID;

ALTER TABLE consumibles ADD COLUMN IF NOT EXISTS tipo_inventario VARCHAR(50) DEFAULT 'robotica';
ALTER TABLE consumibles ADD COLUMN IF NOT EXISTS ubicacion_estante VARCHAR(255);

ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS solicitante_documento VARCHAR(50);
ALTER TABLE prestamos ADD COLUMN IF NOT EXISTS usuario_id UUID;

ALTER TABLE entregas_consumibles ADD COLUMN IF NOT EXISTS responsable_documento VARCHAR(50);
ALTER TABLE entregas_consumibles ADD COLUMN IF NOT EXISTS usuario_id UUID;

-- 2. Creación de la Tabla de Perfiles / Usuarios
CREATE TABLE IF NOT EXISTS perfiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento VARCHAR(20) UNIQUE NOT NULL,
    nombre_completo VARCHAR(150) NOT NULL,
    telefono VARCHAR(25),
    email VARCHAR(100) UNIQUE NOT NULL,
    rol VARCHAR(30) NOT NULL DEFAULT 'usuario' CHECK (rol IN ('administrador', 'operador', 'supervisor', 'usuario')),
    activo BOOLEAN DEFAULT true,
    sede VARCHAR(100) DEFAULT 'Medellín',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Si auth.users existe en Supabase, garantizar que id pueda ser auth.uid()
CREATE INDEX IF NOT EXISTS idx_perfiles_documento ON perfiles (documento);
CREATE INDEX IF NOT EXISTS idx_perfiles_email ON perfiles (email);
CREATE INDEX IF NOT EXISTS idx_perfiles_rol ON perfiles (rol);

-- 3. Habilitación de Row Level Security (RLS) en perfiles
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

-- Política 1: Administradores tienen control total sobre todos los perfiles
DROP POLICY IF EXISTS admin_all_perfiles ON perfiles;
CREATE POLICY admin_all_perfiles ON perfiles
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM perfiles p
            WHERE p.id = auth.uid() AND p.rol = 'administrador'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM perfiles p
            WHERE p.id = auth.uid() AND p.rol = 'administrador'
        )
    );

-- Política 2: Supervisores y Operadores pueden consultar (SELECT) perfiles
DROP POLICY IF EXISTS staff_select_perfiles ON perfiles;
CREATE POLICY staff_select_perfiles ON perfiles
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM perfiles p
            WHERE p.id = auth.uid() AND p.rol IN ('administrador', 'supervisor', 'operador')
        )
    );

-- Política 3: Rol 'usuario' solo puede ver y editar su propio perfil
DROP POLICY IF EXISTS user_own_perfil ON perfiles;
CREATE POLICY user_own_perfil ON perfiles
    FOR SELECT
    TO authenticated
    USING (
        id = auth.uid()
        OR email = auth.jwt() ->> 'email'
    );

DROP POLICY IF EXISTS user_update_own_perfil ON perfiles;
CREATE POLICY user_update_own_perfil ON perfiles
    FOR UPDATE
    TO authenticated
    USING (
        id = auth.uid()
        OR email = auth.jwt() ->> 'email'
    )
    WITH CHECK (
        id = auth.uid()
        OR email = auth.jwt() ->> 'email'
    );

-- Permisos públicos/anónimos para entorno de desarrollo backend si se usa pooler directo
-- (El pool de Node con superuser/postgres pasa por alto RLS pero RLS queda 100% activo para Supabase Client)
