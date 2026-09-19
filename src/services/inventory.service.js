import * as inventoryModel from '../models/inventory.model.js';

export const getAllItems = async () => {
  return await inventoryModel.findAll();
};

export const getItemById = async (id) => {
  const item = await inventoryModel.findById(id);
  if (!item) {
    const error = new Error('Objeto no encontrado');
    error.statusCode = 404;
    throw error;
  }
  return item;
};

export const createItem = async (itemData) => {
  return await inventoryModel.create(itemData);
};

export const updateItem = async (id, updateData) => {
  const item = await inventoryModel.update(id, updateData);
  if (!item) {
    const error = new Error('Objeto no encontrado');
    error.statusCode = 404;
    throw error;
  }
  return item;
};

export const deleteItem = async (id) => {
  const deleted = await inventoryModel.remove(id);
  if (!deleted) {
    const error = new Error('Objeto no encontrado');
    error.statusCode = 404;
    throw error;
  }
  return true;
};