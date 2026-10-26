import { jest, describe, it, expect, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db.js';

describe('Suite de Pruebas: POST /api/solicitudes (Radicación de Solicitudes)', () => {
  function makeToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url');
    return `${header}.${body}.mock_signature`;
  }

  const validToken = makeToken({
    id: '834a1bc6-60e3-4401-bb6e-fe3e280575e3',
    email: 'santiago.galeano@fmo.org',
    documento: '1064123987',
    nombre_completo: 'Santiago Galeano',
    rol: 'administrador',
    sede: 'Medellín'
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debe registrar exitosamente una solicitud con ítems en solicitudes_inventario e items_solicitud', async () => {
    const payload = {
      sede: 'Medellín',
      tipo_solicitud: 'PRESTAMO_EQUIPO',
      motivo: 'Taller de robótica y sensores para primaria',
      fecha_devolucion_estimada: '2026-11-15',
      items: [
        {
          tipo_item: 'equipo',
          item_id: 'eq-FMO-EQ-001',
          nombre_item: 'Portátil HP ProBook 450 G8',
          cantidad: 2
        },
        {
          tipo_item: 'consumible',
          item_id: 'MAT-001',
          nombre_item: 'Filamento PLA Gris',
          cantidad: 1
        }
      ]
    };

    const res = await request(app)
      .post('/api/solicitudes')
      .set('Authorization', `Bearer ${validToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/Solicitud creada con éxito/i);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.estado).toBe('PENDIENTE');
    expect(res.body.data.tipo_solicitud).toBe('PRESTAMO_EQUIPO');
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0].tipo_item).toBe('ACTIVO');
    expect(res.body.data.items[1].tipo_item).toBe('CONSUMIBLE');
  });

  it('debe registrar solicitud con payload del frontend (tipoSolicitud, justificacion, usuario_id string no uuid)', async () => {
    const payload = {
      usuario_id: '1064123987',
      usuario_nombre: 'Santiago Galeano',
      sede: 'Medellín',
      tipo_solicitud: 'CONSUMIBLES',
      justificacion: 'Prácticas de laboratorio',
      items: [
        {
          tipo: 'consumible',
          item_id: 'MAT-002',
          nombre: 'Filamento Azul',
          cantidad: 3
        }
      ]
    };

    const res = await request(app)
      .post('/api/solicitudes')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.estado).toBe('PENDIENTE');
    expect(res.body.data.tipo_solicitud).toBe('CONSUMIBLES');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].nombre_item).toBe('Filamento Azul');
  });

  it('debe manejar errores en la transacción y devolver status 500 con detalle del error', async () => {
    jest.spyOn(pool, 'connect').mockImplementationOnce(async () => {
      throw new Error('Database connection failed');
    });

    const res = await request(app)
      .post('/api/solicitudes')
      .send({
        motivo: 'Test error'
      });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Error al registrar la solicitud');
    expect(res.body.error).toContain('Database connection failed');
  });
});
