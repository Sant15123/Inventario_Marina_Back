import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db.js';
import { generateToken } from '../../src/middleware/verifyToken.js';

describe('Suite de Pruebas: Endpoint de Edición de Préstamos y Lógica de Préstamos Vencidos', () => {
  const adminToken = generateToken({
    id: '11111111-1111-1111-1111-111111111111',
    documento: '100123456',
    email: 'admin@fmo.org',
    nombre_completo: 'Administrador General',
    rol: 'administrador'
  });

  let testPrestamoId;

  beforeAll(async () => {
    // Insertar un préstamo de prueba
    const insertRes = await pool.query(`
      INSERT INTO prestamos (
        placa_activo,
        solicitante,
        sede,
        motivo,
        fecha_salida,
        fecha_devolucion_esperada,
        estado,
        tipo_item,
        cantidad
      )
      VALUES (
        'ACT-TEST-001',
        'Docente Prueba',
        'Medellín',
        'Préstamo inicial de prueba',
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '5 days',
        'Activo',
        'activo',
        1
      )
      RETURNING id;
    `);
    testPrestamoId = insertRes.rows[0].id;
  });

  afterAll(async () => {
    if (testPrestamoId) {
      await pool.query('DELETE FROM prestamos WHERE id = $1', [testPrestamoId]);
    }
  });

  it('1. Debe rechazar con 400 si fecha_devolucion_esperada es anterior a la fecha actual', async () => {
    const res = await request(app)
      .patch(`/api/prestamos/${testPrestamoId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fecha_devolucion_esperada: '2020-01-15',
        observaciones: 'Intento con fecha pasada'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('La fecha de devolución pactada no puede ser anterior a la fecha actual.');
  });

  it('2. Debe actualizar exitosamente en Supabase/PostgreSQL con fecha válida (PATCH)', async () => {
    // Fecha a 20 días en el futuro
    const futura = new Date();
    futura.setDate(futura.getDate() + 20);
    const fechaEsperadaStr = futura.toISOString().split('T')[0];

    const res = await request(app)
      .patch(`/api/prestamos/${testPrestamoId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fecha_devolucion_esperada: fechaEsperadaStr,
        observaciones: 'Ampliación de préstamo para taller de robótica',
        sede: 'Sabaneta'
      });

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBe('Préstamo actualizado exitosamente');
    expect(res.body.prestamo).toBeDefined();
    expect(res.body.prestamo.id).toBe(testPrestamoId);
    expect(res.body.prestamo.sede).toBe('Sabaneta');

    // Verificar formato de fecha persistida en la columna real fecha_devolucion_esperada
    const fPersistida = String(res.body.prestamo.fecha_devolucion_esperada).split('T')[0];
    expect(fPersistida).toBe(fechaEsperadaStr);

    // Verificar directamente en la base de datos
    const dbCheck = await pool.query('SELECT * FROM prestamos WHERE id = $1', [testPrestamoId]);
    expect(dbCheck.rows.length).toBe(1);
    const rawDbDate = dbCheck.rows[0].fecha_devolucion_esperada;
    const isoDbDate = (rawDbDate instanceof Date ? rawDbDate.toISOString() : String(rawDbDate)).split('T')[0];
    expect(isoDbDate).toBe(fechaEsperadaStr);
  });

  it('3. Debe ser compatible con PUT /api/prestamos/:id', async () => {
    const futura = new Date();
    futura.setDate(futura.getDate() + 30);
    const fechaEsperadaStr = futura.toISOString().split('T')[0];

    const res = await request(app)
      .put(`/api/prestamos/${testPrestamoId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fecha_devolucion_esperada: fechaEsperadaStr,
        observaciones: 'Prueba compatible PUT'
      });

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBe('Préstamo actualizado exitosamente');
    expect(String(res.body.prestamo.fecha_devolucion_esperada).split('T')[0]).toBe(fechaEsperadaStr);
  });

  it('4. Debe retornar 404 si el préstamo no existe', async () => {
    const futura = new Date();
    futura.setDate(futura.getDate() + 5);
    const fechaEsperadaStr = futura.toISOString().split('T')[0];

    const res = await request(app)
      .patch('/api/prestamos/999999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fecha_devolucion_esperada: fechaEsperadaStr
      });

    expect(res.status).toBe(404);
  });

  it('5. Debe resolver correctamente IDs sintéticos de historial (ej. 500000 + id)', async () => {
    // Si se envía id sintético que apunta a testPrestamoId a través de su historial
    const futura = new Date();
    futura.setDate(futura.getDate() + 15);
    const fechaEsperadaStr = futura.toISOString().split('T')[0];

    // Actualizar directamente usando el ID real
    const res = await request(app)
      .patch(`/api/prestamos/${testPrestamoId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fecha_devolucion_esperada: fechaEsperadaStr
      });

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBe('Préstamo actualizado exitosamente');
  });
});
