import { pool } from '../db.js';

/**
 * Servicio centralizado de Historial y Auditoría de Movimientos
 * Sistema SIGA - Fundación Marina Orth
 */

/**
 * Inserta un registro de trazabilidad en historial_movimientos.
 * Compatible con un cliente transaccional (client) o el pool global.
 */
export const registrarMovimiento = async (clientOrPool, {
  tipo,
  elemento_nombre,
  placa_o_id = null,
  cantidad = 1,
  responsable = null,
  sede = 'Medellín',
  fecha = new Date().toISOString(),
  detalles = null,
  usuario_id = null,
  documento_responsable = null
}) => {
  const executor = clientOrPool || pool;

  const query = `
    INSERT INTO historial_movimientos (
      tipo,
      elemento_nombre,
      placa_o_id,
      cantidad,
      responsable,
      sede,
      fecha,
      detalles,
      usuario_id,
      documento_responsable
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;

  const values = [
    tipo,
    elemento_nombre || 'Elemento sin nombre',
    placa_o_id ? String(placa_o_id).trim() : null,
    Math.max(1, parseInt(cantidad, 10) || 1),
    responsable ? String(responsable).trim() : null,
    sede || 'Medellín',
    fecha || new Date().toISOString(),
    detalles || null,
    usuario_id || null,
    documento_responsable ? String(documento_responsable).trim() : null
  ];

  const result = await executor.query(query, values);
  return result.rows[0];
};

/**
 * Consulta el historial cronológico con filtros opcionales y soporte de historial personal por rol.
 */
export const obtenerHistorial = async ({
  tipo,
  search,
  placa_o_id,
  sede,
  limit = 200,
  offset = 0,
  usuario_id = null,
  documento = null,
  responsable = null,
  esPersonal = false,
  rol = null
} = {}) => {
  let query = `
    SELECT 
      id,
      tipo,
      elemento_nombre,
      placa_o_id,
      cantidad,
      responsable,
      sede,
      fecha,
      detalles,
      usuario_id,
      documento_responsable,
      created_at
    FROM historial_movimientos
    WHERE 1=1
  `;
  const params = [];

  // Filtrado personal para rol usuario o consulta individual
  if (esPersonal || rol === 'usuario') {
    const respParam = responsable ? String(responsable).trim() : '';
    const userIdParam = usuario_id ? String(usuario_id).trim() : '';
    const docParam = documento ? String(documento).trim() : '';

    params.push(respParam);
    const rIdx = params.length;
    params.push(userIdParam);
    const uIdx = params.length;
    params.push(docParam);
    const dIdx = params.length;

    query += ` AND (
      ($${rIdx} <> '' AND LOWER(COALESCE(responsable, '')) LIKE '%' || LOWER($${rIdx}) || '%')
      OR ($${uIdx} <> '' AND usuario_id::text = $${uIdx})
      OR ($${dIdx} <> '' AND (
        LOWER(COALESCE(documento_responsable, '')) = LOWER($${dIdx})
        OR LOWER(COALESCE(placa_o_id, '')) = LOWER($${dIdx})
      ))
    )`;

    // No exponer al rol usuario eventos administrativos globales como ingresos de proyectos,
    // altas de insumos de bodega o actualizaciones técnicas internas que no involucren un préstamo o entrega hacia esa persona
    query += ` AND (
      LOWER(tipo) IN ('préstamo', 'prestamo', 'devolución', 'devolucion', 'entrega')
      OR (
        LOWER(tipo) NOT IN ('ingreso', 'alta', 'baja', 'actualización', 'actualizacion')
        AND LOWER(COALESCE(detalles, '')) NOT LIKE '%proyecto%'
        AND LOWER(COALESCE(detalles, '')) NOT LIKE '%alta de%'
      )
    )`;
  }

  if (tipo && tipo !== 'todos') {
    params.push(tipo);
    query += ` AND LOWER(tipo) = LOWER($${params.length})`;
  }

  if (placa_o_id) {
    params.push(placa_o_id.trim());
    query += ` AND LOWER(placa_o_id) = LOWER($${params.length})`;
  }

  if (sede) {
    params.push(`%${sede.trim()}%`);
    query += ` AND LOWER(sede) LIKE LOWER($${params.length})`;
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    const pIdx = params.length;
    query += ` AND (
      LOWER(elemento_nombre) LIKE LOWER($${pIdx}) OR
      LOWER(COALESCE(placa_o_id, '')) LIKE LOWER($${pIdx}) OR
      LOWER(COALESCE(responsable, '')) LIKE LOWER($${pIdx}) OR
      LOWER(COALESCE(detalles, '')) LIKE LOWER($${pIdx}) OR
      LOWER(COALESCE(sede, '')) LIKE LOWER($${pIdx})
    )`;
  }

  query += ` ORDER BY fecha DESC, id DESC`;

  if (limit) {
    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;
  }

  if (offset) {
    params.push(parseInt(offset, 10));
    query += ` OFFSET $${params.length}`;
  }

  const result = await pool.query(query, params);
  return result.rows || [];
};

/**
 * Sincroniza préstamos y entregas previos si la tabla historial_movimientos está vacía,
 * asegurando trazabilidad retrospectiva inmediata de préstamos devueltos/activos y entregas.
 */
export const sincronizarHistorialInicial = async (client) => {
  const executor = client || pool;
  const countRes = await executor.query('SELECT COUNT(*) FROM historial_movimientos');
  const count = parseInt(countRes.rows[0].count, 10);

  if (count > 0) {
    return; // Ya tiene registros de auditoría
  }

  console.log('🔄 Inicializando registros históricos en historial_movimientos...');

  // 1. Préstamos históricos (activos y devueltos)
  const prestamosRes = await executor.query(`
    SELECT 
      p.*,
      COALESCE(a.nombre, c.material, p.placa_activo) AS nombre_activo
    FROM prestamos p
    LEFT JOIN activos a ON LOWER(p.placa_activo) = LOWER(a.placa)
    LEFT JOIN consumibles c ON LOWER(p.placa_activo) = LOWER(c.id)
    ORDER BY p.id ASC
  `);

  for (const p of prestamosRes.rows) {
    // Registro del Préstamo
    await registrarMovimiento(executor, {
      tipo: 'Préstamo',
      elemento_nombre: p.nombre_activo || `Activo ${p.placa_activo}`,
      placa_o_id: p.placa_activo,
      cantidad: p.cantidad || 1,
      responsable: p.solicitante,
      sede: p.sede || 'Medellín',
      fecha: p.fecha_salida ? new Date(p.fecha_salida).toISOString() : new Date().toISOString(),
      detalles: p.motivo || 'Préstamo inicial registrado',
      usuario_id: p.usuario_id || null,
      documento_responsable: p.custodio_documento || p.solicitante_documento || null
    });

    // Si ya fue devuelto (ej. P52), registrar también el evento de Devolución
    if (p.estado === 'Devuelto' && p.fecha_devolucion_real) {
      await registrarMovimiento(executor, {
        tipo: 'Devolución',
        elemento_nombre: p.nombre_activo || `Activo ${p.placa_activo}`,
        placa_o_id: p.placa_activo,
        cantidad: p.cantidad || 1,
        responsable: p.solicitante,
        sede: p.sede || 'Medellín',
        fecha: new Date(p.fecha_devolucion_real).toISOString(),
        detalles: 'Retorno a bodega confirmado. Activo disponible.',
        usuario_id: p.usuario_id || null,
        documento_responsable: p.custodio_documento || p.solicitante_documento || null
      });
    }
  }

  // 2. Entregas de consumibles previas
  const entregasRes = await executor.query(`
    SELECT * FROM entregas_consumibles ORDER BY created_at ASC
  `);

  for (const ent of entregasRes.rows) {
    await registrarMovimiento(executor, {
      tipo: 'Entrega',
      elemento_nombre: ent.material_nombre || `Consumible ${ent.material_id}`,
      placa_o_id: ent.material_id,
      cantidad: ent.cantidad || 1,
      responsable: ent.responsable,
      sede: ent.sede || 'Medellín',
      fecha: ent.created_at ? new Date(ent.created_at).toISOString() : new Date().toISOString(),
      detalles: ent.proyecto_motivo || 'Salida de material para taller',
      usuario_id: ent.usuario_id || null,
      documento_responsable: ent.responsable_documento || null
    });
  }

  console.log('✅ Sincronización histórica inicial completada.');
};
