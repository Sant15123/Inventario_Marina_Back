import { jest } from '@jest/globals';
import request from 'supertest';

// Mock del servicio para aislar la capa HTTP / Controladores / Middleware de la persistencia
jest.unstable_mockModule('../../src/services/inventory.service.js', () => ({
  getAllItems: jest.fn(),
  getItemById: jest.fn(),
  createItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn()
}));

// Imports dinámicos para resolver después de jest.unstable_mockModule
const { default: app } = await import('../../src/app.js');
const inventoryService = await import('../../src/services/inventory.service.js');

describe('Integration Tests: /api/inventory Routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockItem = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    nombre: 'Impresora Láser HP',
    descripcion: 'Impresora monocromática de alta velocidad',
    cantidad: 8,
    precio: 150.00,
    categoria: 'Impresión',
    ubicacion: 'Oficina Central'
  };

  describe('GET /api/inventory', () => {
    it('debe responder 200 y la lista de objetos de inventario', async () => {
      inventoryService.getAllItems.mockResolvedValue([mockItem]);

      const res = await request(app).get('/api/inventory');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].nombre).toBe('Impresora Láser HP');
    });
  });

  describe('GET /api/inventory/:id', () => {
    it('debe responder 200 y el objeto cuando el ID existe', async () => {
      inventoryService.getItemById.mockResolvedValue(mockItem);

      const res = await request(app).get(`/api/inventory/${mockItem.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(mockItem.id);
    });

    it('debe responder 404 si el objeto no existe', async () => {
      const err = new Error('Objeto no encontrado');
      err.statusCode = 404;
      inventoryService.getItemById.mockRejectedValue(err);

      const res = await request(app).get('/api/inventory/id-no-existente');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Objeto no encontrado');
    });
  });

  describe('POST /api/inventory', () => {
    const validBody = {
      nombre: 'Mouse Inalámbrico Logitech',
      descripcion: 'Mouse óptico ergonómico',
      cantidad: 25,
      precio: 29.99,
      categoria: 'Accesorios',
      ubicacion: 'Bodega 1'
    };

    it('debe responder 201 y el objeto creado cuando el payload es válido', async () => {
      inventoryService.createItem.mockResolvedValue({ id: 'nuevo-id-123', ...validBody });

      const res = await request(app)
        .post('/api/inventory')
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Objeto creado exitosamente');
      expect(res.body.data).toHaveProperty('id', 'nuevo-id-123');
      expect(inventoryService.createItem).toHaveBeenCalled();
    });

    it('debe responder 400 con detalle de validación si faltan campos obligatorios', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .send({
          nombre: 'A' // Menos de 2 caracteres y faltan campos obligatorios
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Error de validación');
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('PUT /api/inventory/:id', () => {
    it('debe responder 200 y el objeto actualizado si los datos son válidos', async () => {
      const updateData = { precio: 199.99, cantidad: 12 };
      inventoryService.updateItem.mockResolvedValue({ ...mockItem, ...updateData });

      const res = await request(app)
        .put(`/api/inventory/${mockItem.id}`)
        .send(updateData);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Objeto actualizado exitosamente');
      expect(res.body.data.precio).toBe(199.99);
    });

    it('debe responder 400 si el body enviado está vacío', async () => {
      const res = await request(app)
        .put(`/api/inventory/${mockItem.id}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Error de validación');
    });

    it('debe responder 404 si el servicio indica que el objeto no existe', async () => {
      const err = new Error('Objeto no encontrado');
      err.statusCode = 404;
      inventoryService.updateItem.mockRejectedValue(err);

      const res = await request(app)
        .put('/api/inventory/id-no-existente')
        .send({ precio: 50.00 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Objeto no encontrado');
    });
  });

  describe('DELETE /api/inventory/:id', () => {
    it('debe responder 200 y mensaje de éxito al eliminar un objeto existente', async () => {
      inventoryService.deleteItem.mockResolvedValue(true);

      const res = await request(app).delete(`/api/inventory/${mockItem.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Objeto eliminado exitosamente');
    });

    it('debe responder 404 si el objeto a eliminar no existe', async () => {
      const err = new Error('Objeto no encontrado');
      err.statusCode = 404;
      inventoryService.deleteItem.mockRejectedValue(err);

      const res = await request(app).delete('/api/inventory/id-no-existente');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Objeto no encontrado');
    });
  });
});
