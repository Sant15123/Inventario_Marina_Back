import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { inventorySchema, inventoryUpdateSchema } from '../validators/inventory.validator.js';
import * as inventoryController from '../controllers/inventory.controller.js';

const router = Router();

router.get('/', inventoryController.getAllItems);
router.get('/:id', inventoryController.getItemById);
router.post('/', validate(inventorySchema), inventoryController.createItem);
router.put('/:id', validate(inventoryUpdateSchema), inventoryController.updateItem);
router.delete('/:id', inventoryController.deleteItem);

export default router;