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

// GET /api/consumibles/remisiones - Listar actas/remisiones de entregas de consumibles
router.get('/consumibles/remisiones', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM remisiones_consumibles ORDER BY created_at DESC'
    );
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('Error al listar remisiones de consumibles:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
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

// GET /api/usuarios - Listar usuarios con filtros por rol y búsqueda
router.get('/usuarios', async (req, res) => {
  try {
    const { rol, search, sede, activo } = req.query;

    let query = 'SELECT id, documento, nombre_completo, telefono, email, rol, activo, sede, created_at, updated_at FROM perfiles WHERE 1=1';
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
    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('Error al listar usuarios:', error.message);
    res.status(500).json({ success: false, data: [], error: error.message });
  }
});

// GET /api/usuarios/:id - Obtener detalle de usuario por UUID o documento
router.get('/usuarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const query = isUuid
      ? 'SELECT * FROM perfiles WHERE id = $1'
      : 'SELECT * FROM perfiles WHERE LOWER(documento) = LOWER($1) OR LOWER(email) = LOWER($1)';

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener usuario:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/usuarios - Registro de nuevo usuario
router.post('/usuarios', async (req, res) => {
  try {
    const {
      documento,
      nombre_completo,
      telefono,
      email,
      rol = 'usuario',
      sede = 'Medellín',
      activo = true
    } = req.body;

    if (!documento || !nombre_completo || !email) {
      return res.status(400).json({
        success: false,
        message: 'Documento, nombre_completo y email son campos obligatorios.'
      });
    }

    const rolesValidos = ['administrador', 'operador', 'supervisor', 'usuario'];
    const finalRol = (rol || 'usuario').toLowerCase();
    if (!rolesValidos.includes(finalRol)) {
      return res.status(400).json({
        success: false,
        message: `Rol inválido. Roles permitidos: ${rolesValidos.join(', ')}`
      });
    }

    const query = `
      INSERT INTO perfiles (documento, nombre_completo, telefono, email, rol, sede, activo)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      documento.trim(),
      nombre_completo.trim(),
      telefono ? telefono.trim() : null,
      email.trim().toLowerCase(),
      finalRol,
      sede || 'Medellín',
      activo
    ]);

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al crear usuario:', error.message);
    if (error.code === '23505') {
      const detail = (error.detail || '').toLowerCase();
      if (detail.includes('documento')) {
        return res.status(409).json({ success: false, message: 'Ya existe un usuario con este documento de identidad.' });
      }
      if (detail.includes('email')) {
        return res.status(409).json({ success: false, message: 'Ya existe un usuario con este correo electrónico.' });
      }
      return res.status(409).json({ success: false, message: 'El usuario ya se encuentra registrado (documento o email duplicado).' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/usuarios/:id - Actualización de datos personales y reasignación de rol
router.put('/usuarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      documento,
      nombre_completo,
      telefono,
      email,
      rol,
      sede,
      activo
    } = req.body;

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
        activo = COALESCE($7, activo),
        updated_at = NOW()
      WHERE ${isUuid ? 'id = $8' : '(LOWER(documento) = LOWER($8) OR id::text = $8)'}
      RETURNING *;
    `;

    const values = [
      documento !== undefined ? documento.trim() : null,
      nombre_completo !== undefined ? nombre_completo.trim() : null,
      telefono !== undefined ? telefono.trim() : null,
      email !== undefined ? email.trim().toLowerCase() : null,
      rol !== undefined ? rol.toLowerCase() : null,
      sede !== undefined ? sede : null,
      activo !== undefined ? activo : null,
      id
    ];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado para actualizar.' });
    }

    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: result.rows[0]
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

// POST /api/papeleria - Creación de nuevo insumo de papelería
router.post('/papeleria', async (req, res) => {
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

    res.status(201).json({
      success: true,
      message: 'Insumo de papelería registrado exitosamente.',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al registrar papelería:', error.message);
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Ya existe un insumo de papelería con este código (id).' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/papeleria/:id - Actualización de ficha técnica, cantidades y ubicación física
router.put('/api/papeleria/:id', async (req, res) => {
  // Manejador delegando al handler principal
  return handleUpdatePapeleria(req, res);
});

router.put('/papeleria/:id', async (req, res) => {
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

    res.json({
      success: true,
      message: 'Insumo de papelería actualizado exitosamente.',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar papelería:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/papeleria/salida - Descontar stock e integrar con actas/remisiones de entrega
router.post('/papeleria/salida', async (req, res) => {
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
