import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db.js';
import { generateToken } from '../../src/middleware/verifyToken.js';

describe('Suite de Pruebas: Separación y Filtrado entre Consumibles Robótica y Papelería', () => {
  const adminToken = generateToken({
    id: '11111111-1111-1111-1111-111111111111',
    documento: '100123456',
    email: 'admin@fmo.org',
    nombre_completo: 'Administrador General',
    rol: 'administrador'
  });

  const testRoboticaId = 'TEST-ROB-991';
  const testPapeleriaId = 'TEST-PAP-992';

  beforeAll(async () => {
    await pool.query('DELETE FROM consumibles WHERE id IN ($1, $2)', [testRoboticaId, testPapeleriaId]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM consumibles WHERE id IN ($1, $2)', [testRoboticaId, testPapeleriaId]);
  });

  it('POST /api/consumibles - debe registrar consumible de robótica con tipo_inventario = robotica por defecto', async () => {
    const res = await request(app)
      .post('/api/consumibles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id: testRoboticaId,
        material: 'Servomotor SG90 9g',
        categoria: 'Robótica',
        disponible: 25,
        minimo: 5
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(testRoboticaId);
    expect(res.body.data.tipo_inventario).toBe('robotica');
  });

  it('POST /api/consumibles - debe clasificar automáticamente a tipo_inventario = papeleria si la categoría es Papelería u Oficina', async () => {
    const res = await request(app)
      .post('/api/consumibles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id: testPapeleriaId,
        material: 'Marcadores Borrables Recargables',
        categoria: 'Papelería y Oficina',
        disponible: 40,
        minimo: 10
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(testPapeleriaId);
    expect(res.body.data.tipo_inventario).toBe('papeleria');
  });

  it('GET /api/consumibles?tipo=ROBOTICA - debe excluir estrictamente ítems de papelería / oficina', async () => {
    const res = await request(app).get('/api/consumibles?tipo=ROBOTICA');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    // Debe contener el de robótica
    expect(res.body.data.some(item => item.id === testRoboticaId)).toBe(true);

    // No debe contener el de papelería ni ningún ítem con categoría o tipo_inventario papeleria
    expect(res.body.data.some(item => item.id === testPapeleriaId)).toBe(false);
    expect(res.body.data.some(item => (item.tipo_inventario || '').toLowerCase() === 'papeleria')).toBe(false);
    expect(res.body.data.some(item => (item.categoria || '').toLowerCase().includes('papeler'))).toBe(false);
    expect(res.body.data.some(item => (item.categoria || '').toLowerCase().includes('oficina'))).toBe(false);
  });

  it('GET /api/consumibles?tipo=PAPELERIA - debe retornar únicamente insumos clasificados como papelería', async () => {
    const res = await request(app).get('/api/consumibles?tipo=PAPELERIA');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    // Debe contener el ítem de papelería
    expect(res.body.data.some(item => item.id === testPapeleriaId)).toBe(true);

    // NO debe contener el de robótica
    expect(res.body.data.some(item => item.id === testRoboticaId)).toBe(false);

    // Todos los devueltos deben ser de papelería u oficina
    for (const item of res.body.data) {
      const matchTipo = (item.tipo_inventario || '').toLowerCase() === 'papeleria';
      const matchCat = (item.categoria || '').toLowerCase().includes('papeler') || (item.categoria || '').toLowerCase().includes('oficina');
      expect(matchTipo || matchCat).toBe(true);
    }
  });

  it('GET /api/consumibles - sin parámetro tipo debe listar todos los registros con count', async () => {
    const res = await request(app).get('/api/consumibles');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBeGreaterThanOrEqual(2);
    expect(res.body.data.some(item => item.id === testRoboticaId)).toBe(true);
    expect(res.body.data.some(item => item.id === testPapeleriaId)).toBe(true);
  });
});
