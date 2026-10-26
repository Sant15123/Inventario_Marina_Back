import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db.js';

describe('Suite de Pruebas: Módulo de Mobiliario (/api/mobiliario)', () => {
  let createdId = null;
  const testPlaca = 'MOB-9991';

  beforeAll(async () => {
    // Limpiar registros de prueba si existieran
    await pool.query("DELETE FROM mobiliario WHERE placa IN ('MOB-9991', 'MOB-9992', 'MOB-0280', 'MOB-0281')");
  });

  afterAll(async () => {
    // Limpieza final
    await pool.query("DELETE FROM mobiliario WHERE placa IN ('MOB-9991', 'MOB-9992', 'MOB-0280', 'MOB-0281')");
  });

  it('GET /api/mobiliario/siguiente-placa - debe devolver la siguiente placa correlativa sugerida', async () => {
    // Insertamos MOB-0280 para verificar que sugiera MOB-0281
    await pool.query(`
      INSERT INTO mobiliario (placa, nombre, categoria, sede)
      VALUES ('MOB-0280', 'Silla de Oficina Base', 'Sillas', 'Medellín')
      ON CONFLICT (placa) DO NOTHING
    `);

    const res = await request(app).get('/api/mobiliario/siguiente-placa');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('siguientePlaca');
    expect(res.body.data.siguientePlaca).toMatch(/^MOB-\d{4}$/);
    
    // Al haber 'MOB-0280', el correlativo debe ser al menos MOB-0281
    const match = res.body.data.siguientePlaca.match(/MOB-(\d+)/);
    const num = parseInt(match[1], 10);
    expect(num).toBeGreaterThanOrEqual(281);
  });

  it('POST /api/mobiliario - debe rechazar si faltan campos obligatorios', async () => {
    const res = await request(app).post('/api/mobiliario').send({
      nombre: 'Mesa de Juntas'
      // Faltan placa, categoria, sede
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.missingFields).toContain('placa');
    expect(res.body.missingFields).toContain('categoria');
    expect(res.body.missingFields).toContain('sede');
  });

  it('POST /api/mobiliario - debe crear exitosamente un nuevo mobiliario', async () => {
    const payload = {
      placa: testPlaca,
      nombre: 'Mesa Modular de Trabajo',
      categoria: 'Mesas',
      sede: 'Medellín',
      ubicacion_especifica: 'Piso 2 - Sala Creativa',
      material: 'Madera y Metal',
      color: 'Gris Grafito',
      dimensiones: '180x80x75 cm',
      estado_conservacion: 'EXCELENTE',
      cantidad: 2,
      fecha_adquisicion: '2026-05-10',
      proveedor_origen: 'Muebles & Diseños SAS',
      observaciones: 'Dotación proyecto piloto'
    };

    const res = await request(app).post('/api/mobiliario').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.placa).toBe(testPlaca);
    expect(res.body.data.nombre).toBe('Mesa Modular de Trabajo');
    expect(res.body.data.categoria).toBe('Mesas');
    expect(res.body.data.sede).toBe('Medellín');
    expect(res.body.data.estado_conservacion).toBe('EXCELENTE');
    expect(res.body.data.cantidad).toBe(2);

    createdId = res.body.data.id;
  });

  it('POST /api/mobiliario - debe rechazar si la placa ya existe', async () => {
    const res = await request(app).post('/api/mobiliario').send({
      placa: testPlaca,
      nombre: 'Otra Mesa',
      categoria: 'Mesas',
      sede: 'Medellín'
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/ya existe/i);
  });

  it('GET /api/mobiliario - debe listar mobiliario y soportar filtros (sede, categoria, search)', async () => {
    // 1. Listado general
    const resList = await request(app).get('/api/mobiliario');
    expect(resList.status).toBe(200);
    expect(resList.body.success).toBe(true);
    expect(Array.isArray(resList.body.data)).toBe(true);
    expect(resList.body.count).toBeGreaterThanOrEqual(1);

    // 2. Filtro por búsqueda
    const resSearch = await request(app).get('/api/mobiliario?search=Modular');
    expect(resSearch.status).toBe(200);
    expect(resSearch.body.data.length).toBeGreaterThanOrEqual(1);
    expect(resSearch.body.data.some(m => m.placa === testPlaca)).toBe(true);

    // 3. Filtro por categoría y sede
    const resFilter = await request(app).get('/api/mobiliario?sede=Medellín&categoria=Mesas');
    expect(resFilter.status).toBe(200);
    expect(resFilter.body.data.some(m => m.placa === testPlaca)).toBe(true);
  });

  it('PUT /api/mobiliario/:id - debe actualizar detalles y estado de conservación', async () => {
    const res = await request(app)
      .put(`/api/mobiliario/${createdId}`)
      .send({
        estado_conservacion: 'REGULAR',
        observaciones: 'Presenta rayones en la superficie',
        ubicacion_especifica: 'Piso 1 - Bodega Central'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdId);
    expect(res.body.data.estado_conservacion).toBe('REGULAR');
    expect(res.body.data.observaciones).toBe('Presenta rayones en la superficie');
    expect(res.body.data.ubicacion_especifica).toBe('Piso 1 - Bodega Central');
  });

  it('PUT /api/mobiliario/:id - debe retornar 404 si el ID no existe', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .put(`/api/mobiliario/${nonExistentId}`)
      .send({
        nombre: 'Nuevo nombre'
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('DELETE /api/mobiliario/:id - debe eliminar el registro por ID', async () => {
    const res = await request(app).delete(`/api/mobiliario/${createdId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/eliminado exitosamente/i);

    // Comprobar que ya no aparece
    const verify = await pool.query('SELECT * FROM mobiliario WHERE id = $1', [createdId]);
    expect(verify.rows.length).toBe(0);
  });

  it('DELETE /api/mobiliario/:id - debe retornar 404 si ya no existe', async () => {
    const res = await request(app).delete(`/api/mobiliario/${createdId}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
