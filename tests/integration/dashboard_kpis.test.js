import { jest, describe, it, expect, afterEach, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db.js';
import { supabase } from '../../src/config/supabase.js';

describe('Suite de Pruebas: GET /api/dashboard/kpis', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });


  it('debe responder con 200 y la estructura estándar de KPIs al consultar /api/dashboard/kpis', async () => {
    const res = await request(app).get('/api/dashboard/kpis');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('totalMateriales');
    expect(res.body.data).toHaveProperty('criticosStock');
    expect(res.body.data).toHaveProperty('prestamosActivos');
    expect(res.body.data).toHaveProperty('prestamosVencidos');

    expect(typeof res.body.data.totalMateriales).toBe('number');
    expect(typeof res.body.data.criticosStock).toBe('number');
    expect(typeof res.body.data.prestamosActivos).toBe('number');
    expect(typeof res.body.data.prestamosVencidos).toBe('number');
    expect(res.body.data.prestamosActivos).toBeGreaterThanOrEqual(0);
    expect(res.body.data.prestamosVencidos).toBeGreaterThanOrEqual(0);
  });

  it('debe responder también exitosamente en la raíz del recurso /api/dashboard', async () => {
    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totalMateriales');
  });

  it('debe permitir filtrar métricas por sede mediante query parameter ?sede=Medellín', async () => {
    const res = await request(app).get('/api/dashboard/kpis?sede=Medellín');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.totalMateriales).toBe('number');
  });

  it('debe procesar correctamente los datos provenientes de la función RPC de Supabase', async () => {
    jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        totalMateriales: 185,
        criticosStock: 62,
        prestamosActivos: 21,
        prestamosVencidos: 0
      },
      error: null
    });

    const res = await request(app).get('/api/dashboard/kpis');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalMateriales).toBe(185);
    expect(res.body.data.criticosStock).toBe(62);
    expect(res.body.data.prestamosActivos).toBe(21);
    expect(res.body.data.prestamosVencidos).toBe(0);
  });

  it('debe activar el fallback por consultas agregadas de PostgreSQL si la RPC de Supabase falla', async () => {
    jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: { message: 'function obtener_kpis_dashboard() does not exist' }
    });

    const res = await request(app).get('/api/dashboard/kpis');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.totalMateriales).toBe('number');
    expect(typeof res.body.data.criticosStock).toBe('number');
  });
});
