import * as inventoryService from '../services/inventory.service.js';

export const getAllItems = async (req, res, next) => {
  try {
    const items = await inventoryService.getAllItems();
    res.json({
      success: true,
      data: items,
      count: items.length
    });
  } catch (error) {
    next(error);
  }
};

export const getItemById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await inventoryService.getItemById(id);
    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    next(error);
  }
};

export const createItem = async (req, res, next) => {
  try {
    const item = await inventoryService.createItem(req.body);
    res.status(201).json({
      success: true,
      message: 'Objeto creado exitosamente',
      data: item
    });
  } catch (error) {
    next(error);
  }
};

export const updateItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await inventoryService.updateItem(id, req.body);
    res.json({
      success: true,
      message: 'Objeto actualizado exitosamente',
      data: item
    });
  } catch (error) {
    next(error);
  }
};

export const deleteItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    await inventoryService.deleteItem(id);
    res.json({
      success: true,
      message: 'Objeto eliminado exitosamente'
    });
  } catch (error) {
    next(error);
  }
};