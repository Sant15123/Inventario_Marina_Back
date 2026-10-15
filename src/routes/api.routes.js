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
      fecha_devolucion = null,
      ubicacion_estante = null
    } = req.body;

    if (!placa || !nombre) {
      return res.status(400).json({ success: false, message: 'La placa y el nombre son obligatorios.' });
    }

    const result = await pool.query(
      `INSERT INTO activos (placa, nombre, marca, modelo, serial, sede, estado, custodio, fecha_devolucion, ubicacion_estante)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        fecha_devolucion,
        ubicacion_estante || null
      ]
    );

    res.status(201).json({ success: true, message: 'Activo creado exitosamente', data: result.rows[0] });
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
      ubicacion_estante
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
        ubicacion_estante = COALESCE($26, ubicacion_estante)
      WHERE ${isNumericId ? '(id = $27 OR LOWER(placa) = LOWER($28))' : 'LOWER(placa) = LOWER($27)'}
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
      ubicacion_estante !== undefined ? ubicacion_estante : null,
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
      fecha_vencimiento_garantia,
      ubicacion_estante
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
        valor_compra, fecha_compra, fecha_vencimiento_garantia, ubicacion_estante
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
      ubicacion_estante || null
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
      fecha_vencimiento_garantia,
      ubicacion_estante
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
        fecha_vencimiento_garantia = $13,
        ubicacion_estante = COALESCE($14, ubicacion_estante)
      WHERE id = $15
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
      ubicacion_estante !== undefined ? ubicacion_estante : null,
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
// ==========================================
// 2.1 ENTREGAS / SALIDAS DE CONSUMIBLES
// ==========================================

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

// POST /api/consumibles/entregas - Registrar salida definitiva de consumibles con descuento de stock
router.post('/consumibles/entregas', async (req, res) => {
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

// GET /api/prestamos - Lista historial de préstamos (activos y consumibles)
router.get('/prestamos', async (req, res, next) => {
  try {
    const query = `
      SELECT 
        p.*,
        COALESCE(a.nombre, c.material, p.placa_activo) as nombre_activo,
        a.marca,
        a.modelo,
        c.categoria as categoria_consumible
      FROM prestamos p
      LEFT JOIN activos a ON LOWER(p.placa_activo) = LOWER(a.placa)
      LEFT JOIN consumibles c ON LOWER(p.placa_activo) = LOWER(c.id)
      ORDER BY p.id DESC
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('Error al obtener préstamos de DB:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// POST /api/prestamos - Registra préstamo (activo o consumible) y actualiza stock/estado (transacción)
router.post('/prestamos', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      placa_activo,
      item_id,
      tipo_item,
      cantidad = 1,
      solicitante,
      responsable,
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

    if (!finalItemId || !finalSolicitante || !finalFechaDevolucion) {
      return res.status(400).json({
        success: false,
        message: 'El identificador del ítem (item_id o placa_activo), solicitante y fecha_devolucion_esperada son requeridos.'
      });
    }

    await client.query('BEGIN');

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

      // 3. Insertar préstamo con tipo_item = consumible y cantidad
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
            estado
          )
          VALUES ($1, 'consumible', $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, 'Activo')
          RETURNING *`,
        [
          consumibleActual.id,
          finalCantidad,
          finalSolicitante,
          sede,
          motivo,
          fecha_salida || null,
          finalFechaDevolucion
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
            estado
          )
          VALUES ($1, 'activo', 1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6, 'Activo')
          RETURNING *`,
        [
          activoActual.placa,
          finalSolicitante,
          sede,
          motivo,
          fecha_salida || null,
          finalFechaDevolucion
        ]
      );

      await client.query(
        `UPDATE activos
          SET estado = 'En campo',
              custodio = $1,
              fecha_devolucion = $2
          WHERE placa = $3`,
        [finalSolicitante, finalFechaDevolucion, activoActual.placa]
      );

      prestamoInsertado = prestamoRes.rows[0];
      prestamoInsertado.nombre_activo = activoActual.nombre;
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Préstamo registrado exitosamente y stock/activo actualizado',
      data: prestamoInsertado
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear préstamo en DB:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// PUT /api/prestamos/:id/devolver - Marca préstamo como devuelto y restaura activo o stock de consumible
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

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Préstamo marcado como devuelto y existencias/activo restablecido',
      data: updatedPrestamoRes.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al devolver préstamo:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

export default router;
