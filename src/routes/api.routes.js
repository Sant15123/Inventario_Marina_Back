import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

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

// POST /api/activos - Crear un nuevo activo
router.post('/activos', async (req, res, next) => {
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
      fecha_devolucion = null
    } = req.body;

    if (!placa || !nombre) {
      return res.status(400).json({ success: false, message: 'La placa y el nombre son obligatorios.' });
    }

    const result = await pool.query(
      `INSERT INTO activos (placa, nombre, marca, modelo, serial, sede, estado, custodio, fecha_devolucion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        placa.trim(),
        nombre.trim(),
        marca || null,
        modelo || null,
        serial ? serial.trim() : null,
        sede,
        estado,
        custodio,
        fecha_devolucion
      ]
    );

    res.status(201).json({ success: true, message: 'Activo creado exitosamente', data: result.rows[0] });
  } catch (error) {
    console.error('Error al crear activo:', error.message);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Ya existe un activo con esa placa o serial' });
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
      observaciones
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
        sede = COALESCE($25, sede)
      WHERE ${isNumericId ? '(id = $26 OR LOWER(placa) = LOWER($27))' : 'LOWER(placa) = LOWER($26)'}
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
      serial !== undefined ? serial : null,
      caracteristica_1 !== undefined ? caracteristica_1 : null,
      caracteristica_2 !== undefined ? caracteristica_2 : null,
      caracteristica_3 !== undefined ? caracteristica_3 : null,
      responsableFinal,
      proveedor !== undefined ? proveedor : null,
      valor_compra !== undefined && valor_compra !== '' ? parseFloat(valor_compra) : null,
      valor_total !== undefined && valor_total !== '' ? parseFloat(valor_total) : null,
      fecha_compra ? fecha_compra : null,
      fecha_vencimiento_garantia ? fecha_vencimiento_garantia : null,
      claves_otros !== undefined ? claves_otros : null,
      observaciones !== undefined ? observaciones : null,
      estado !== undefined ? estado : null,
      responsableFinal,
      fecha_devolucion ? fecha_devolucion : null,
      ubicacionFinal,
      isNumericId ? parseInt(paramId, 10) : paramId,
      ...(isNumericId ? [paramId] : [])
    ];

    const result = await pool.query(updateQuery, values);

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Activo con identificador "${paramId}" no encontrado.` });
    }

    // 3. Respuesta JSON del endpoint
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Equipo actualizado con éxito'
    });
  } catch (error) {
    console.error('Error al actualizar activo:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

router.put('/activos/:id', handleUpdateActivo);
router.patch('/activos/:id', handleUpdateActivo);
router.put('/activos/:placa', handleUpdateActivo);
router.patch('/activos/:placa', handleUpdateActivo);

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

// POST /api/consumibles - Registrar nuevo consumible / material
router.post('/consumibles', async (req, res, next) => {
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
      fecha_vencimiento_garantia
    } = req.body;

    // Validación básica de requeridos
    if (!id || !material) {
      return res.status(400).json({
        success: false,
        message: 'El código (id) y el nombre del material son obligatorios'
      });
    }

    const query = `
      INSERT INTO consumibles (
        id, material, categoria, disponible, minimo, ubicacion,
        descripcion, caracteristicas, estado, condicion, observaciones,
        valor_compra, fecha_compra, fecha_vencimiento_garantia
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
      fecha_vencimiento_garantia || null
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Consumible registrado con éxito'
    });
  } catch (error) {
    console.error('Error al registrar consumible:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/consumibles/:id - Actualizar datos del consumible
router.put('/consumibles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
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
      fecha_vencimiento_garantia
    } = req.body;

    const query = `
      UPDATE consumibles
      SET 
        material = COALESCE($1, material),
        categoria = COALESCE($2, categoria),
        disponible = COALESCE($3, disponible),
        minimo = COALESCE($4, minimo),
        ubicacion = COALESCE($5, ubicacion),
        descripcion = $6,
        caracteristicas = $7,
        estado = COALESCE($8, estado),
        condicion = COALESCE($9, condicion),
        observaciones = $10,
        valor_compra = $11,
        fecha_compra = $12,
        fecha_vencimiento_garantia = $13
      WHERE id = $14
      RETURNING *;
    `;

    const values = [
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
      id
    ];

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Consumible no encontrado' });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Consumible actualizado con éxito'
    });
  } catch (error) {
    console.error('Error al actualizar consumible:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. PRÉSTAMOS
// ==========================================

// GET /api/prestamos - Lista historial de préstamos
router.get('/prestamos', async (req, res, next) => {
  try {
    const query = `
      SELECT p.*, a.nombre as nombre_activo, a.marca, a.modelo
      FROM prestamos p
      LEFT JOIN activos a ON LOWER(p.placa_activo) = LOWER(a.placa)
      ORDER BY p.id DESC
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('Error al obtener préstamos de DB:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// POST /api/prestamos - Registra préstamo y actualiza activo (transacción)
router.post('/prestamos', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      placa_activo,
      solicitante,
      sede = 'Medellín',
      motivo = '',
      fecha_salida,
      fecha_devolucion_esperada
    } = req.body;

    if (!placa_activo || !solicitante || !fecha_devolucion_esperada) {
      return res.status(400).json({
        success: false,
        message: 'placa_activo, solicitante y fecha_devolucion_esperada son requeridos.'
      });
    }

    await client.query('BEGIN');

    const activoRes = await client.query(
      'SELECT * FROM activos WHERE LOWER(placa) = LOWER($1) FOR UPDATE',
      [placa_activo.trim()]
    );

    if (activoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: `Activo con placa ${placa_activo} no encontrado.` });
    }

    const activoActual = activoRes.rows[0];

    const prestamoRes = await client.query(
      `INSERT INTO prestamos (placa_activo, solicitante, sede, motivo, fecha_salida, fecha_devolucion_esperada, estado)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6, 'Activo')
       RETURNING *`,
      [
        activoActual.placa,
        solicitante.trim(),
        sede,
        motivo,
        fecha_salida || null,
        fecha_devolucion_esperada
      ]
    );

    await client.query(
      `UPDATE activos
       SET estado = 'En campo',
           custodio = $1,
           fecha_devolucion = $2
       WHERE placa = $3`,
      [solicitante.trim(), fecha_devolucion_esperada, activoActual.placa]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Préstamo registrado exitosamente y activo actualizado',
      data: prestamoRes.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear préstamo:', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// PUT /api/prestamos/:id/devolver - Marca préstamo como devuelto y restaura activo
router.put('/prestamos/:id/devolver', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const prestamoRes = await client.query(
      'SELECT * FROM prestamos WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (prestamoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });
    }

    const prestamo = prestamoRes.rows[0];

    const updatedPrestamoRes = await client.query(
      `UPDATE prestamos
       SET estado = 'Devuelto',
           fecha_devolucion_real = CURRENT_DATE
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    await client.query(
      `UPDATE activos
       SET estado = 'Disponible',
           custodio = NULL,
           fecha_devolucion = NULL
       WHERE LOWER(placa) = LOWER($1)`,
      [prestamo.placa_activo]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Préstamo marcado como devuelto y activo disponible nuevamente',
      data: updatedPrestamoRes.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al devolver préstamo:', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

export default router;
