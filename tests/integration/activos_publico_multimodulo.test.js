import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db.js';

describe('Suite de Pruebas: Endpoint de Consulta Pública para Códigos QR Multimódulo', () => {
  afterAll(async () => {
    // Cerrar conexiones abiertas si aplica
  });

  it('GET /api/activos/publico/:id - debe encontrar activo tecnológico (TECNOLOGIA)', async () => {
    // Buscar una placa real de activos
    const actRes = await pool.query('SELECT placa FROM activos LIMIT 1');
    expect(actRes.rows.length).toBeGreaterThan(0);
    const testPlaca = actRes.rows[0].placa;

    const res = await request(app).get(`/api/activos/publico/${testPlaca}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tipo).toBe('TECNOLOGIA');
    expect(res.body.item).toBeDefined();
    expect(res.body.item.placa).toBe(testPlaca);
  });

  it('GET /api/activos/publico/:id - debe encontrar mobiliario por placa (MOBILIARIO)', async () => {
    const mobRes = await pool.query('SELECT placa, id FROM mobiliario LIMIT 1');
    expect(mobRes.rows.length).toBeGreaterThan(0);
    const { placa, id } = mobRes.rows[0];

    const resPlaca = await request(app).get(`/api/activos/publico/${placa}`);
    expect(resPlaca.status).toBe(200);
    expect(resPlaca.body.success).toBe(true);
    expect(resPlaca.body.tipo).toBe('MOBILIARIO');
    expect(resPlaca.body.item.placa).toBe(placa);

    // También por UUID
    const resId = await request(app).get(`/api/activos/publico/${id}`);
    expect(resId.status).toBe(200);
    expect(resId.body.success).toBe(true);
    expect(resId.body.tipo).toBe('MOBILIARIO');
    expect(resId.body.item.id).toBe(id);
  });

  it('GET /api/activos/publico/:id - debe encontrar papelería por código o id (PAPELERIA)', async () => {
    const papRes = await pool.query('SELECT id FROM papeleria LIMIT 1');
    expect(papRes.rows.length).toBeGreaterThan(0);
    const testId = papRes.rows[0].id;

    const res = await request(app).get(`/api/activos/publico/${testId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tipo).toBe('PAPELERIA');
    expect(res.body.item.id).toBe(testId);
  });

  it('GET /api/activos/publico/:id - debe encontrar consumible/robótica por código o id (ROBOTICA)', async () => {
    const conRes = await pool.query('SELECT id FROM consumibles LIMIT 1');
    expect(conRes.rows.length).toBeGreaterThan(0);
    const testId = conRes.rows[0].id;

    const res = await request(app).get(`/api/activos/publico/${testId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tipo).toBe('ROBOTICA');
    expect(res.body.item.id).toBe(testId);
  });

  it('GET /api/activos/publico/:id - debe responder 404 si el elemento no existe', async () => {
    const res = await request(app).get('/api/activos/publico/INVENTADO-NO-EXISTE-99999');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Elemento no encontrado en el inventario institucional');
  });

  it('GET /api/activos/:id - debe soportar la misma búsqueda multimódulo para compatibilidad', async () => {
    const mobRes = await pool.query('SELECT placa FROM mobiliario LIMIT 1');
    const { placa } = mobRes.rows[0];

    const res = await request(app).get(`/api/activos/${placa}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tipo).toBe('MOBILIARIO');
    expect(res.body.item.placa).toBe(placa);
  });
});
