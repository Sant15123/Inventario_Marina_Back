import path from 'path';
import XLSX from 'xlsx';
import { pool } from './db.js';

// Convertir número de fecha Excel o string a formato YYYY-MM-DD
function parseExcelDate(val) {
  if (!val || val === 'N/A' || val === 'NA' || val === 'NO REGISTRO') return null;

  if (typeof val === 'number') {
    // Excel base date: 1899-12-30
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) {
      const y = parsed.y;
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }

  return null;
}

// Convertir valor a número o null
function parseExcelNumber(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.-]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Limpiar cadenas
function cleanString(val, defaultVal = null) {
  if (val === undefined || val === null) return defaultVal;
  const s = String(val).trim();
  if (!s || s === 'N/A' || s === 'NA' || s === 'NO REGISTRO' || s === 'undefined') return defaultVal;
  return s;
}

export async function seedActivos() {
  const filePath = 'C:/Users/PC/Downloads/Inventario 2026 (1).xlsx';
  console.log(`Leyendo archivo Excel desde: ${filePath}...`);

  const wb = XLSX.readFile(filePath);
  const sheetName = 'Inventario General FMO';
  const ws = wb.Sheets[sheetName];

  if (!ws) {
    throw new Error(`La hoja "${sheetName}" no existe en el archivo Excel.`);
  }

  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log(`Total filas leídas del Excel: ${rawRows.length}`);

  // Asegurar que constraint de serial no bloquee valores nulos/repetidos
  await pool.query('ALTER TABLE activos DROP CONSTRAINT IF EXISTS activos_serial_key;');

  let consecutive = 1;
  let importedCount = 0;
  let updatedCount = 0;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (let i = 2; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      const rawNombre = row[1];
      if (!rawNombre || String(rawNombre).trim() === '') continue;

      let rawCodigo = cleanString(row[0]);
      if (!rawCodigo) {
        // Generar código consecutivo temporal ACT-FMO-001, etc.
        rawCodigo = `ACT-FMO-${String(consecutive).padStart(3, '0')}`;
        consecutive++;
      }

      const placa = rawCodigo;
      const nombre = String(rawNombre).trim();
      const descripcion = cleanString(row[2]);
      const categoria = cleanString(row[4], 'Equipos electrónicos');
      const marca = cleanString(row[5], 'Estándar');
      const modelo = cleanString(row[6], 'Estándar');
      const serial = cleanString(row[7], 'S/N');
      const caracteristica_1 = cleanString(row[8]);
      const caracteristica_2 = cleanString(row[9]);
      const caracteristica_3 = cleanString(row[10]);
      const area = cleanString(row[11], 'Tecnología');
      const responsable = cleanString(row[12], 'Bodega Central');
      const ubicacion = cleanString(row[13], 'Oficina Medellín');
      const sede = ubicacion.toLowerCase().includes('carmen') ? 'El Carmen' : 'Medellín';
      const valor_compra = parseExcelNumber(row[14]);
      const fecha_compra = parseExcelDate(row[15]);
      const fecha_vencimiento_garantia = parseExcelDate(row[16]);
      const cantidad = 1;
      const valor_total = parseExcelNumber(row[18]) || valor_compra;
      const proveedor = cleanString(row[19]);
      const condicion = cleanString(row[20], 'Bueno');
      const estado = condicion.toLowerCase().includes('baja') ? 'De baja' : (responsable !== 'Bodega Central' && responsable !== 'Oficina' ? 'En campo' : 'Disponible');
      const comentarios = cleanString(row[21]);
      const observaciones = comentarios || descripcion;
      const claves_otros = cleanString(row[22]);

      const upsertQuery = `
        INSERT INTO activos (
          placa, nombre, descripcion, categoria, marca, modelo, serial,
          caracteristica_1, caracteristica_2, caracteristica_3, area,
          responsable, ubicacion, sede, valor_compra, fecha_compra,
          fecha_vencimiento_garantia, cantidad, valor_total, proveedor,
          condicion, estado, observaciones, claves_otros
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20,
          $21, $22, $23, $24
        )
        ON CONFLICT (placa) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          descripcion = COALESCE(EXCLUDED.descripcion, activos.descripcion),
          categoria = EXCLUDED.categoria,
          marca = EXCLUDED.marca,
          modelo = EXCLUDED.modelo,
          serial = EXCLUDED.serial,
          caracteristica_1 = EXCLUDED.caracteristica_1,
          caracteristica_2 = EXCLUDED.caracteristica_2,
          caracteristica_3 = EXCLUDED.caracteristica_3,
          area = EXCLUDED.area,
          responsable = EXCLUDED.responsable,
          ubicacion = EXCLUDED.ubicacion,
          sede = EXCLUDED.sede,
          valor_compra = COALESCE(EXCLUDED.valor_compra, activos.valor_compra),
          fecha_compra = COALESCE(EXCLUDED.fecha_compra, activos.fecha_compra),
          fecha_vencimiento_garantia = COALESCE(EXCLUDED.fecha_vencimiento_garantia, activos.fecha_vencimiento_garantia),
          cantidad = 1,
          valor_total = COALESCE(EXCLUDED.valor_total, activos.valor_total),
          proveedor = COALESCE(EXCLUDED.proveedor, activos.proveedor),
          condicion = EXCLUDED.condicion,
          estado = EXCLUDED.estado,
          observaciones = COALESCE(EXCLUDED.observaciones, activos.observaciones),
          claves_otros = COALESCE(EXCLUDED.claves_otros, activos.claves_otros)
        RETURNING (xmax = 0) AS is_insert;
      `;

      const values = [
        placa,
        nombre,
        descripcion,
        categoria,
        marca,
        modelo,
        serial,
        caracteristica_1,
        caracteristica_2,
        caracteristica_3,
        area,
        responsable,
        ubicacion,
        sede,
        valor_compra,
        fecha_compra,
        fecha_vencimiento_garantia,
        cantidad,
        valor_total,
        proveedor,
        condicion,
        estado,
        observaciones,
        claves_otros
      ];

      const res = await client.query(upsertQuery, values);
      if (res.rows[0].is_insert) {
        importedCount++;
      } else {
        updatedCount++;
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Carga finalizada con éxito.`);
    console.log(`- Nuevos activos insertados: ${importedCount}`);
    console.log(`- Activos existentes actualizados: ${updatedCount}`);
    console.log(`- Total activos procesados: ${importedCount + updatedCount}`);

    const totalInDb = await client.query('SELECT COUNT(*) FROM activos');
    console.log(`- Total activos en base de datos Supabase: ${totalInDb.rows[0].count}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en el proceso de siembra:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Ejecutar si se invoca directamente
if (process.argv[1] && process.argv[1].endsWith('seedActivos.js')) {
  seedActivos()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error(e);
      await pool.end();
      process.exit(1);
    });
}
