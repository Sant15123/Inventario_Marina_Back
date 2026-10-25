import { Router } from 'express';
import { pool } from '../db.js';
import { registrarMovimiento, obtenerHistorial } from '../services/historial.service.js';
import bcrypt from 'bcrypt';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { requireAdminOnly, requireOperadorOAdmin } from '../middleware/roles.js';
import { loginLimiter } from '../middleware/rateLimiter.js';
import * as authController from '../controllers/authController.js';

const router = Router();

// ==========================================
// 0. HISTORIAL DE MOVIMIENTOS Y AUDITORÍA
// ==========================================

// Helper para extraer datos del usuario autenticado (JWT en Authorization header, req.user, headers o query)
export function parseAuthUser(req) {
  let user = req.user || null;

  if (!user && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const token = req.headers.authorization.split(' ')[1];
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        const json = Buffer.from(base64, 'base64').toString('utf8');
        user = JSON.parse(json);
      }
    } catch {
      // Ignorar error de decodificación
    }
  }

  const usuario_id = (req.query.usuario_id || req.headers['x-user-id'] || user?.id || '').trim();
  const documento = (req.query.documento || req.headers['x-user-documento'] || user?.documento || '').trim();
  const responsable = (req.query.responsable || req.query.nombre || req.headers['x-user-name'] || user?.nombre || user?.nombre_completo || '').trim();
  const rol = (req.query.rol || req.headers['x-user-role'] || user?.rol || '').toLowerCase().trim();

  return {
    id: usuario_id || null,
    documento: documento || null,
    responsable: responsable || null,
    rol: rol || null,
    rawUser: user
  };
}

// GET /api/historial - Lista historial universal de movimientos (con soporte de auditoría global o personal por rol)
router.get('/historial', async (req, res) => {
  try {
    const { tipo, search, placa_o_id, sede, limit = 200, offset = 0, personal } = req.query;
    const authUser = parseAuthUser(req);

    // Verificación de rol:
    // - Si el rol es administrador o supervisor (sin forzar personal=true y sin filtros específicos individuales), devolver listado completo (auditoría global).
    // - Si el rol es usuario o operador consultando su perfil (o se envía ?usuario_id=... / ?documento=... / ?personal=true), restringir al histórico individual.
    const esAdminOSupervisor = authUser.rol === 'administrador' || authUser.rol === 'supervisor';
    const tieneIdentificadorIndividual = !!(authUser.id || authUser.documento);
    const forzarPersonal = personal === 'true' || personal === true;
    const esPersonal = forzarPersonal || (authUser.rol === 'usuario') || (!esAdminOSupervisor && tieneIdentificadorIndividual);

    let responsableFinal = authUser.responsable;
    let documentoFinal = authUser.documento;
    let usuarioIdFinal = authUser.id;

    // Si es personal y tenemos documento o id pero falta nombre, buscar en perfiles para mayor precisión
    if (esPersonal && (documentoFinal || usuarioIdFinal) && !responsableFinal) {
      try {
        const queryUser = documentoFinal
          ? 'SELECT nombre_completo, documento, id FROM perfiles WHERE LOWER(documento) = LOWER($1)'
          : 'SELECT nombre_completo, documento, id FROM perfiles WHERE id = $1';
        const uRes = await pool.query(queryUser, [documentoFinal || usuarioIdFinal]);
        if (uRes.rows.length > 0) {
          responsableFinal = uRes.rows[0].nombre_completo;
          documentoFinal = uRes.rows[0].documento;
          usuarioIdFinal = uRes.rows[0].id;
        }
      } catch {
        // Continuar con los datos disponibles
      }
    }

    const movimientos = await obtenerHistorial({
      tipo,
      search,
      placa_o_id,
      sede,
      limit,
      offset,
      usuario_id: usuarioIdFinal,
      documento: documentoFinal,
      responsable: responsableFinal,
      esPersonal,
      rol: authUser.rol
    });

    res.json({
      success: true,
      count: movimientos.length,
      data: movimientos,
      modo: esPersonal ? 'personal' : 'global'
    });
  } catch (error) {
    console.error('Error al consultar historial de movimientos:', error.message);
    res.status(500).json({
      success: false,
      data: [],
      error: 'Error interno al consultar historial: ' + error.message
    });
  }
});

// GET /api/historial/personal - Endpoint dedicado exclusivamente al historial personal del usuario
router.get('/historial/personal', async (req, res) => {
  try {
    const { tipo, search, placa_o_id, sede, limit = 200, offset = 0 } = req.query;
    const authUser = parseAuthUser(req);

    if (!authUser.id && !authUser.documento && !authUser.responsable) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere identificación de usuario (token JWT, usuario_id o documento) para consultar el historial personal.'
      });
    }

    let responsableFinal = authUser.responsable;
    let documentoFinal = authUser.documento;
    let usuarioIdFinal = authUser.id;

    if ((documentoFinal || usuarioIdFinal) && !responsableFinal) {
      try {
        const queryUser = documentoFinal
          ? 'SELECT nombre_completo, documento, id FROM perfiles WHERE LOWER(documento) = LOWER($1)'
          : 'SELECT nombre_completo, documento, id FROM perfiles WHERE id = $1';
        const uRes = await pool.query(queryUser, [documentoFinal || usuarioIdFinal]);
        if (uRes.rows.length > 0) {
          responsableFinal = uRes.rows[0].nombre_completo;
          documentoFinal = uRes.rows[0].documento;
          usuarioIdFinal = uRes.rows[0].id;
        }
      } catch {
        // Continuar
      }
    }

    const movimientos = await obtenerHistorial({
      tipo,
      search,
      placa_o_id,
      sede,
      limit,
      offset,
      usuario_id: usuarioIdFinal,
      documento: documentoFinal,
      responsable: responsableFinal,
      esPersonal: true,
      rol: authUser.rol || 'usuario'
    });

    res.json({
      success: true,
      count: movimientos.length,
      data: movimientos,
      modo: 'personal'
    });
  } catch (error) {
    console.error('Error al consultar historial personal:', error.message);
    res.status(500).json({
      success: false,
      data: [],
      error: 'Error interno al consultar historial personal: ' + error.message
    });
  }
});

// ==========================================
// 0.1 PROYECTOS STEAM
// ==========================================

// GET /api/proyectos - Listar proyectos STEAM (activos por defecto o filtrados)
router.get('/proyectos', async (req, res) => {
  try {
    const { activo, sede_municipio, sede, search } = req.query;
    let query = 'SELECT * FROM proyectos_steam WHERE 1=1';
    const params = [];

    // Por defecto lista activos, a menos que se especifique 'todos' o 'false'
    if (activo !== undefined && activo !== 'todos') {
      const isActivo = activo === 'true' || activo === true;
      params.push(isActivo);
      query += ` AND activo = $${params.length}`;
    } else if (activo === undefined) {
      params.push(true);
      query += ` AND activo = $${params.length}`;
    }

    const sedeParam = sede_municipio || sede;
    if (sedeParam) {
      params.push(`%${sedeParam.trim().toLowerCase()}%`);
      query += ` AND LOWER(sede_municipio) LIKE $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const pIdx = params.length;
      query += ` AND (LOWER(nombre) LIKE $${pIdx} OR LOWER(COALESCE(descripcion, '')) LIKE $${pIdx} OR LOWER(COALESCE(sede_municipio, '')) LIKE $${pIdx})`;
    }

    query += ' ORDER BY nombre ASC';

    const result = await pool.query(query, params);
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows || []
    });
  } catch (error) {
    console.error('Error al listar proyectos STEAM:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// POST /api/proyectos - Crear nuevo proyecto STEAM
router.post('/proyectos', async (req, res) => {
  try {
    const { nombre, sede_municipio, descripcion, activo = true } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del proyecto STEAM es obligatorio.'
      });
    }

    const query = `
      INSERT INTO proyectos_steam (nombre, sede_municipio, descripcion, activo)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      nombre.trim(),
      sede_municipio ? sede_municipio.trim() : null,
      descripcion ? descripcion.trim() : null,
      activo !== undefined ? (activo === true || activo === 'true') : true
    ]);

    const nuevoProyecto = result.rows[0];

    try {
      await registrarMovimiento(pool, {
        tipo: 'Ingreso',
        elemento_nombre: `Proyecto: ${nuevoProyecto.nombre}`,
        placa_o_id: nuevoProyecto.id,
        cantidad: 1,
        responsable: 'Coordinación STEAM',
        sede: nuevoProyecto.sede_municipio || 'Medellín',
        detalles: `Creación de proyecto STEAM: ${nuevoProyecto.nombre}`
      });
    } catch (errHist) {
      console.warn('Aviso no crítico al registrar auditoría de proyecto:', errHist.message);
    }

    res.status(201).json({
      success: true,
      message: 'Proyecto STEAM creado exitosamente.',
      data: nuevoProyecto
    });
  } catch (error) {
    console.error('Error al crear proyecto STEAM:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/proyectos/:id - Editar proyecto STEAM o cambiar estado (activo/inactivo)
router.put('/proyectos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, sede_municipio, descripcion, activo } = req.body;

    const query = `
      UPDATE proyectos_steam
      SET
        nombre = COALESCE($1, nombre),
        sede_municipio = COALESCE($2, sede_municipio),
        descripcion = COALESCE($3, descripcion),
        activo = COALESCE($4, activo)
      WHERE id = $5
      RETURNING *;
    `;

    const values = [
      nombre !== undefined ? nombre.trim() : null,
      sede_municipio !== undefined ? sede_municipio.trim() : null,
      descripcion !== undefined ? descripcion.trim() : null,
      activo !== undefined ? (activo === true || activo === 'true') : null,
      id
    ];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Proyecto STEAM con ID "${id}" no encontrado.`
      });
    }

    const proyectoActualizado = result.rows[0];

    try {
      await registrarMovimiento(pool, {
        tipo: 'Actualización',
        elemento_nombre: `Proyecto: ${proyectoActualizado.nombre}`,
        placa_o_id: proyectoActualizado.id,
        cantidad: 1,
        responsable: 'Coordinación STEAM',
        sede: proyectoActualizado.sede_municipio || 'Medellín',
        detalles: `Actualización de proyecto STEAM (Estado activo: ${proyectoActualizado.activo})`
      });
    } catch (errHist) {
      console.warn('Aviso no crítico al registrar auditoría de proyecto:', errHist.message);
    }

    res.json({
      success: true,
      message: 'Proyecto STEAM actualizado exitosamente.',
      data: proyectoActualizado
    });
  } catch (error) {
    console.error('Error al actualizar proyecto STEAM:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 1. ACTIVOS
// ==========================================

// GET /api/activos - Lista todos los activos
router.get('/activos', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM activos ORDER BY placa ASC');
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('Error al obtener activos de DB:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// GET /api/activos/:placa - Detalle de un activo por placa
router.get('/activos/:placa', async (req, res, next) => {
  try {
    const { placa } = req.params;
    const result = await pool.query(
      'SELECT * FROM activos WHERE LOWER(placa) = LOWER($1)',
      [placa.trim()]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Activo con placa ${placa} no encontrado` });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener activo por placa:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/activos - Crear un nuevo activo (Catálogo maestro: requiere Administrador)
router.post('/activos', requireAdminOnly, async (req, res, next) => {
  try {
    const {
      placa,
      nombre,
      marca,
      modelo,
      serial,
      sede = 'Medellín',
      estado = 'Disponible',
      custodio = null,
      fecha_devolucion = null,
      ubicacion_estante = null,
      tipo_inventario = 'tecnologia',
      categoria = 'Portátiles',
      condicion = 'Nuevo',
      area = 'Tecnología',
      ubicacion = 'Oficina Medellín',
      cantidad = 1,
      descripcion = null,
      caracteristica_1 = null,
      caracteristica_2 = null,
      caracteristica_3 = null,
      responsable = null,
      proveedor = null,
      valor_compra = null,
      valor_total = null,
      fecha_compra = null,
      fecha_vencimiento_garantia = null,
      claves_otros = null,
      observaciones = null,
      custodio_documento = null,
      usuario_id = null
    } = req.body;

    if (!placa || !nombre) {
      return res.status(400).json({ success: false, message: 'La placa y el nombre son obligatorios.' });
    }

    // Normalizar tipo_inventario según categoría si no se especifica explícitamente
    let finalTipoInventario = (tipo_inventario || 'tecnologia').toLowerCase();
    const catLower = (categoria || '').toLowerCase();
    if (catLower.includes('papeler') || catLower.includes('oficina')) {
      finalTipoInventario = 'papeleria';
    } else if (catLower.includes('mobil') || catLower.includes('mueble') || catLower.includes('silla') || catLower.includes('mesa') || catLower.includes('estante')) {
      finalTipoInventario = 'mobiliario';
    } else if (catLower.includes('robotic') || catLower.includes('sensor')) {
      finalTipoInventario = 'robotica';
    }

    const result = await pool.query(
      `INSERT INTO activos (
        placa, nombre, marca, modelo, serial, sede, estado, custodio, fecha_devolucion,
        ubicacion_estante, tipo_inventario, categoria, condicion, area, ubicacion, cantidad,
        descripcion, caracteristica_1, caracteristica_2, caracteristica_3, responsable,
        proveedor, valor_compra, valor_total, fecha_compra, fecha_vencimiento_garantia,
        claves_otros, observaciones, custodio_documento, usuario_id
       )
       VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26,
        $27, $28, $29, $30
       )
       RETURNING *`,
      [
        placa.trim(),
        nombre.trim(),
        marca || null,
        modelo || null,
        serial ? serial.trim() : null,
        sede,
        estado,
        custodio || responsable || null,
        fecha_devolucion,
        ubicacion_estante || null,
        finalTipoInventario,
        categoria || 'Portátiles',
        condicion || 'Nuevo',
        area || 'Tecnología',
        ubicacion || 'Oficina Medellín',
        parseInt(cantidad, 10) || 1,
        descripcion || null,
        caracteristica_1 || null,
        caracteristica_2 || null,
        caracteristica_3 || null,
        responsable || custodio || null,
        proveedor || null,
        valor_compra || null,
        valor_total || null,
        fecha_compra || null,
        fecha_vencimiento_garantia || null,
        claves_otros || null,
        observaciones || null,
        custodio_documento || null,
        usuario_id || null
      ]
    );

    const nuevoActivo = result.rows[0];

    try {
      await registrarMovimiento(pool, {
        tipo: 'Ingreso',
        elemento_nombre: nuevoActivo.nombre,
        placa_o_id: nuevoActivo.placa,
        cantidad: nuevoActivo.cantidad || 1,
        responsable: nuevoActivo.responsable || nuevoActivo.custodio || 'Bodega Central',
        sede: nuevoActivo.sede || 'Medellín',
        detalles: nuevoActivo.observaciones || 'Alta de nuevo activo tecnológico en inventario'
      });
    } catch (errHist) {
      console.warn('Aviso: no se pudo registrar auditoría de ingreso:', errHist.message);
    }

    res.status(201).json({ success: true, message: 'Activo creado exitosamente', data: nuevoActivo });
  } catch (error) {
    console.error('Error al crear activo:', error.message);
    if (error.code === '23505') {
      const constraint = (error.constraint || '').toLowerCase();
      const detail = (error.detail || '').toLowerCase();
      if (constraint.includes('placa') || detail.includes('placa')) {
        return res.status(409).json({ success: false, message: 'Ya existe un activo registrado con esta placa/código.' });
      }
      if (constraint.includes('serial') || detail.includes('serial')) {
        return res.status(409).json({ success: false, message: 'Ya existe un equipo registrado con este número de serial.' });
      }
      return res.status(409).json({ success: false, message: 'Ya existe un registro con estos datos únicos (placa o serial).' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT/PATCH /api/activos/:id - Actualizar datos completos del activo / equipo
const handleUpdateActivo = async (req, res, next) => {
  try {
    const paramId = (req.params.id || req.params.placa || '').trim();

    // 1. Desestructuración completa del cuerpo de la petición (req.body)
    const {
      nombre,
      equipo,
      categoria,
      condicion,
      area,
      ubicacion,
      sede,
      cantidad,
      descripcion,
      marca,
      modelo,
      serial,
      caracteristica_1,
      caracteristica_2,
      caracteristica_3,
      responsable,
      custodio,
      estado,
      fecha_devolucion,
      proveedor,
      valor_compra,
      valor_total,
      fecha_compra,
      fecha_vencimiento_garantia,
      claves_otros,
      observaciones,
      ubicacion_estante,
      tipo_inventario,
      custodio_documento,
      usuario_id
    } = req.body;

    const nombreFinal = nombre !== undefined ? nombre : (equipo !== undefined ? equipo : null);
    const ubicacionFinal = ubicacion !== undefined ? ubicacion : (sede !== undefined ? sede : null);
    const responsableFinal = responsable !== undefined ? responsable : (custodio !== undefined ? custodio : null);

    const isNumericId = /^\d+$/.test(paramId);

    // 2. Consulta SQL con COALESCE y RETURNING *
    const updateQuery = `
      UPDATE activos SET
        nombre = COALESCE($1, nombre),
        categoria = COALESCE($2, categoria),
        condicion = COALESCE($3, condicion),
        area = COALESCE($4, area),
        ubicacion = COALESCE($5, ubicacion),
        cantidad = COALESCE($6, cantidad),
        descripcion = COALESCE($7, descripcion),
        marca = COALESCE($8, marca),
        modelo = COALESCE($9, modelo),
        serial = COALESCE($10, serial),
        caracteristica_1 = COALESCE($11, caracteristica_1),
        caracteristica_2 = COALESCE($12, caracteristica_2),
        caracteristica_3 = COALESCE($13, caracteristica_3),
        responsable = COALESCE($14, responsable),
        proveedor = COALESCE($15, proveedor),
        valor_compra = COALESCE($16, valor_compra),
        valor_total = COALESCE($17, valor_total),
        fecha_compra = COALESCE($18, fecha_compra),
        fecha_vencimiento_garantia = COALESCE($19, fecha_vencimiento_garantia),
        claves_otros = COALESCE($20, claves_otros),
        observaciones = COALESCE($21, observaciones),
        estado = COALESCE($22, estado),
        custodio = COALESCE($23, custodio),
        fecha_devolucion = COALESCE($24, fecha_devolucion),
        sede = COALESCE($25, sede),
        ubicacion_estante = COALESCE($26, ubicacion_estante),
        tipo_inventario = COALESCE($27, tipo_inventario),
        custodio_documento = COALESCE($28, custodio_documento),
        usuario_id = COALESCE($29, usuario_id)
      WHERE ${isNumericId ? '(id = $30 OR LOWER(placa) = LOWER($31))' : 'LOWER(placa) = LOWER($30)'}
      RETURNING *;
    `;

    const values = [
      nombreFinal,
      categoria !== undefined ? categoria : null,
      condicion !== undefined ? condicion : null,
      area !== undefined ? area : null,
      ubicacionFinal,
      cantidad !== undefined && cantidad !== '' ? parseInt(cantidad, 10) : null,
      descripcion !== undefined ? descripcion : null,
      marca !== undefined ? marca : null,
      modelo !== undefined ? modelo : null,
      serial !== undefined ? (serial ? serial.trim() : null) : null,
      caracteristica_1 !== undefined ? caracteristica_1 : null,
      caracteristica_2 !== undefined ? caracteristica_2 : null,
      caracteristica_3 !== undefined ? caracteristica_3 : null,
      responsableFinal,
      proveedor !== undefined ? proveedor : null,
      valor_compra !== undefined && valor_compra !== '' ? valor_compra : null,
      valor_total !== undefined && valor_total !== '' ? valor_total : null,
      fecha_compra !== undefined && fecha_compra !== '' ? fecha_compra : null,
      fecha_vencimiento_garantia !== undefined && fecha_vencimiento_garantia !== '' ? fecha_vencimiento_garantia : null,
      claves_otros !== undefined ? claves_otros : null,
      observaciones !== undefined ? observaciones : null,
      estado !== undefined ? estado : null,
      custodio !== undefined ? custodio : null,
      fecha_devolucion !== undefined && fecha_devolucion !== '' ? fecha_devolucion : null,
      sede !== undefined ? sede : null,
      ubicacion_estante !== undefined ? ubicacion_estante : null,
      tipo_inventario !== undefined ? tipo_inventario : null,
      custodio_documento !== undefined ? custodio_documento : null,
      usuario_id !== undefined ? usuario_id : null,
      isNumericId ? parseInt(paramId, 10) : paramId.toLowerCase(),
      ...(isNumericId ? [paramId.toLowerCase()] : [])
    ];

    const result = await pool.query(updateQuery, values);

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Activo con identificador "${paramId}" no encontrado.` });
    }

    const activoActualizado = result.rows[0];

    try {
      const esBaja = (activoActualizado.estado || '').toLowerCase().includes('baja');
      await registrarMovimiento(pool, {
        tipo: esBaja ? 'Baja' : 'Actualización',
        elemento_nombre: activoActualizado.nombre,
        placa_o_id: activoActualizado.placa,
        cantidad: activoActualizado.cantidad || 1,
        responsable: activoActualizado.responsable || activoActualizado.custodio || 'Administrador',
        sede: activoActualizado.sede || 'Medellín',
        detalles: req.body?.motivo || req.body?.observaciones || (esBaja ? 'Activo dado de baja' : 'Actualización técnica de ficha/ubicación')
      });
    } catch (errHist) {
      console.warn('Aviso: no se pudo registrar auditoría de activo:', errHist.message);
    }

    // 3. Respuesta JSON del endpoint
    res.json({
      success: true,
      data: activoActualizado,
      message: 'Equipo actualizado con éxito'
    });
  } catch (error) {
    console.error('Error al actualizar activo:', error.message);
    if (error.code === '23505') {
      const constraint = (error.constraint || '').toLowerCase();
      const detail = (error.detail || '').toLowerCase();
      if (constraint.includes('placa') || detail.includes('placa')) {
        return res.status(409).json({ success: false, message: 'Ya existe un activo registrado con esta placa/código.' });
      }
      if (constraint.includes('serial') || detail.includes('serial')) {
        return res.status(409).json({ success: false, message: 'Ya existe un equipo registrado con este número de serial.' });
      }
      return res.status(409).json({ success: false, message: 'Ya existe un registro con estos datos únicos (placa o serial).' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

router.put('/activos/:id', requireAdminOnly, handleUpdateActivo);
router.patch('/activos/:id', requireAdminOnly, handleUpdateActivo);
router.put('/activos/:placa', requireAdminOnly, handleUpdateActivo);
router.patch('/activos/:placa', requireAdminOnly, handleUpdateActivo);

// DELETE /api/activos/:id & /api/activos/:placa - Dar de baja activo con trazabilidad obligatoria
const handleDeleteActivo = async (req, res) => {
  const paramId = (req.params.id || req.params.placa || '').trim();
  const isNumericId = /^\d+$/.test(paramId);

  try {
    const findQuery = isNumericId
      ? 'SELECT * FROM activos WHERE id = $1 OR LOWER(placa) = LOWER($2)'
      : 'SELECT * FROM activos WHERE LOWER(placa) = LOWER($1)';
    const findValues = isNumericId ? [parseInt(paramId, 10), paramId] : [paramId];
    const findRes = await pool.query(findQuery, findValues);

    if (findRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Activo con identificador "${paramId}" no encontrado.` });
    }

    const activo = findRes.rows[0];

    // Marcar en estado 'Baja' para preservar datos en inventario histórico
    const updateRes = await pool.query(
      `UPDATE activos SET estado = 'Baja', custodio = NULL, fecha_devolucion = NULL WHERE id = $1 RETURNING *`,
      [activo.id]
    );

    const motivoBaja = req.body?.motivo || req.query?.motivo || 'Baja de activo confirmada institucionalmente';

    // Registrar obligatoriamente en historial_movimientos
    await registrarMovimiento(pool, {
      tipo: 'Baja',
      elemento_nombre: activo.nombre,
      placa_o_id: activo.placa,
      cantidad: activo.cantidad || 1,
      responsable: req.body?.responsable || activo.custodio || 'Administrador',
      sede: activo.sede || 'Medellín',
      detalles: motivoBaja
    });

    res.json({
      success: true,
      message: `Activo ${activo.placa} dado de baja exitosamente`,
      data: updateRes.rows[0]
    });
  } catch (error) {
    console.error('Error al dar de baja activo:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

router.delete('/activos/:id', requireAdminOnly, handleDeleteActivo);
router.delete('/activos/:placa', requireAdminOnly, handleDeleteActivo);

// ==========================================
// 2. CONSUMIBLES
// ==========================================

// GET /api/consumibles - Lista de consumibles / materiales
router.get('/consumibles', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM consumibles ORDER BY material ASC');
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('Error al obtener consumibles de DB:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// POST /api/consumibles - Registrar nuevo consumible / material (Catálogo maestro: requiere Administrador)
router.post('/consumibles', requireAdminOnly, async (req, res, next) => {
  try {
    const {
      id,
      material,
      categoria,
      disponible,
      minimo,
      ubicacion,
      descripcion,
      caracteristicas,
      estado,
      condicion,
      observaciones,
      valor_compra,
      fecha_compra,
      fecha_vencimiento_garantia,
      ubicacion_estante,
      tipo_inventario
    } = req.body;

    // Validación básica de requeridos
    if (!id || !material) {
      return res.status(400).json({
        success: false,
        message: 'El código (id) y el nombre del material son obligatorios'
      });
    }

    // Normalizar tipo_inventario según categoría si no se especifica
    let finalTipoInventario = (tipo_inventario || 'robotica').toLowerCase();
    const catLower = (categoria || '').toLowerCase();
    if (catLower.includes('papeler') || catLower.includes('oficina')) {
      finalTipoInventario = 'papeleria';
    } else if (catLower.includes('mobil') || catLower.includes('mueble') || catLower.includes('silla') || catLower.includes('mesa') || catLower.includes('estante')) {
      finalTipoInventario = 'mobiliario';
    } else if (catLower.includes('tecnolog') || catLower.includes('laptop') || catLower.includes('pc') || catLower.includes('tablet')) {
      finalTipoInventario = 'tecnologia';
    }

    const query = `
      INSERT INTO consumibles (
        id, material, categoria, disponible, minimo, ubicacion,
        descripcion, caracteristicas, estado, condicion, observaciones,
        valor_compra, fecha_compra, fecha_vencimiento_garantia, ubicacion_estante, tipo_inventario
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *;
    `;

    const values = [
      id,
      material,
      categoria || 'Robótica',
      parseInt(disponible) || 0,
      parseInt(minimo) || 5,
      ubicacion || 'Oficina FMO',
      descripcion || null,
      caracteristicas || null,
      estado || 'Bueno',
      condicion || 'Nuevo',
      observaciones || null,
      valor_compra || null,
      fecha_compra || null,
      fecha_vencimiento_garantia || null,
      ubicacion_estante || null,
      finalTipoInventario
    ];

    const result = await pool.query(query, values);
    const nuevoConsumible = result.rows[0];

    try {
      await registrarMovimiento(pool, {
        tipo: 'Ingreso',
        elemento_nombre: nuevoConsumible.material,
        placa_o_id: nuevoConsumible.id,
        cantidad: nuevoConsumible.disponible || 0,
        responsable: 'Bodega Central',
        sede: nuevoConsumible.ubicacion || 'Medellín',
        detalles: nuevoConsumible.observaciones || 'Ingreso inicial de consumible en bodega'
      });
    } catch (errHist) {
      console.warn('Aviso: no se pudo registrar auditoría de ingreso consumible:', errHist.message);
    }

    res.status(201).json({
      success: true,
      data: nuevoConsumible,
      message: 'Consumible registrado con éxito'
    });
  } catch (error) {
    console.error('Error al registrar consumible:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/consumibles/:id - Actualizar datos del consumible (Catálogo maestro: requiere Administrador)
router.put('/consumibles/:id', requireAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nuevo_id,
      id: bodyId,
      placa,
      codigo,
      material,
      categoria,
      disponible,
      minimo,
      ubicacion,
      descripcion,
      caracteristicas,
      estado,
      condicion,
      observaciones,
      valor_compra,
      fecha_compra,
      fecha_vencimiento_garantia,
      ubicacion_estante,
      tipo_inventario
    } = req.body;

    const targetId = (nuevo_id || bodyId || placa || codigo || '').trim();
    const finalId = targetId || id;

    // Si cambió la placa / código / id, verificar que no colisione con otro consumible existente
    if (targetId && targetId.toLowerCase() !== id.toLowerCase()) {
      const checkDup = await pool.query('SELECT id FROM consumibles WHERE LOWER(id) = LOWER($1)', [targetId]);
      if (checkDup.rows.length > 0) {
        return res.status(400).json({ success: false, message: `La placa o código "${targetId}" ya existe en consumibles.` });
      }
    }

    const query = `
      UPDATE consumibles
      SET 
        id = COALESCE($1, id),
        material = COALESCE($2, material),
        categoria = COALESCE($3, categoria),
        disponible = COALESCE($4, disponible),
        minimo = COALESCE($5, minimo),
        ubicacion = COALESCE($6, ubicacion),
        descripcion = $7,
        caracteristicas = $8,
        estado = COALESCE($9, estado),
        condicion = COALESCE($10, condicion),
        observaciones = $11,
        valor_compra = $12,
        fecha_compra = $13,
        fecha_vencimiento_garantia = $14,
        ubicacion_estante = COALESCE($15, ubicacion_estante),
        tipo_inventario = COALESCE($16, tipo_inventario)
      WHERE LOWER(id) = LOWER($17)
      RETURNING *;
    `;

    const values = [
      finalId,
      material,
      categoria,
      disponible !== undefined ? parseInt(disponible) : undefined,
      minimo !== undefined ? parseInt(minimo) : undefined,
      ubicacion,
      descripcion || null,
      caracteristicas || null,
      estado || 'Bueno',
      condicion || 'Nuevo',
      observaciones || null,
      valor_compra || null,
      fecha_compra || null,
      fecha_vencimiento_garantia || null,
      ubicacion_estante !== undefined ? ubicacion_estante : null,
      tipo_inventario !== undefined ? tipo_inventario : null,
      id
    ];

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Consumible no encontrado' });
    }

    // Si se modificó la placa / id, sincronizar tablas auxiliares (entregas y préstamos)
    if (targetId && targetId.toLowerCase() !== id.toLowerCase()) {
      try {
        await pool.query('UPDATE entregas_consumibles SET material_id = $1 WHERE LOWER(material_id) = LOWER($2)', [targetId, id]);
        await pool.query('UPDATE prestamos SET placa_activo = $1 WHERE LOWER(placa_activo) = LOWER($2)', [targetId, id]);
      } catch (errSync) {
        console.warn('Advertencia no crítica al sincronizar tablas auxiliares:', errSync.message);
      }
    }

    const consumibleActualizado = result.rows[0];

    try {
      const esBaja = (consumibleActualizado.estado || '').toLowerCase().includes('baja');
      await registrarMovimiento(pool, {
        tipo: esBaja ? 'Baja' : 'Actualización',
        elemento_nombre: consumibleActualizado.material,
        placa_o_id: consumibleActualizado.id,
        cantidad: consumibleActualizado.disponible || 1,
        responsable: 'Bodega Central',
        sede: consumibleActualizado.ubicacion || 'Medellín',
        detalles: req.body?.motivo || req.body?.observaciones || (esBaja ? 'Consumible dado de baja' : 'Actualización de especificaciones de consumible')
      });
    } catch (errHist) {
      console.warn('Aviso: no se pudo registrar auditoría de actualización consumible:', errHist.message);
    }

    res.json({
      success: true,
      data: consumibleActualizado,
      message: 'Consumible actualizado con éxito'
    });
  } catch (error) {
    console.error('Error al actualizar consumible:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/consumibles/:id - Dar de baja consumible con registro de auditoría (Catálogo maestro: requiere Administrador)
router.delete('/consumibles/:id', requireAdminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const findRes = await pool.query('SELECT * FROM consumibles WHERE LOWER(id) = LOWER($1)', [id.trim()]);
    if (findRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Consumible con ID "${id}" no encontrado.` });
    }

    const cons = findRes.rows[0];
    const updateRes = await pool.query(
      `UPDATE consumibles SET estado = 'Baja', disponible = 0 WHERE LOWER(id) = LOWER($1) RETURNING *`,
      [id.trim()]
    );

    const motivoBaja = req.body?.motivo || req.query?.motivo || 'Baja de consumible confirmada';

    await registrarMovimiento(pool, {
      tipo: 'Baja',
      elemento_nombre: cons.material,
      placa_o_id: cons.id,
      cantidad: cons.disponible || 1,
      responsable: req.body?.responsable || 'Bodega Central',
      sede: cons.ubicacion || 'Medellín',
      detalles: motivoBaja
    });

    res.json({
      success: true,
      message: `Consumible ${cons.id} dado de baja exitosamente`,
      data: updateRes.rows[0]
    });
  } catch (error) {
    console.error('Error al dar de baja consumible:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2.1 ENTREGAS / SALIDAS DE CONSUMIBLES Y REMISIONES
// ==========================================

// Función auxiliar para validar y resolver custodio/usuario con integridad relacional
const resolverUsuarioCustodio = async (clientOrPool, { usuario_id, custodio_documento, solicitante_documento, documento, solicitante, responsable }) => {
  const targetId = (usuario_id || '').trim();
  const targetDoc = (custodio_documento || solicitante_documento || documento || '').trim();
  const targetNombre = (solicitante || responsable || '').trim();

  // 1. Si se proporciona usuario_id (UUID)
  if (targetId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
    if (!isUuid) {
      const err = new Error(`El usuario_id "${targetId}" no tiene un formato UUID válido.`);
      err.statusCode = 400;
      throw err;
    }
    const resUser = await clientOrPool.query(
      'SELECT id, documento, nombre_completo, email, rol, sede, activo FROM perfiles WHERE id = $1',
      [targetId]
    );
    if (resUser.rows.length === 0) {
      const err = new Error(`El usuario/custodio con ID "${targetId}" no existe en el sistema de usuarios.`);
      err.statusCode = 400;
      throw err;
    }
    const user = resUser.rows[0];
    if (user.activo === false) {
      const err = new Error(`El usuario/custodio "${user.nombre_completo}" se encuentra inactivo en el sistema.`);
      err.statusCode = 400;
      throw err;
    }
    return user;
  }

  // 2. Si se proporciona documento
  if (targetDoc) {
    const resUser = await clientOrPool.query(
      'SELECT id, documento, nombre_completo, email, rol, sede, activo FROM perfiles WHERE LOWER(documento) = LOWER($1)',
      [targetDoc]
    );
    if (resUser.rows.length > 0) {
      const user = resUser.rows[0];
      if (user.activo === false) {
        const err = new Error(`El usuario/custodio con documento "${targetDoc}" se encuentra inactivo.`);
        err.statusCode = 400;
        throw err;
      }
      return user;
    }
    const err = new Error(`No se encontró ningún usuario/custodio registrado con el documento "${targetDoc}".`);
    err.statusCode = 400;
    throw err;
  }

  // 3. Si se proporciona nombre, intentar asociar por nombre exacto
  if (targetNombre) {
    const resUser = await clientOrPool.query(
      'SELECT id, documento, nombre_completo, email, rol, sede, activo FROM perfiles WHERE LOWER(nombre_completo) = LOWER($1)',
      [targetNombre]
    );
    if (resUser.rows.length > 0) {
      return resUser.rows[0];
    }
  }

  return null;
};

// GET /api/consumibles/remisiones - Listar actas/remisiones de entregas con datos del usuario custodio
router.get('/consumibles/remisiones', async (req, res) => {
  try {
    const query = `
      SELECT 
        r.*,
        u.documento as usuario_documento,
        u.nombre_completo as usuario_nombre,
        u.email as usuario_email,
        u.rol as usuario_rol
      FROM remisiones_consumibles r
      LEFT JOIN perfiles u ON r.usuario_id = u.id OR (r.usuario_id IS NULL AND LOWER(r.custodio_documento) = LOWER(u.documento))
      ORDER BY r.created_at DESC
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('Error al listar remisiones de consumibles:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// POST /api/consumibles/remisiones - Registrar remisión agrupada con validación estricta de custodio (Operativo: Operador o Admin)
router.post('/consumibles/remisiones', requireOperadorOAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      remision_id,
      codigo_acta,
      responsable_recibe,
      responsable,
      person,
      custodio_documento,
      documento,
      usuario_id,
      sede = 'Medellín',
      proyecto = '',
      motivo = '',
      items = [],
      total_items,
      total_unidades,
      fecha_entrega
    } = req.body;

    const finalResponsable = (responsable_recibe || responsable || person || '').trim();

    if (!finalResponsable && !usuario_id && !custodio_documento && !documento) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere especificar el custodio/responsable (nombre, documento o usuario_id).'
      });
    }

    await client.query('BEGIN');

    // Validar usuario custodio en tabla perfiles
    const usuarioValido = await resolverUsuarioCustodio(client, {
      usuario_id,
      custodio_documento: custodio_documento || documento,
      responsable: finalResponsable
    });

    const finalUsuarioId = usuarioValido ? usuarioValido.id : null;
    const finalCustodioDoc = usuarioValido ? usuarioValido.documento : (custodio_documento || documento || null);
    const finalNombreCustodio = usuarioValido ? usuarioValido.nombre_completo : finalResponsable;
    const finalSede = sede || (usuarioValido ? usuarioValido.sede : 'Medellín');

    const finalRemisionId = (remision_id || codigo_acta || `REM-${Date.now()}`).trim();
    const finalCodigoActa = (codigo_acta || finalRemisionId).trim();
    const rawItems = Array.isArray(items) ? items : [];

    // Validar y descontar stock para cada ítem en la remisión
    for (const item of rawItems) {
      const matId = (item.material_id || item.id || '').trim();
      const cant = Math.max(1, parseInt(item.cantidad, 10) || 1);

      if (matId) {
        const consRes = await client.query(
          'SELECT * FROM consumibles WHERE LOWER(id) = LOWER($1) FOR UPDATE',
          [matId]
        );
        if (consRes.rows.length > 0) {
          const cons = consRes.rows[0];
          if (parseInt(cons.disponible, 10) < cant) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: `Stock insuficiente para ${cons.material}. Solicitado: ${cant}, disponible: ${cons.disponible}`
            });
          }
          await client.query(
            'UPDATE consumibles SET disponible = disponible - $1 WHERE id = $2',
            [cant, cons.id]
          );

          // Registrar en entregas_consumibles
          await client.query(`
            INSERT INTO entregas_consumibles (
              material_id, material_nombre, cantidad, responsable, sede,
              proyecto_motivo, tipo, remision_id, custodio_documento, responsable_documento, usuario_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'Consumido', $7, $8, $8, $9, NOW())
          `, [
            cons.id,
            item.nombre || cons.material,
            cant,
            finalNombreCustodio,
            finalSede,
            motivo || proyecto || 'Salida por remisión agrupada',
            finalRemisionId,
            finalCustodioDoc,
            finalUsuarioId
          ]);
        }
      }
    }

    const calcTotalItems = total_items || rawItems.length;
    const calcTotalUnidades = total_unidades || rawItems.reduce((acc, it) => acc + (parseInt(it.cantidad, 10) || 1), 0);

    const remisionRes = await client.query(`
      INSERT INTO remisiones_consumibles (
        remision_id, codigo_acta, fecha_entrega, responsable_recibe,
        sede, proyecto, motivo, items, total_items, total_unidades,
        usuario_id, custodio_documento, created_at
      ) VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *;
    `, [
      finalRemisionId,
      finalCodigoActa,
      fecha_entrega || null,
      finalNombreCustodio,
      finalSede,
      proyecto || '',
      motivo || proyecto || 'Remisión agrupada de materiales STEAM',
      JSON.stringify(rawItems),
      calcTotalItems,
      calcTotalUnidades,
      finalUsuarioId,
      finalCustodioDoc
    ]);

    // Registrar auditoría en historial_movimientos
    await registrarMovimiento(client, {
      tipo: 'Entrega',
      elemento_nombre: rawItems.length > 0 ? rawItems.map(it => it.nombre || it.material_id).join(', ') : 'Remisión de Materiales',
      placa_o_id: finalRemisionId,
      cantidad: calcTotalUnidades,
      responsable: finalNombreCustodio,
      sede: finalSede,
      fecha: new Date().toISOString(),
      detalles: `Remisión ${finalCodigoActa} generada para proyecto STEAM: ${proyecto || 'General'}`,
      usuario_id: finalUsuarioId
    });

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Remisión de consumibles registrada exitosamente con custodio verificado.',
      data: remisionRes.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear remisión:', error.message);
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// GET /api/consumibles/entregas - Listar entregas de consumibles realizadas
router.get('/consumibles/entregas', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM entregas_consumibles ORDER BY created_at DESC'
    );
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('Error al listar entregas de consumibles:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// POST /api/consumibles/entregas - Registrar salida definitiva de consumibles con descuento de stock (Operativo: Operador o Admin)
router.post('/consumibles/entregas', requireOperadorOAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      material_id,
      item_id,
      material_nombre,
      cantidad = 1,
      responsable,
      person,
      sede = 'Medellín',
      proyecto_motivo,
      motivo,
      tipo = 'Consumido'
    } = req.body;

    const finalMaterialId = (material_id || item_id || '').trim();
    const finalResponsable = (responsable || person || '').trim();
    const finalCantidad = Math.max(1, parseInt(cantidad, 10) || 1);
    const finalMotivo = (proyecto_motivo || motivo || 'Salida de material para taller').trim();

    if (!finalMaterialId || !finalResponsable) {
      return res.status(400).json({
        success: false,
        message: 'El material_id (o item_id) y responsable son obligatorios para registrar la entrega.'
      });
    }

    await client.query('BEGIN');

    // 1. Verificar consumible en bodega
    const consRes = await client.query(
      'SELECT * FROM consumibles WHERE LOWER(id) = LOWER($1) FOR UPDATE',
      [finalMaterialId]
    );

    if (consRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Material o consumible no encontrado con id ' + finalMaterialId
      });
    }

    const consumibleActual = consRes.rows[0];
    const stockDisponible = parseInt(consumibleActual.disponible, 10) || 0;

    if (stockDisponible < finalCantidad) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Stock insuficiente para ' + consumibleActual.material + '. Solicitado: ' + finalCantidad + ', disponible: ' + stockDisponible
      });
    }

    // 2. Descontar stock disponible en la tabla consumibles
    await client.query(
      'UPDATE consumibles SET disponible = disponible - $1 WHERE id = $2 AND disponible >= $1',
      [finalCantidad, consumibleActual.id]
    );

    // 3. Insertar en tabla entregas_consumibles
    const insertRes = await client.query(
      'INSERT INTO entregas_consumibles (material_id, material_nombre, cantidad, responsable, sede, proyecto_motivo, tipo, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *',
      [
        consumibleActual.id,
        material_nombre || consumibleActual.material,
        finalCantidad,
        finalResponsable,
        sede,
        finalMotivo,
        tipo
      ]
    );

    // 4. Registrar en historial_movimientos dentro de la transacción atómica
    await registrarMovimiento(client, {
      tipo: 'Entrega',
      elemento_nombre: material_nombre || consumibleActual.material,
      placa_o_id: consumibleActual.id,
      cantidad: finalCantidad,
      responsable: finalResponsable,
      sede: sede || 'Medellín',
      fecha: new Date().toISOString(),
      detalles: finalMotivo
    });

    await client.query('COMMIT');

    console.log('Entrega de consumible persistida exitosamente:', insertRes.rows[0].id);
    res.status(201).json({
      success: true,
      message: 'Entrega de consumible registrada exitosamente y stock descontado',
      data: insertRes.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al registrar entrega de consumible:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error en base de datos al registrar entrega: ' + error.message
    });
  } finally {
    client.release();
  }
});

// 3. PRÉSTAMOS
// ==========================================

// GET /api/prestamos - Lista historial de préstamos (activos y consumibles con datos relacionales de usuario)
router.get('/prestamos', async (req, res, next) => {
  try {
    const query = `
      SELECT 
        p.*,
        COALESCE(a.nombre, c.material, p.placa_activo) as nombre_activo,
        a.marca,
        a.modelo,
        c.categoria as categoria_consumible,
        u.documento as usuario_documento,
        u.nombre_completo as usuario_nombre,
        u.email as usuario_email,
        u.rol as usuario_rol,
        u.telefono as usuario_telefono
      FROM prestamos p
      LEFT JOIN activos a ON LOWER(p.placa_activo) = LOWER(a.placa)
      LEFT JOIN consumibles c ON LOWER(p.placa_activo) = LOWER(c.id)
      LEFT JOIN perfiles u ON p.usuario_id = u.id OR (p.usuario_id IS NULL AND LOWER(p.custodio_documento) = LOWER(u.documento))
      ORDER BY p.id DESC
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('Error al obtener préstamos de DB:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// POST /api/prestamos - Registra préstamo con validación estricta de custodio/usuario (Operativo: Operador o Admin)
router.post('/prestamos', requireOperadorOAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      placa_activo,
      item_id,
      tipo_item,
      cantidad = 1,
      solicitante,
      responsable,
      custodio_documento,
      solicitante_documento,
      documento,
      usuario_id,
      sede = 'Medellín',
      motivo = '',
      fecha_salida,
      fecha_devolucion_esperada,
      fecha_devolucion_estimada
    } = req.body;

    const finalItemId = (item_id || placa_activo || '').trim();
    const finalSolicitante = (solicitante || responsable || '').trim();
    const finalFechaDevolucion = fecha_devolucion_esperada || fecha_devolucion_estimada;
    const finalCantidad = Math.max(1, parseInt(cantidad, 10) || 1);

    if (!finalItemId || (!finalSolicitante && !usuario_id && !custodio_documento && !documento) || !finalFechaDevolucion) {
      return res.status(400).json({
        success: false,
        message: 'El identificador del ítem (item_id o placa_activo), solicitante/custodio y fecha_devolucion_esperada son requeridos.'
      });
    }

    await client.query('BEGIN');

    // Validar usuario custodio en tabla perfiles
    const usuarioValido = await resolverUsuarioCustodio(client, {
      usuario_id,
      custodio_documento: custodio_documento || solicitante_documento || documento,
      solicitante: finalSolicitante
    });

    const finalUsuarioId = usuarioValido ? usuarioValido.id : null;
    const finalCustodioDoc = usuarioValido ? usuarioValido.documento : (custodio_documento || solicitante_documento || documento || null);
    const finalNombreCustodio = usuarioValido ? usuarioValido.nombre_completo : finalSolicitante;
    const finalSede = sede || (usuarioValido ? usuarioValido.sede : 'Medellín');

    // Determinar si es consumible o activo
    let detectedTipo = tipo_item ? tipo_item.toLowerCase() : null;
    if (!detectedTipo) {
      if (finalItemId.toUpperCase().startsWith('ROB') || finalItemId.toUpperCase().startsWith('MAT')) {
        detectedTipo = 'consumible';
      } else {
        const checkCons = await client.query('SELECT id FROM consumibles WHERE LOWER(id) = LOWER($1)', [finalItemId]);
        detectedTipo = checkCons.rows.length > 0 ? 'consumible' : 'activo';
      }
    }

    let prestamoInsertado;

    if (detectedTipo === 'consumible') {
      // 1. Verificar consumible y stock disponible
      const consRes = await client.query(
        'SELECT * FROM consumibles WHERE LOWER(id) = LOWER($1) FOR UPDATE',
        [finalItemId]
      );

      if (consRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: `Consumible/insumo con código ${finalItemId} no encontrado.`
        });
      }

      const consumibleActual = consRes.rows[0];
      const stockDisponible = parseInt(consumibleActual.disponible, 10) || 0;

      if (stockDisponible < finalCantidad) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente para ${consumibleActual.material} (Solicitado: ${finalCantidad}, Disponible: ${stockDisponible})`
        });
      }

      // 2. Descontar stock disponible en tabla consumibles
      await client.query(
        'UPDATE consumibles SET disponible = disponible - $1 WHERE id = $2 AND disponible >= $1',
        [finalCantidad, consumibleActual.id]
      );

      // 3. Insertar préstamo con tipo_item = consumible, usuario_id y custodio_documento
      const prestamoRes = await client.query(
        `INSERT INTO prestamos (
            placa_activo,
            tipo_item,
            cantidad,
            solicitante,
            sede,
            motivo,
            fecha_salida,
            fecha_devolucion_esperada,
            estado,
            usuario_id,
            custodio_documento,
            solicitante_documento
          )
          VALUES ($1, 'consumible', $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, 'Activo', $8, $9, $9)
          RETURNING *`,
        [
          consumibleActual.id,
          finalCantidad,
          finalNombreCustodio,
          finalSede,
          motivo,
          fecha_salida || null,
          finalFechaDevolucion,
          finalUsuarioId,
          finalCustodioDoc
        ]
      );

      prestamoInsertado = prestamoRes.rows[0];
      prestamoInsertado.nombre_activo = consumibleActual.material;
    } else {
      // Flujo de Activo Tecnológico
      const activoRes = await client.query(
        'SELECT * FROM activos WHERE LOWER(placa) = LOWER($1) FOR UPDATE',
        [finalItemId]
      );

      if (activoRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: `Activo con placa ${finalItemId} no encontrado.`
        });
      }

      const activoActual = activoRes.rows[0];

      const prestamoRes = await client.query(
        `INSERT INTO prestamos (
            placa_activo,
            tipo_item,
            cantidad,
            solicitante,
            sede,
            motivo,
            fecha_salida,
            fecha_devolucion_esperada,
            estado,
            usuario_id,
            custodio_documento,
            solicitante_documento
          )
          VALUES ($1, 'activo', 1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6, 'Activo', $7, $8, $8)
          RETURNING *`,
        [
          activoActual.placa,
          finalNombreCustodio,
          finalSede,
          motivo,
          fecha_salida || null,
          finalFechaDevolucion,
          finalUsuarioId,
          finalCustodioDoc
        ]
      );

      await client.query(
        `UPDATE activos
          SET estado = 'En campo',
              custodio = $1,
              fecha_devolucion = $2,
              custodio_documento = $3,
              usuario_id = $4
          WHERE placa = $5`,
        [finalNombreCustodio, finalFechaDevolucion, finalCustodioDoc, finalUsuarioId, activoActual.placa]
      );

      prestamoInsertado = prestamoRes.rows[0];
      prestamoInsertado.nombre_activo = activoActual.nombre;
    }

    // Registrar en historial_movimientos dentro de la transacción atómica
    await registrarMovimiento(client, {
      tipo: 'Préstamo',
      elemento_nombre: prestamoInsertado.nombre_activo || finalItemId,
      placa_o_id: finalItemId,
      cantidad: finalCantidad,
      responsable: finalNombreCustodio,
      sede: finalSede,
      fecha: new Date().toISOString(),
      detalles: motivo || 'Préstamo operativo asignado',
      usuario_id: finalUsuarioId
    });

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Préstamo registrado exitosamente y stock/activo actualizado con custodio verificado',
      data: prestamoInsertado
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear préstamo en DB:', error);
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// PUT /api/prestamos/:id/devolver & /api/prestamos/:id/retorno - Marca préstamo como devuelto y registra Devolución en Historial
const handleDevolverPrestamo = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { responsable: bodyResponsable, sede: bodySede, detalles: bodyDetalles } = req.body || {};

    await client.query('BEGIN');

    const prestamoRes = await client.query(
      `SELECT 
         p.*,
         COALESCE(a.nombre, c.material, p.placa_activo) AS nombre_activo,
         a.sede AS activo_sede
       FROM prestamos p
       LEFT JOIN activos a ON LOWER(p.placa_activo) = LOWER(a.placa)
       LEFT JOIN consumibles c ON LOWER(p.placa_activo) = LOWER(c.id)
       WHERE p.id = $1 FOR UPDATE OF p`,
      [id]
    );

    if (prestamoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });
    }

    const prestamo = prestamoRes.rows[0];

    if (prestamo.estado === 'Devuelto') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Este préstamo ya fue marcado como devuelto previamente.' });
    }

    const updatedPrestamoRes = await client.query(
      `UPDATE prestamos
         SET estado = 'Devuelto',
             fecha_devolucion_real = CURRENT_DATE
         WHERE id = $1
         RETURNING *`,
      [id]
    );

    const esConsumible = prestamo.tipo_item === 'consumible' ||
      (prestamo.placa_activo && (prestamo.placa_activo.toUpperCase().startsWith('ROB') || prestamo.placa_activo.toUpperCase().startsWith('MAT')));

    if (esConsumible) {
      const cantRestaurar = Math.max(1, prestamo.cantidad || 1);
      await client.query(
        'UPDATE consumibles SET disponible = disponible + $1 WHERE LOWER(id) = LOWER($2)',
        [cantRestaurar, prestamo.placa_activo]
      );
    } else {
      await client.query(
        `UPDATE activos
           SET estado = 'Disponible',
               custodio = NULL,
               fecha_devolucion = NULL
           WHERE LOWER(placa) = LOWER($1)`,
        [prestamo.placa_activo]
      );
    }

    // REGISTRO OBLIGATORIO Y ATÓMICO EN HISTORIAL DE MOVIMIENTOS
    const devolucionHistorial = await registrarMovimiento(client, {
      tipo: 'Devolución',
      elemento_nombre: prestamo.nombre_activo || `Activo ${prestamo.placa_activo}`,
      placa_o_id: prestamo.placa_activo,
      cantidad: prestamo.cantidad || 1,
      responsable: bodyResponsable || prestamo.solicitante || 'Custodio',
      sede: bodySede || prestamo.sede || prestamo.activo_sede || 'MEDELLÍN',
      fecha: new Date().toISOString(),
      detalles: bodyDetalles || 'Retorno a bodega confirmado. Activo disponible.'
    });

    // Registrar auditoría de retorno en historial_movimientos
    try {
      let nombreEquipo = 'Activo tecnológico';
      if (!esConsumible) {
        const actRes = await client.query('SELECT nombre FROM activos WHERE LOWER(placa) = LOWER($1)', [prestamo.placa_activo]);
        if (actRes.rows.length > 0 && actRes.rows[0].nombre) {
          nombreEquipo = actRes.rows[0].nombre;
        }
      } else {
        const conRes = await client.query('SELECT material FROM consumibles WHERE LOWER(id) = LOWER($1)', [prestamo.placa_activo]);
        if (conRes.rows.length > 0 && conRes.rows[0].material) {
          nombreEquipo = conRes.rows[0].material;
        }
      }

      await registrarMovimiento(client, {
        tipo: 'Devolución',
        elemento_nombre: nombreEquipo,
        placa_o_id: prestamo.placa_activo,
        cantidad: Math.max(1, prestamo.cantidad || 1),
        responsable: prestamo.solicitante,
        sede: prestamo.sede || 'Medellín',
        fecha: new Date().toISOString(),
        detalles: 'Retorno a bodega confirmado. Activo disponible.',
        usuario_id: prestamo.usuario_id || null
      });
    } catch (errHist) {
      console.warn('Aviso: no se pudo registrar retorno en historial_movimientos:', errHist.message);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Préstamo marcado como devuelto, existencias/activo restablecido y registrado en historial de movimientos',
      data: {
        prestamo: updatedPrestamoRes.rows[0],
        movimiento_historial: devolucionHistorial
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al devolver préstamo:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

router.put('/prestamos/:id/devolver', requireOperadorOAdmin, handleDevolverPrestamo);
router.put('/prestamos/:id/retorno', requireOperadorOAdmin, handleDevolverPrestamo);

// ==========================================
// 4. GESTIÓN DE USUARIOS Y PERFILES
// ==========================================

// GET /api/usuarios/mis-solicitudes - Solicitudes y préstamos del usuario autenticado
router.get('/usuarios/mis-solicitudes', async (req, res) => {
  try {
    const documento = (req.query.documento || req.headers['x-user-documento'] || '').trim();
    const usuarioId = (req.query.usuario_id || req.headers['x-user-id'] || '').trim();
    const email = (req.query.email || req.headers['x-user-email'] || '').trim().toLowerCase();

    if (!documento && !usuarioId && !email) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere documento, usuario_id o email para consultar las solicitudes asociadas.'
      });
    }

    // 1. Equipos en préstamo asignados al usuario
    const prestamosQuery = `
      SELECT p.*, a.nombre AS nombre_activo, a.marca, a.modelo, a.serial, a.categoria, a.tipo_inventario, a.ubicacion_estante
      FROM prestamos p
      LEFT JOIN activos a ON LOWER(a.placa) = LOWER(p.placa_activo)
      WHERE p.estado = 'Activo'
        AND (
          ($1 <> '' AND (LOWER(p.solicitante_documento) = LOWER($1) OR LOWER(a.custodio_documento) = LOWER($1)))
          OR ($2 <> '' AND (p.usuario_id::text = $2 OR a.usuario_id::text = $2))
          OR ($3 <> '' AND LOWER(p.solicitante) LIKE '%' || $3 || '%')
        )
      ORDER BY p.fecha_salida DESC
    `;

    // 2. Consumibles entregados al usuario
    const entregasQuery = `
      SELECT e.*, c.categoria, c.tipo_inventario, c.ubicacion_estante
      FROM entregas_consumibles e
      LEFT JOIN consumibles c ON LOWER(c.id) = LOWER(e.material_id)
      WHERE (
        ($1 <> '' AND LOWER(e.responsable_documento) = LOWER($1))
        OR ($2 <> '' AND e.usuario_id::text = $2)
        OR ($3 <> '' AND LOWER(e.responsable) LIKE '%' || $3 || '%')
      )
      ORDER BY e.created_at DESC
    `;

    // Buscar si existe el nombre del usuario si tenemos documento
    let searchName = '';
    if (documento) {
      const perfilRes = await pool.query('SELECT nombre_completo FROM perfiles WHERE documento = $1', [documento]);
      if (perfilRes.rows.length > 0) {
        searchName = perfilRes.rows[0].nombre_completo.toLowerCase();
      }
    }

    const [prestamosRes, entregasRes] = await Promise.all([
      pool.query(prestamosQuery, [documento, usuarioId, searchName]),
      pool.query(entregasQuery, [documento, usuarioId, searchName])
    ]);

    res.json({
      success: true,
      data: {
        prestamos_activos: prestamosRes.rows || [],
        entregas_consumibles: entregasRes.rows || []
      }
    });
  } catch (error) {
    console.error('Error al consultar mis solicitudes:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/usuarios - Listar usuarios con filtros por rol y búsqueda (excluyendo password)
router.get('/usuarios', async (req, res) => {
  try {
    const { rol, search, sede, activo } = req.query;

    let query = 'SELECT id, documento, nombre_completo, telefono, email, rol, activo, sede, cargo, created_at, updated_at FROM perfiles WHERE 1=1';
    const params = [];

    if (rol) {
      params.push(rol.toLowerCase());
      query += ` AND LOWER(rol) = $${params.length}`;
    }

    if (sede) {
      params.push(sede);
      query += ` AND LOWER(sede) = LOWER($${params.length})`;
    }

    if (activo !== undefined) {
      params.push(activo === 'true' || activo === true);
      query += ` AND activo = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(documento) LIKE $${params.length} OR LOWER(nombre_completo) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`;
    }

    query += ' ORDER BY nombre_completo ASC';

    const result = await pool.query(query, params);
    const usuariosSinPassword = (result.rows || []).map(row => {
      const u = { ...row };
      delete u.password;
      return u;
    });

    res.json({ success: true, data: usuariosSinPassword });
  } catch (error) {
    console.error('Error al listar usuarios:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// GET /api/usuarios/:id & /api/perfiles/:id - Obtener detalle de usuario por UUID o documento (excluyendo password)
const handleGetUsuarioPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const query = isUuid
      ? 'SELECT id, documento, nombre_completo, telefono, email, rol, activo, sede, cargo, created_at, updated_at FROM perfiles WHERE id = $1'
      : 'SELECT id, documento, nombre_completo, telefono, email, rol, activo, sede, cargo, created_at, updated_at FROM perfiles WHERE LOWER(documento) = LOWER($1) OR LOWER(email) = LOWER($1)';

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const usuario = { ...result.rows[0] };
    delete usuario.password;

    res.json({ success: true, data: usuario });
  } catch (error) {
    console.error('Error al obtener usuario:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

router.get('/usuarios/:id', handleGetUsuarioPorId);
router.get('/perfiles/:id', handleGetUsuarioPorId);

// GET /api/perfiles - Alias de /api/usuarios
router.get('/perfiles', async (req, res) => {
  try {
    const { rol, search, sede, activo } = req.query;

    let query = 'SELECT id, documento, nombre_completo, telefono, email, rol, activo, sede, cargo, created_at, updated_at FROM perfiles WHERE 1=1';
    const params = [];

    if (rol) {
      params.push(rol.toLowerCase());
      query += ` AND LOWER(rol) = $${params.length}`;
    }

    if (sede) {
      params.push(sede);
      query += ` AND LOWER(sede) = LOWER($${params.length})`;
    }

    if (activo !== undefined) {
      params.push(activo === 'true' || activo === true);
      query += ` AND activo = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(documento) LIKE $${params.length} OR LOWER(nombre_completo) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`;
    }

    query += ' ORDER BY nombre_completo ASC';

    const result = await pool.query(query, params);
    const perfilesSinPassword = (result.rows || []).map(row => {
      const u = { ...row };
      delete u.password;
      return u;
    });

    res.json({ success: true, data: perfilesSinPassword });
  } catch (error) {
    console.error('Error al listar perfiles:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// POST /api/usuarios - Registro de nuevo usuario (Requiere Administrador)
router.post('/usuarios', requireAdminOnly, async (req, res) => {
  try {
    const {
      documento,
      nombre_completo,
      telefono,
      email,
      rol,
      sede,
      cargo,
      password
    } = req.body;

    // 1. Validaciones previas en servidor:
    // Comprobar que ningún campo obligatorio esté vacío
    if (!documento || String(documento).trim() === '') {
      return res.status(400).json({ error: 'El documento es obligatorio.' });
    }
    if (!nombre_completo || String(nombre_completo).trim() === '') {
      return res.status(400).json({ error: 'El nombre completo es obligatorio.' });
    }
    if (!email || String(email).trim() === '') {
      return res.status(400).json({ error: 'El correo electrónico es obligatorio.' });
    }
    // Validar rol si se proporciona
    const rolesValidos = ['administrador', 'supervisor', 'operador', 'usuario'];
    const finalRol = rol ? String(rol).trim().toLowerCase() : 'usuario';
    if (!rolesValidos.includes(finalRol)) {
      return res.status(400).json({
        error: `Rol inválido. Roles permitidos: ${rolesValidos.join(', ')}`
      });
    }

    // 1. Asignación de Contraseña por Defecto al Registrar Nuevo Usuario:
    // Si no se proporciona una contraseña personalizada, asignar por defecto según el rol:
    // administrador -> 'admin123', supervisor -> 'sup123', operador -> 'oper123', usuario -> 'usu123'
    let effectivePassword = password && String(password).trim() !== '' ? String(password).trim() : null;
    if (!effectivePassword) {
      if (finalRol === 'administrador') effectivePassword = 'admin123';
      else if (finalRol === 'supervisor') effectivePassword = 'sup123';
      else if (finalRol === 'operador') effectivePassword = 'oper123';
      else effectivePassword = 'usu123';
    }

    // Validar formato de correo y que la contraseña cumpla con mínimo 6 o 8 caracteres si se especifica
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      return res.status(400).json({ error: 'El formato del correo electrónico es inválido.' });
    }

    if (password && String(password).trim().length < 8) {
      return res.status(400).json({ error: 'La contraseña debe contener al menos 8 caracteres.' });
    }

    if (effectivePassword.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe contener al menos 6 caracteres.' });
    }

    // Hashear la contraseña con bcrypt.hash(password, 10)
    const passwordHash = await bcrypt.hash(effectivePassword, 10);

    // Verificar que no exista un perfil previo con el mismo documento o correo en perfiles
    const existingCheck = await pool.query(
      'SELECT documento, email FROM perfiles WHERE LOWER(documento) = LOWER($1) OR LOWER(email) = LOWER($2)',
      [String(documento).trim(), String(email).trim().toLowerCase()]
    );

    if (existingCheck.rows.length > 0) {
      const existing = existingCheck.rows[0];
      if (existing.documento.toLowerCase() === String(documento).trim().toLowerCase()) {
        return res.status(400).json({ error: 'Ya existe un usuario con este documento de identidad.' });
      }
      return res.status(400).json({ error: 'Ya existe un usuario con este correo electrónico.' });
    }

    // Paso 1 (Crear credenciales en Supabase Auth)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: effectivePassword,
      email_confirm: true, // Deja el correo validado para permitir login inmediato
      user_metadata: {
        nombre_completo: nombre_completo.trim(),
        documento: documento.trim(),
        rol: finalRol,
        sede: sede ? String(sede).trim() : 'Medellín',
        cargo: cargo ? String(cargo).trim() : null
      }
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Paso 2 (Registrar datos en la tabla pública perfiles incluyendo password hasheado)
    const { data: perfilData, error: perfilError } = await supabaseAdmin
      .from('perfiles')
      .insert({
        id: authData.user.id, // Mismo UUID de auth.users
        documento: documento.trim(),
        nombre_completo: nombre_completo.trim(),
        telefono: telefono ? String(telefono).trim() : null,
        email: email.trim().toLowerCase(),
        rol: finalRol,
        sede: sede ? String(sede).trim() : 'Medellín',
        cargo: cargo ? String(cargo).trim() : null,
        password: passwordHash
      })
      .select()
      .single();

    if (perfilError) {
      // Rollback opcional: si falla la tabla de perfiles, limpiar el usuario de Auth
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: 'Error al registrar el perfil en la base de datos' });
    }

    // Asegurar que el hash quede también en postgres pool si supabaseAdmin tuvo problemas con la columna
    try {
      await pool.query('UPDATE perfiles SET password = $1 WHERE id = $2', [passwordHash, perfilData.id]);
    } catch {
      // Continuar
    }

    // Paso 3 (Registro en Auditoría / Historial)
    try {
      await registrarMovimiento(pool, {
        tipo: 'Ingreso',
        elemento_nombre: nombre_completo.trim(),
        placa_o_id: documento.trim(),
        cantidad: 1,
        responsable: nombre_completo.trim(),
        sede: sede ? String(sede).trim() : 'Medellín',
        detalles: `Registro de nuevo usuario ${nombre_completo.trim()} con rol ${finalRol}`,
        usuario_id: perfilData.id
      });
    } catch (auditError) {
      console.warn('Advertencia: no se pudo registrar en historial_movimientos:', auditError.message);
    }

    // Respuesta exitosa (excluyendo password)
    const usuarioRespuesta = { ...perfilData };
    delete usuarioRespuesta.password;

    return res.status(201).json({
      mensaje: 'Usuario registrado exitosamente',
      usuario: usuarioRespuesta
    });
  } catch (error) {
    console.error('Error al registrar usuario:', error.message);
    res.status(500).json({ error: error.message || 'Error interno del servidor al crear usuario' });
  }
});

// ==========================================
// 4.1 AUTENTICACIÓN: CAMBIO DE CONTRASEÑA
// ==========================================

// POST /api/auth/login (con rate limiting)
router.post('/auth/login', loginLimiter, authController.login);

// PUT /api/auth/cambiar-password - Cambio de contraseña del usuario autenticado
router.put('/auth/cambiar-password', verifyToken, authController.cambiarPassword);

// POST /api/auth/cambiar-password (compatibilidad con frontend)
router.post('/auth/cambiar-password', verifyToken, authController.cambiarPassword);

// PUT /api/usuarios/:id - Actualización de datos personales y reasignación de rol (Requiere Administrador)
router.put('/usuarios/:id', requireAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      documento,
      nombre_completo,
      nombre,
      telefono,
      email,
      rol,
      sede,
      cargo,
      activo
    } = req.body;

    const nombreFinal = nombre_completo !== undefined ? nombre_completo : nombre;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (rol) {
      const rolesValidos = ['administrador', 'operador', 'supervisor', 'usuario'];
      if (!rolesValidos.includes(rol.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: `Rol inválido. Roles permitidos: ${rolesValidos.join(', ')}`
        });
      }
    }

    const query = `
      UPDATE perfiles
      SET
        documento = COALESCE($1, documento),
        nombre_completo = COALESCE($2, nombre_completo),
        telefono = COALESCE($3, telefono),
        email = COALESCE($4, email),
        rol = COALESCE($5, rol),
        sede = COALESCE($6, sede),
        cargo = COALESCE($7, cargo),
        activo = COALESCE($8, activo),
        updated_at = NOW()
      WHERE ${isUuid ? 'id = $9' : '(LOWER(documento) = LOWER($9) OR id::text = $9)'}
      RETURNING *;
    `;

    const values = [
      documento !== undefined ? documento.trim() : null,
      nombreFinal !== undefined ? String(nombreFinal).trim() : null,
      telefono !== undefined ? telefono.trim() : null,
      email !== undefined ? email.trim().toLowerCase() : null,
      rol !== undefined ? rol.toLowerCase() : null,
      sede !== undefined ? sede : null,
      cargo !== undefined ? cargo : null,
      activo !== undefined ? activo : null,
      id
    ];

    let result = await pool.query(query, values);

    // Si no encontró por ID (ej: id legado tipo 'usr-006' o mock), intentar UPSERT por documento o email
    if (result.rows.length === 0) {
      const docTarget = documento ? documento.trim() : (!isUuid ? id : null);
      if (docTarget || email) {
        const upsertQuery = `
          INSERT INTO perfiles (
            id,
            documento,
            nombre_completo,
            telefono,
            email,
            rol,
            sede,
            cargo,
            activo,
            created_at,
            updated_at
          )
          VALUES (
            ${isUuid ? '$1' : 'gen_random_uuid()'},
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            COALESCE($9, true),
            NOW(),
            NOW()
          )
          ON CONFLICT (documento) DO UPDATE
          SET
            nombre_completo = COALESCE(EXCLUDED.nombre_completo, perfiles.nombre_completo),
            telefono = COALESCE(EXCLUDED.telefono, perfiles.telefono),
            email = COALESCE(EXCLUDED.email, perfiles.email),
            rol = COALESCE(EXCLUDED.rol, perfiles.rol),
            sede = COALESCE(EXCLUDED.sede, perfiles.sede),
            cargo = COALESCE(EXCLUDED.cargo, perfiles.cargo),
            activo = COALESCE(EXCLUDED.activo, perfiles.activo),
            updated_at = NOW()
          RETURNING *;
        `;

        const upsertValues = isUuid ? [
          id,
          docTarget || 'DOC-' + Date.now(),
          nombreFinal ? String(nombreFinal).trim() : 'Usuario SIGA',
          telefono ? telefono.trim() : '3000000000',
          email ? email.trim().toLowerCase() : `usuario_${Date.now()}@fmo.org`,
          rol ? rol.toLowerCase() : 'usuario',
          sede || 'Medellín',
          cargo || 'Funcionario FMO',
          activo !== undefined ? activo : true
        ] : [
          docTarget || 'DOC-' + Date.now(),
          nombreFinal ? String(nombreFinal).trim() : 'Usuario SIGA',
          telefono ? telefono.trim() : '3000000000',
          email ? email.trim().toLowerCase() : `usuario_${Date.now()}@fmo.org`,
          rol ? rol.toLowerCase() : 'usuario',
          sede || 'Medellín',
          cargo || 'Funcionario FMO',
          activo !== undefined ? activo : true
        ];

        // Si no es UUID, ajustamos la query para no pasar $1 para id
        const finalUpsertQuery = isUuid ? upsertQuery : `
          INSERT INTO perfiles (
            id,
            documento,
            nombre_completo,
            telefono,
            email,
            rol,
            sede,
            cargo,
            activo,
            created_at,
            updated_at
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            COALESCE($8, true),
            NOW(),
            NOW()
          )
          ON CONFLICT (documento) DO UPDATE
          SET
            nombre_completo = COALESCE(EXCLUDED.nombre_completo, perfiles.nombre_completo),
            telefono = COALESCE(EXCLUDED.telefono, perfiles.telefono),
            email = COALESCE(EXCLUDED.email, perfiles.email),
            rol = COALESCE(EXCLUDED.rol, perfiles.rol),
            sede = COALESCE(EXCLUDED.sede, perfiles.sede),
            cargo = COALESCE(EXCLUDED.cargo, perfiles.cargo),
            activo = COALESCE(EXCLUDED.activo, perfiles.activo),
            updated_at = NOW()
          RETURNING *;
        `;

        result = await pool.query(finalUpsertQuery, upsertValues);
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado para actualizar y no se pudo registrar.' });
    }

    const usuarioActualizado = { ...result.rows[0] };
    delete usuarioActualizado.password;

    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: usuarioActualizado
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Documento o email duplicado con otro usuario existente.' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 5. CÁLCULO DE AUTOCONSECUTIVOS
// ==========================================

// GET /api/consecutivos/:tipo - Generar siguiente código correlativo institucional
router.get('/consecutivos/:tipo', async (req, res) => {
  try {
    const tipo = (req.params.tipo || 'tecnologia').toLowerCase();

    if (tipo === 'tecnologia' || tipo === 'activos' || tipo === 'equipo') {
      // Formato P{n+1}
      const pResult = await pool.query(`
        SELECT COALESCE(MAX(NULLIF(regexp_replace(placa, '^[^0-9]*', '', 'g'), '')::int), 0) AS max_num
        FROM activos
        WHERE placa ~ '^P[0-9]+$'
      `);
      const nextNum = (parseInt(pResult.rows[0]?.max_num, 10) || 0) + 1;
      return res.json({
        success: true,
        tipo: 'tecnologia',
        siguiente_codigo: `P${nextNum}`,
        numero: nextNum
      });
    }

    if (tipo === 'robotica' || tipo === 'consumible' || tipo === 'consumibles') {
      // Formato Rob{n+1} con 4 dígitos
      const rResult = await pool.query(`
        SELECT COALESCE(MAX(NULLIF(regexp_replace(id, '^[^0-9]*', '', 'g'), '')::int), 0) AS max_num
        FROM consumibles
        WHERE id ~* '^Rob[0-9]+$'
      `);
      const nextNum = (parseInt(rResult.rows[0]?.max_num, 10) || 0) + 1;
      const padded = String(nextNum).padStart(4, '0');
      return res.json({
        success: true,
        tipo: 'robotica',
        siguiente_codigo: `Rob${padded}`,
        numero: nextNum
      });
    }

    if (tipo === 'papeleria') {
      const caja = (req.query.caja || req.query.ubicacion_estante || '').trim();
      let cajaNum = null;
      const matchCaja = caja.match(/(\d+)/);
      if (matchCaja) {
        cajaNum = parseInt(matchCaja[1], 10);
      }

      if (cajaNum !== null && !isNaN(cajaNum) && cajaNum > 0) {
        // Formato Pape{caja}XXX (ej. Pape1001, Pape2001, Pape3001)
        const prefix = `Pape${cajaNum}`;
        const papCajaResult = await pool.query(`
          SELECT id FROM papeleria WHERE id ~* '^${prefix}[0-9]+$'
        `);
        
        let maxSuffix = 0;
        for (const row of papCajaResult.rows) {
          const numPart = parseInt(row.id.replace(new RegExp(`^${prefix}`, 'i'), ''), 10);
          if (!isNaN(numPart) && numPart > maxSuffix) {
            maxSuffix = numPart;
          }
        }
        const nextNum = maxSuffix + 1;
        const paddedSuffix = String(nextNum).padStart(3, '0');
        const siguienteCodigo = `${prefix}${paddedSuffix}`;

        return res.json({
          success: true,
          tipo: 'papeleria',
          caja: `CAJA #${cajaNum}`,
          siguiente_codigo: siguienteCodigo,
          numero: nextNum
        });
      }

      // Si no se especifica caja, calcular el máximo consecutivo de 4 dígitos (ej. Pape1231 -> Pape1232 o mayor)
      const allPapeResult = await pool.query(`
        SELECT id FROM papeleria WHERE id ~* '^Pape[0-9]+$'
      `);

      let maxTotal = 0;
      for (const row of allPapeResult.rows) {
        const numPart = parseInt(row.id.replace(/^Pape/i, ''), 10);
        if (!isNaN(numPart) && numPart > maxTotal) {
          maxTotal = numPart;
        }
      }

      const nextNum = maxTotal > 0 ? maxTotal + 1 : 1001;
      const siguienteCodigo = `Pape${String(nextNum).padStart(4, '0')}`;

      return res.json({
        success: true,
        tipo: 'papeleria',
        siguiente_codigo: siguienteCodigo,
        numero: nextNum
      });
    }

    if (tipo === 'mobiliario') {
      // Formato MOB{n+1} con 4 dígitos
      const mobResult = await pool.query(`
        SELECT COALESCE(MAX(NULLIF(regexp_replace(placa, '^[^0-9]*', '', 'g'), '')::int), 0) AS max_num
        FROM activos
        WHERE placa ~* '^MOB[0-9]+$'
      `);
      const nextNum = (parseInt(mobResult.rows[0]?.max_num, 10) || 0) + 1;
      const padded = String(nextNum).padStart(4, '0');
      return res.json({
        success: true,
        tipo: 'mobiliario',
        siguiente_codigo: `MOB${padded}`,
        numero: nextNum
      });
    }

    res.status(400).json({
      success: false,
      message: `Tipo de consecutivo no reconocido: "${tipo}". Tipos válidos: tecnologia, robotica, papeleria, mobiliario.`
    });
  } catch (error) {
    console.error('Error calculando consecutivo:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 6. ENDPOINTS DE PAPELERÍA INSTITUCIONAL
// ==========================================

// GET /api/papeleria - Listar insumos con filtros y búsqueda
router.get('/papeleria', async (req, res) => {
  try {
    const { ubicacion_estante, caja, search, estado, condicion, sede } = req.query;

    let query = 'SELECT * FROM papeleria WHERE 1=1';
    const params = [];

    const targetCaja = ubicacion_estante || caja;
    if (targetCaja) {
      params.push(`%${targetCaja.trim().toLowerCase()}%`);
      query += ` AND LOWER(ubicacion_estante) LIKE $${params.length}`;
    }

    if (sede) {
      params.push(`%${sede.trim().toLowerCase()}%`);
      query += ` AND LOWER(sede) LIKE $${params.length}`;
    }

    if (estado) {
      params.push(estado.trim().toLowerCase());
      query += ` AND LOWER(estado) = $${params.length}`;
    }

    if (condicion) {
      params.push(condicion.trim().toLowerCase());
      query += ` AND LOWER(condicion) = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(id) LIKE $${params.length} OR LOWER(material) LIKE $${params.length} OR LOWER(descripcion) LIKE $${params.length} OR LOWER(ubicacion_estante) LIKE $${params.length})`;
    }

    query += ' ORDER BY id ASC';

    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rows.length, data: result.rows || [] });
  } catch (error) {
    console.error('Error al listar papelería:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// GET /api/papeleria/:id - Detalle de un insumo de papelería
router.get('/papeleria/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM papeleria WHERE LOWER(id) = LOWER($1)', [id.trim()]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Insumo de papelería con código "${id}" no encontrado.` });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al consultar insumo de papelería:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/papeleria - Creación de nuevo insumo de papelería (Catálogo maestro: requiere Administrador)
router.post('/papeleria', requireAdminOnly, async (req, res) => {
  try {
    const {
      id,
      material,
      descripcion,
      disponible = 0,
      minimo = 5,
      sede = 'Oficina FMO',
      ubicacion_estante,
      caja,
      condicion = 'Nuevos',
      estado = 'Bueno',
      observaciones,
      responsable
    } = req.body;

    if (!material || !material.trim()) {
      return res.status(400).json({ success: false, message: 'El nombre del material es obligatorio.' });
    }

    const finalUbicacion = ubicacion_estante || caja || 'Fuera de cajas';

    // Si no viene id, calcular autoconsecutivo
    let finalId = (id || '').trim();
    if (!finalId) {
      let cajaNum = null;
      const matchCaja = finalUbicacion.match(/(\d+)/);
      if (matchCaja) cajaNum = parseInt(matchCaja[1], 10);

      if (cajaNum !== null && !isNaN(cajaNum) && cajaNum > 0) {
        const prefix = `Pape${cajaNum}`;
        const checkRes = await pool.query(`SELECT id FROM papeleria WHERE id ~* '^${prefix}[0-9]+$'`);
        let maxSuffix = 0;
        for (const row of checkRes.rows) {
          const numPart = parseInt(row.id.replace(new RegExp(`^${prefix}`, 'i'), ''), 10);
          if (!isNaN(numPart) && numPart > maxSuffix) maxSuffix = numPart;
        }
        finalId = `${prefix}${String(maxSuffix + 1).padStart(3, '0')}`;
      } else {
        const allRes = await pool.query(`SELECT id FROM papeleria WHERE id ~* '^Pape[0-9]+$'`);
        let maxTotal = 0;
        for (const row of allRes.rows) {
          const numPart = parseInt(row.id.replace(/^Pape/i, ''), 10);
          if (!isNaN(numPart) && numPart > maxTotal) maxTotal = numPart;
        }
        finalId = `Pape${String((maxTotal > 0 ? maxTotal : 1000) + 1).padStart(4, '0')}`;
      }
    }

    const query = `
      INSERT INTO papeleria (
        id, material, descripcion, disponible, minimo, sede,
        ubicacion_estante, condicion, estado, observaciones, responsable
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;

    const values = [
      finalId,
      material.trim(),
      descripcion ? descripcion.trim() : null,
      Math.max(0, parseInt(disponible, 10) || 0),
      Math.max(0, parseInt(minimo, 10) || 5),
      sede || 'Oficina FMO',
      finalUbicacion,
      condicion || 'Nuevos',
      estado || 'Bueno',
      observaciones ? observaciones.trim() : null,
      responsable ? responsable.trim() : null
    ];

    const result = await pool.query(query, values);
    const nuevoInsumo = result.rows[0];

    try {
      await registrarMovimiento(pool, {
        tipo: 'Ingreso',
        elemento_nombre: nuevoInsumo.material,
        placa_o_id: nuevoInsumo.id,
        cantidad: nuevoInsumo.disponible || 0,
        responsable: nuevoInsumo.responsable || 'Bodega Central',
        sede: nuevoInsumo.sede || 'Oficina FMO',
        detalles: nuevoInsumo.observaciones || 'Alta de insumo en papelería'
      });
    } catch (errHist) {
      console.warn('Aviso: no se pudo registrar auditoría de ingreso papelería:', errHist.message);
    }

    res.status(201).json({
      success: true,
      message: 'Insumo de papelería registrado exitosamente.',
      data: nuevoInsumo
    });
  } catch (error) {
    console.error('Error al registrar papelería:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ya existe un insumo de papelería con este código (id).' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/papeleria/:id - Actualización de ficha técnica, cantidades y ubicación física (Catálogo maestro: requiere Administrador)
router.put('/api/papeleria/:id', requireAdminOnly, async (req, res) => {
  // Manejador delegando al handler principal
  return handleUpdatePapeleria(req, res);
});

router.put('/papeleria/:id', requireAdminOnly, async (req, res) => {
  return handleUpdatePapeleria(req, res);
});

const handleUpdatePapeleria = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nuevo_id,
      id: bodyId,
      placa,
      codigo,
      material,
      descripcion,
      disponible,
      minimo,
      sede,
      ubicacion,
      ubicacion_estante,
      caja,
      condicion,
      estado,
      observaciones,
      responsable
    } = req.body;

    const targetId = (nuevo_id || bodyId || placa || codigo || '').trim();
    const finalId = targetId || id;

    // Si cambió la placa / código / id, verificar que no colisione con otro
    if (targetId && targetId.toLowerCase() !== id.toLowerCase()) {
      const checkDup = await pool.query('SELECT id FROM papeleria WHERE LOWER(id) = LOWER($1)', [targetId]);
      if (checkDup.rows.length > 0) {
        return res.status(400).json({ success: false, message: `La placa o código "${targetId}" ya existe en papelería.` });
      }
    }

    const finalUbi = ubicacion_estante !== undefined ? ubicacion_estante : (caja !== undefined ? caja : null);
    const finalSede = sede !== undefined ? sede : (ubicacion !== undefined ? ubicacion : null);

    const query = `
      UPDATE papeleria
      SET
        id = COALESCE($1, id),
        material = COALESCE($2, material),
        descripcion = COALESCE($3, descripcion),
        disponible = COALESCE($4, disponible),
        minimo = COALESCE($5, minimo),
        sede = COALESCE($6, sede),
        ubicacion_estante = COALESCE($7, ubicacion_estante),
        condicion = COALESCE($8, condicion),
        estado = COALESCE($9, estado),
        observaciones = COALESCE($10, observaciones),
        responsable = COALESCE($11, responsable),
        updated_at = NOW()
      WHERE LOWER(id) = LOWER($12)
      RETURNING *;
    `;

    const values = [
      finalId,
      material !== undefined ? material.trim() : null,
      descripcion !== undefined ? descripcion : null,
      disponible !== undefined && disponible !== '' ? parseInt(disponible, 10) : null,
      minimo !== undefined && minimo !== '' ? parseInt(minimo, 10) : null,
      finalSede,
      finalUbi,
      condicion !== undefined ? condicion : null,
      estado !== undefined ? estado : null,
      observaciones !== undefined ? observaciones : null,
      responsable !== undefined ? responsable : null,
      id.trim()
    ];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Insumo con código "${id}" no encontrado para actualizar.` });
    }

    if (targetId && targetId.toLowerCase() !== id.toLowerCase()) {
      try {
        await pool.query('UPDATE entregas_consumibles SET material_id = $1 WHERE LOWER(material_id) = LOWER($2)', [targetId, id]);
      } catch (errSync) {
        console.warn('Advertencia al sincronizar entregas_consumibles:', errSync.message);
      }
    }

    const insumoActualizado = result.rows[0];

    try {
      const esBaja = (insumoActualizado.estado || '').toLowerCase().includes('baja');
      await registrarMovimiento(pool, {
        tipo: esBaja ? 'Baja' : 'Actualización',
        elemento_nombre: insumoActualizado.material,
        placa_o_id: insumoActualizado.id,
        cantidad: insumoActualizado.disponible || 1,
        responsable: insumoActualizado.responsable || 'Bodega Central',
        sede: insumoActualizado.sede || 'Oficina FMO',
        detalles: req.body?.motivo || req.body?.observaciones || (esBaja ? 'Insumo de papelería dado de baja' : 'Actualización de ficha/stock de papelería')
      });
    } catch (errHist) {
      console.warn('Aviso: no se pudo registrar auditoría de papelería:', errHist.message);
    }

    res.json({
      success: true,
      message: 'Insumo de papelería actualizado exitosamente.',
      data: insumoActualizado
    });
  } catch (error) {
    console.error('Error al actualizar papelería:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /api/papeleria/:id - Dar de baja insumo de papelería con trazabilidad (Catálogo maestro: requiere Administrador)
router.delete('/papeleria/:id', requireAdminOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const findRes = await pool.query('SELECT * FROM papeleria WHERE LOWER(id) = LOWER($1)', [id.trim()]);
    if (findRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Insumo con código "${id}" no encontrado en papelería.` });
    }

    const insumo = findRes.rows[0];
    const updateRes = await pool.query(
      `UPDATE papeleria SET estado = 'Baja', disponible = 0, updated_at = NOW() WHERE LOWER(id) = LOWER($1) RETURNING *`,
      [id.trim()]
    );

    const motivoBaja = req.body?.motivo || req.query?.motivo || 'Baja de papelería confirmada';

    await registrarMovimiento(pool, {
      tipo: 'Baja',
      elemento_nombre: insumo.material,
      placa_o_id: insumo.id,
      cantidad: insumo.disponible || 1,
      responsable: req.body?.responsable || insumo.responsable || 'Bodega Central',
      sede: insumo.sede || 'Oficina FMO',
      detalles: motivoBaja
    });

    res.json({
      success: true,
      message: `Insumo ${insumo.id} dado de baja exitosamente`,
      data: updateRes.rows[0]
    });
  } catch (error) {
    console.error('Error al dar de baja papelería:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/papeleria/salida - Descontar stock e integrar con actas/remisiones de entrega (Operativo: Operador o Admin)
router.post('/papeleria/salida', requireOperadorOAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      material_id,
      item_id,
      cantidad = 1,
      responsable,
      person,
      responsable_documento,
      sede = 'Oficina FMO',
      proyecto_motivo,
      motivo = 'Salida de papelería para capacitación / aula',
      remision_id
    } = req.body;

    const finalId = (material_id || item_id || '').trim();
    const finalResponsable = (responsable || person || '').trim();
    const finalCantidad = Math.max(1, parseInt(cantidad, 10) || 1);
    const finalMotivo = (proyecto_motivo || motivo).trim();

    if (!finalId || !finalResponsable) {
      return res.status(400).json({
        success: false,
        message: 'El identificador del insumo (material_id) y el responsable son requeridos.'
      });
    }

    await client.query('BEGIN');

    // 1. Verificar insumo y bloquear fila
    const papeRes = await client.query('SELECT * FROM papeleria WHERE LOWER(id) = LOWER($1) FOR UPDATE', [finalId]);

    if (papeRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: `Insumo con código ${finalId} no encontrado en papelería.` });
    }

    const insumo = papeRes.rows[0];
    const stockActual = parseInt(insumo.disponible, 10) || 0;

    if (stockActual < finalCantidad) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Stock insuficiente para ${insumo.material}. Solicitado: ${finalCantidad}, Disponible: ${stockActual}`
      });
    }

    // 2. Descontar stock de papelería
    const updatedPapeRes = await client.query(
      'UPDATE papeleria SET disponible = disponible - $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [finalCantidad, insumo.id]
    );

    // 3. Registrar en tabla histórica de entregas (entregas_consumibles)
    const entregaRes = await client.query(`
      INSERT INTO entregas_consumibles (
        material_id, material_nombre, cantidad, responsable,
        responsable_documento, sede, proyecto_motivo, tipo, remision_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Consumido Papelería', $8, NOW())
      RETURNING *
    `, [
      insumo.id,
      insumo.material,
      finalCantidad,
      finalResponsable,
      responsable_documento || null,
      sede,
      finalMotivo,
      remision_id || null
    ]);

    // 4. Registrar en historial_movimientos dentro de la transacción atómica
    await registrarMovimiento(client, {
      tipo: 'Entrega',
      elemento_nombre: insumo.material,
      placa_o_id: insumo.id,
      cantidad: finalCantidad,
      responsable: finalResponsable,
      sede: sede || 'Oficina FMO',
      fecha: new Date().toISOString(),
      detalles: finalMotivo
    });

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `Salida de papelería registrada: se descontaron ${finalCantidad} unidad(es) de ${insumo.material}.`,
      data: {
        insumo_actualizado: updatedPapeRes.rows[0],
        entrega_registrada: entregaRes.rows[0]
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al registrar salida de papelería:', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

export default router;
