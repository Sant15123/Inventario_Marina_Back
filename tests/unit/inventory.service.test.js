import { jest } from '@jest/globals';

// Mock del modelo para aislar la capa de persistencia/DB
jest.unstable_mockModule('../../src/models/inventory.model.js', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn()
}));

// Dynamic import después del mockModule en ESM
const inventoryService = await import('../../src/services/inventory.service.js');
const inventoryModel = await import('../../src/models/inventory.model.js');

describe('Unit Tests: Inventory Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockItem = {
    id: 'item-uuid-123',
    nombre: 'Monitor 27"',
    descripcion: 'Monitor LED 4K',
    cantidad: 15,
    precio: 299.99,
    categoria: 'Monitores',
    ubicacion: 'Almacén C',
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z'
  };

  describe('getAllItems', () => {
    it('debe retornar la lista completa de objetos', async () => {
      inventoryModel.findAll.mockReturnValue([mockItem]);

      const result = await inventoryService.getAllItems();

      expect(inventoryModel.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockItem]);
    });
  });

  describe('getItemById', () => {
    it('debe retornar el objeto si existe con el ID especificado', async () => {
      inventoryModel.findById.mockReturnValue(mockItem);

      const result = await inventoryService.getItemById('item-uuid-123');

      expect(inventoryModel.findById).toHaveBeenCalledWith('item-uuid-123');
      expect(result).toEqual(mockItem);
    });

    it('debe lanzar error 404 si el objeto no se encuentra', async () => {
      inventoryModel.findById.mockReturnValue(null);

      await expect(inventoryService.getItemById('inexistente')).rejects.toMatchObject({
        message: 'Objeto no encontrado',
        statusCode: 404
      });
      expect(inventoryModel.findById).toHaveBeenCalledWith('inexistente');
    });
  });

  describe('createItem', () => {
    it('debe crear y retornar un nuevo objeto', async () => {
      const payload = {
        nombre: 'Teclado Mecánico',
        descripcion: 'Switch Red',
        cantidad: 20,
        precio: 59.99,
        categoria: 'Periféricos',
        ubicacion: 'Almacén A'
      };

      const createdObj = { id: 'new-id', ...payload };
      inventoryModel.create.mockReturnValue(createdObj);

      const result = await inventoryService.createItem(payload);

      expect(inventoryModel.create).toHaveBeenCalledWith(payload);
      expect(result).toEqual(createdObj);
    });
  });

  describe('updateItem', () => {
    it('debe actualizar los datos de un objeto existente', async () => {
      const updateData = { precio: 279.99 };
      const updatedMock = { ...mockItem, ...updateData };
      inventoryModel.update.mockReturnValue(updatedMock);

      const result = await inventoryService.updateItem('item-uuid-123', updateData);

      expect(inventoryModel.update).toHaveBeenCalledWith('item-uuid-123', updateData);
      expect(result.precio).toBe(279.99);
    });

    it('debe lanzar error 404 si el objeto a actualizar no existe', async () => {
      inventoryModel.update.mockReturnValue(null);

      await expect(inventoryService.updateItem('no-id', { cantidad: 5 })).rejects.toMatchObject({
        message: 'Objeto no encontrado',
        statusCode: 404
      });
    });
  });

  describe('deleteItem', () => {
    it('debe eliminar exitosamente un objeto existente', async () => {
      inventoryModel.remove.mockReturnValue(true);

      const result = await inventoryService.deleteItem('item-uuid-123');

      expect(inventoryModel.remove).toHaveBeenCalledWith('item-uuid-123');
      expect(result).toBe(true);
    });

    it('debe lanzar error 404 al intentar eliminar un objeto inexistente', async () => {
      inventoryModel.remove.mockReturnValue(false);

      await expect(inventoryService.deleteItem('no-id')).rejects.toMatchObject({
        message: 'Objeto no encontrado',
        statusCode: 404
      });
    });
  });
});
