import { pool } from '../db.js';

export const MobiliarioModel = {
  /**
   * Obtiene todos los mobiliarios con filtros opcionales (sede, categoria, search)
   */
  async findAll({ sede, categoria, search } = {}) {
    let query = `
      SELECT 
        id,
        placa,
        nombre,
        categoria,
        sede,
        ubicacion_especifica,
        material,
        color,
        dimensiones,
        estado_conservacion,
        cantidad,
        fecha_adquisicion,
        proveedor_origen,
        observaciones,
        created_at,
        updated_at
      FROM mobiliario
      WHERE 1=1
    `;
    const params = [];

    if (sede && sede !== 'todas' && sede !== 'TODAS') {
      params.push(sede.trim());
      query += ` AND LOWER(sede) = LOWER($${params.length})`;
    }

    if (categoria && categoria !== 'todas' && categoria !== 'TODAS') {
      params.push(categoria.trim());
      query += ` AND LOWER(categoria) = LOWER($${params.length})`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const pIdx = params.length;
      query += ` AND (
        LOWER(placa) LIKE $${pIdx} OR 
        LOWER(nombre) LIKE $${pIdx} OR 
        LOWER(COALESCE(ubicacion_especifica, '')) LIKE $${pIdx} OR 
        LOWER(COALESCE(material, '')) LIKE $${pIdx} OR 
        LOWER(COALESCE(color, '')) LIKE $${pIdx} OR 
        LOWER(COALESCE(observaciones, '')) LIKE $${pIdx}
      )`;
    }

    query += ' ORDER BY created_at DESC, placa DESC';

    const result = await pool.query(query, params);
    return result.rows;
  },

  /**
   * Busca un mobiliario por su ID (UUID)
   */
  async findById(id) {
    const query = `
      SELECT *
      FROM mobiliario
      WHERE id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  },

  /**
   * Busca un mobiliario por su placa
   */
  async findByPlaca(placa) {
    const query = `
      SELECT *
      FROM mobiliario
      WHERE LOWER(placa) = LOWER($1)
    `;
    const result = await pool.query(query, [placa.trim()]);
    return result.rows[0] || null;
  },

  /**
   * Obtiene la siguiente placa sugerida bajo el prefijo MOB-
   */
  async getSiguientePlaca() {
    const query = `
      SELECT placa
      FROM mobiliario
      WHERE placa ILIKE 'MOB-%'
      ORDER BY placa DESC
    `;
    const result = await pool.query(query);

    let maxNum = 0;
    for (const row of result.rows) {
      const match = row.placa.match(/MOB-(\d+)/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }

    const nextNum = maxNum + 1;
    // Formato con relleno de al menos 4 dígitos ej. MOB-0001, MOB-0281
    const padded = String(nextNum).padStart(4, '0');
    return `MOB-${padded}`;
  },

  /**
   * Registra un nuevo mobiliario
   */
  async create(data) {
    const {
      placa,
      nombre,
      categoria,
      sede = 'Medellín',
      ubicacion_especifica = null,
      material = null,
      color = null,
      dimensiones = null,
      estado_conservacion = 'BUENO',
      cantidad = 1,
      fecha_adquisicion = null,
      proveedor_origen = null,
      observaciones = null
    } = data;

    const query = `
      INSERT INTO mobiliario (
        placa,
        nombre,
        categoria,
        sede,
        ubicacion_especifica,
        material,
        color,
        dimensiones,
        estado_conservacion,
        cantidad,
        fecha_adquisicion,
        proveedor_origen,
        observaciones,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::date, CURRENT_DATE), $12, $13, NOW())
      RETURNING *
    `;

    const values = [
      placa.trim(),
      nombre.trim(),
      categoria.trim(),
      sede.trim(),
      ubicacion_especifica ? ubicacion_especifica.trim() : null,
      material ? material.trim() : null,
      color ? color.trim() : null,
      dimensiones ? dimensiones.trim() : null,
      estado_conservacion ? estado_conservacion.trim() : 'BUENO',
      parseInt(cantidad, 10) || 1,
      fecha_adquisicion || null,
      proveedor_origen ? proveedor_origen.trim() : null,
      observaciones ? observaciones.trim() : null
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  },

  /**
   * Actualiza un mobiliario por ID
   */
  async update(id, data) {
    const fields = [];
    const values = [];

    const allowed = [
      'placa',
      'nombre',
      'categoria',
      'sede',
      'ubicacion_especifica',
      'material',
      'color',
      'dimensiones',
      'estado_conservacion',
      'cantidad',
      'fecha_adquisicion',
      'proveedor_origen',
      'observaciones'
    ];

    allowed.forEach((key) => {
      if (data[key] !== undefined) {
        values.push(data[key]);
        fields.push(`${key} = $${values.length}`);
      }
    });

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const query = `
      UPDATE mobiliario
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  },

  /**
   * Elimina un mobiliario por ID
   */
  async delete(id) {
    const query = `
      DELETE FROM mobiliario
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }
};

export default MobiliarioModel;
