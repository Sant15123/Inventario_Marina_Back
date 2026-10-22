import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db.js';

describe('Suite de Pruebas: Proyectos STEAM y Validación Relacional de Custodios', () => {
  let usuarioValidoId = null;
  let usuarioDocumento = null;
  let proyectoCreadoId = null;

  beforeAll(async () => {
    // Obtener un usuario de prueba existente en perfiles
    const userRes = await pool.query('SELECT * FROM perfiles WHERE activo = true LIMIT 1');
    if (userRes.rows.length > 0) {
      usuarioValidoId = userRes.rows[0].id;
      usuarioDocumento = userRes.rows[0].documento;
    }
  });

  afterAll(async () => {
    // Limpieza de datos creados en pruebas
    if (proyectoCreadoId) {
      await pool.query('DELETE FROM proyectos_steam WHERE id = $1', [proyectoCreadoId]);
    }
    await pool.end();
  });

  // 1. PROYECTOS STEAM
  describe('Endpoints /api/proyectos', () => {
    it('GET /api/proyectos - debe listar proyectos activos', async () => {
      const res = await request(app).get('/api/proyectos');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      res.body.data.forEach((p) => {
        expect(p.activo).toBe(true);
        expect(p).toHaveProperty('id');
        expect(p).toHaveProperty('nombre');
      });
    });

    it('POST /api/proyectos - debe rechazar creación si falta el nombre', async () => {
      const res = await request(app).post('/api/proyectos').send({
        sede_municipio: 'Medellín'
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('nombre');
    });

    it('POST /api/proyectos - debe crear un nuevo proyecto STEAM con UUID', async () => {
      const res = await request(app).post('/api/proyectos').send({
        nombre: 'Proyecto Test Innovación STEAM',
        sede_municipio: 'Medellín',
        descripcion: 'Proyecto de prueba para validación de API',
        activo: true
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.nombre).toBe('Proyecto Test Innovación STEAM');
      proyectoCreadoId = res.body.data.id;
    });

    it('PUT /api/proyectos/:id - debe editar un proyecto y cambiar su estado', async () => {
      if (!proyectoCreadoId) return;

      const res = await request(app).put(`/api/proyectos/${proyectoCreadoId}`).send({
        descripcion: 'Descripción actualizada con éxito',
        activo: false
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.activo).toBe(false);
      expect(res.body.data.descripcion).toBe('Descripción actualizada con éxito');
    });
  });

  // 2. VALIDACIÓN RELACIONAL DE CUSTODIOS EN PRÉSTAMOS
  describe('Validación de Custodios en Préstamos', () => {
    it('POST /api/prestamos - debe rechazar préstamo si usuario_id no existe en perfiles', async () => {
      const res = await request(app).post('/api/prestamos').send({
        placa_activo: 'FMO-EQ-001',
        usuario_id: 'a0000000-0000-0000-0000-000000000000',
        fecha_devolucion_esperada: '2026-11-15'
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('no existe');
    });

    it('POST /api/prestamos - debe rechazar préstamo si el documento de custodio no existe', async () => {
      const res = await request(app).post('/api/prestamos').send({
        placa_activo: 'FMO-EQ-001',
        custodio_documento: 'DOC_INEXISTENTE_999999',
        fecha_devolucion_esperada: '2026-11-15'
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('No se encontró');
    });

    it('GET /api/prestamos - debe incluir datos relacionales del usuario en los préstamos', async () => {
      const res = await request(app).get('/api/prestamos');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      if (res.body.data.length > 0) {
        const item = res.body.data[0];
        expect(item).toHaveProperty('placa_activo');
        expect(item).toHaveProperty('usuario_documento');
        expect(item).toHaveProperty('usuario_nombre');
      }
    });
  });
});
