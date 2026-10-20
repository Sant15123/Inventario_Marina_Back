-- =========================================================================
-- MIGRACIÓN 03: Tabla de Papelería Institucional y Políticas RLS
-- Proyecto: SIGA - Fundación Marina Orth
-- Basado en: Inventario Oficial de Papelería Bodega FMO
-- =========================================================================

-- 1. Creación de la Tabla de Papelería
CREATE TABLE IF NOT EXISTS papeleria (
    id VARCHAR(50) PRIMARY KEY, -- Formato PapeXXXX (ej. Pape1001, Pape2001)
    material VARCHAR(200) NOT NULL,
    descripcion TEXT,
    disponible INTEGER NOT NULL DEFAULT 0,
    minimo INTEGER DEFAULT 5,
    sede VARCHAR(100) DEFAULT 'Oficina FMO',
    ubicacion_estante VARCHAR(100), -- CAJA #1, CAJA #2, Fuera de cajas, etc.
    condicion VARCHAR(50) DEFAULT 'Nuevos', -- Nuevos, Usados, Mixto
    estado VARCHAR(50) DEFAULT 'Bueno',
    observaciones TEXT,
    responsable VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_papeleria_estante ON papeleria (LOWER(ubicacion_estante));
CREATE INDEX IF NOT EXISTS idx_papeleria_material ON papeleria (LOWER(material));
CREATE INDEX IF NOT EXISTS idx_papeleria_sede ON papeleria (LOWER(sede));

-- 2. Habilitación de Row Level Security (RLS) y Políticas
ALTER TABLE public.papeleria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso completo a papeleria" ON public.papeleria;
CREATE POLICY "Acceso completo a papeleria" 
ON public.papeleria 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);
