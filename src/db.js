import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignorar si no se puede cambiar DNS
}

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config();

const { Pool } = pkg;

const primaryUrl = process.env.DATABASE_URL;
const localFallbackUrl = 'postgresql://postgres:postgres@localhost:5432/inventario_marina';

const createPool = (connectionString) => {
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  return new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });
};

export let pool = createPool(primaryUrl || localFallbackUrl);

export const initDb = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('✅ Conexión con base de datos establecida.');
  } catch (err) {
    console.warn(`⚠️ Error conectando a DB remota (${err.message}), usando fallback local postgres...`);
    pool = createPool(localFallbackUrl);
    try {
      client = await pool.connect();
      console.log('✅ Conexión con PostgreSQL local establecida.');
    } catch (localErr) {
      console.error('❌ No se pudo conectar a la base de datos:', localErr.message);
      return;
    }
  }

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS activos (
        id SERIAL PRIMARY KEY,
        placa VARCHAR(100) UNIQUE NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        marca VARCHAR(100),
        modelo VARCHAR(100),
        serial VARCHAR(100) UNIQUE,
        sede VARCHAR(100) DEFAULT 'Medellín',
        estado VARCHAR(50) DEFAULT 'Disponible',
        custodio VARCHAR(255),
        fecha_devolucion DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS consumibles (
        id VARCHAR(100) PRIMARY KEY,
        material VARCHAR(255) NOT NULL,
        categoria VARCHAR(100),
        disponible INT DEFAULT 0,
        minimo INT DEFAULT 0,
        ubicacion VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
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
    `);

    // Semillas si están vacías
    const countActivos = await client.query('SELECT COUNT(*) FROM activos');
    if (parseInt(countActivos.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO activos (placa, nombre, marca, modelo, serial, sede, estado)
        VALUES 
          ('FMO-EQ-001', 'Portátil HP ProBook 450 G8', 'HP', 'ProBook 450 G8', '5CD1234ABC', 'Medellín', 'Disponible'),
          ('FMO-EQ-002', 'Portátil HP ProBook 450 G8', 'HP', 'ProBook 450 G8', '5CD1234ABD', 'Medellín', 'Disponible'),
          ('FMO-EQ-003', 'Kit Robótica LEGO SPIKE Prime', 'LEGO Education', 'SPIKE Prime', 'LEG-883921', 'El Carmen', 'Disponible'),
          ('FMO-EQ-004', 'Tablet Samsung Galaxy Tab A8', 'Samsung', 'Galaxy Tab A8', 'R52N10ABC', 'Medellín', 'Disponible')
        ON CONFLICT (placa) DO NOTHING;
      `);
    }

    const countConsumibles = await client.query('SELECT COUNT(*) FROM consumibles');
    if (parseInt(countConsumibles.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO consumibles (id, material, categoria, disponible, minimo, ubicacion)
        VALUES 
          ('MAT-001', 'Filamento PLA 1.75mm Gris', 'Impresión 3D', 4, 2, 'Almacén Medellín - Estante 2'),
          ('MAT-002', 'Filamento PLA 1.75mm Azul', 'Impresión 3D', 1, 2, 'Almacén Medellín - Estante 2'),
          ('MAT-003', 'Baterías Recargables AA (pack 4)', 'Electrónica', 8, 3, 'Bodega Medellín'),
          ('MAT-004', 'Cables USB-C a USB-A 1.5m', 'Cables y Adaptadores', 15, 5, 'Bodega Medellín')
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al inicializar tablas:', err);
  } finally {
    client.release();
  }
};
