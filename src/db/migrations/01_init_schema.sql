-- =========================================================================
-- MIGRACIÓN 01: Inicialización de Esquema y Restricciones de Integridad
-- Tarea: TK-04 (Sprint 1) - SIGA FMO
-- =========================================================================

-- 1. Tabla de Activos Tecnológicos
CREATE TABLE IF NOT EXISTS activos (
    id SERIAL PRIMARY KEY,
    placa VARCHAR(100) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    marca VARCHAR(100),
    modelo VARCHAR(100),
    serial VARCHAR(100),
    sede VARCHAR(100) DEFAULT 'Medellín',
    estado VARCHAR(50) DEFAULT 'Disponible',
    custodio VARCHAR(255),
    fecha_devolucion DATE,
    categoria VARCHAR(100),
    condicion VARCHAR(100),
    area VARCHAR(100),
    ubicacion VARCHAR(255),
    cantidad INT DEFAULT 1,
    descripcion TEXT,
    caracteristica_1 VARCHAR(255),
    caracteristica_2 VARCHAR(255),
    caracteristica_3 VARCHAR(255),
    responsable VARCHAR(255),
    proveedor VARCHAR(255),
    valor_compra NUMERIC,
    valor_total NUMERIC,
    fecha_compra DATE,
    fecha_vencimiento_garantia DATE,
    claves_otros TEXT,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Restricción UNIQUE explícita sobre placa
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'activos' AND constraint_name = 'uq_activos_placa'
    ) THEN
        ALTER TABLE activos ADD CONSTRAINT uq_activos_placa UNIQUE (placa);
    END IF;
END $$;

-- Restricción CHECK de cantidad unitaria (cada equipo individual representa 1 unidad)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'activos' AND constraint_name = 'chk_activos_cantidad_unitaria'
    ) THEN
        ALTER TABLE activos ADD CONSTRAINT chk_activos_cantidad_unitaria CHECK (cantidad = 1);
    END IF;
END $$;

-- Índice único condicional sobre serial (excluyendo vacíos, nulos y 'S/N')
CREATE UNIQUE INDEX IF NOT EXISTS idx_activos_serial_unique
ON activos (LOWER(TRIM(serial)))
WHERE serial IS NOT NULL
  AND TRIM(serial) <> ''
  AND UPPER(TRIM(serial)) <> 'S/N'
  AND UPPER(TRIM(serial)) <> 'N/A'
  AND UPPER(TRIM(serial)) <> 'NA'
  AND UPPER(TRIM(serial)) <> 'NO REGISTRO';

-- 2. Tabla de Consumibles
CREATE TABLE IF NOT EXISTS consumibles (
    id VARCHAR(100) PRIMARY KEY,
    material VARCHAR(255) NOT NULL,
    categoria VARCHAR(100),
    disponible INT DEFAULT 0,
    minimo INT DEFAULT 0,
    ubicacion VARCHAR(100),
    descripcion TEXT,
    caracteristicas TEXT,
    estado VARCHAR(50) DEFAULT 'Bueno',
    condicion VARCHAR(50) DEFAULT 'Nuevo',
    observaciones TEXT,
    valor_compra NUMERIC,
    fecha_compra DATE,
    fecha_vencimiento_garantia DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Tabla de Préstamos
CREATE TABLE IF NOT EXISTS prestamos (
    id SERIAL PRIMARY KEY,
    placa_activo VARCHAR(100) REFERENCES activos(placa) ON UPDATE CASCADE,
    solicitante VARCHAR(255) NOT NULL,
    sede VARCHAR(100) NOT NULL,
    motivo VARCHAR(255),
    fecha_salida DATE DEFAULT CURRENT_DATE,
    fecha_devolucion_esperada DATE NOT NULL,
    fecha_devolucion_real DATE,
    estado VARCHAR(50) DEFAULT 'Activo'
);
