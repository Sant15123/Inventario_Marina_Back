import request from 'supertest';
import app from '../src/app.js';

describe('Smoke Test & Healthcheck Suite', () => {
  it('debe ejecutar Jest correctamente (prueba básica de sanidad)', () => {
    expect(true).toBe(true);
    expect(1 + 1).toBe(2);
  });

  it('GET /health - debe responder con status 200 y status OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'OK');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /ruta-inexistente - debe manejar 404 correctamente', async () => {
    const res = await request(app).get('/api/ruta-que-no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.message).toContain('Ruta no encontrada');
  });
});
