import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'inventory.json');

const ensureDataFile = () => {
  const dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = [
      {
        id: uuidv4(),
        nombre: 'Laptop HP Pavilion',
        descripcion: 'Laptop para oficina',
        cantidad: 10,
        precio: 899.99,
        categoria: 'Electrónica',
        ubicacion: 'Almacén A',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        nombre: 'Mouse Inalámbrico',
        descripcion: 'Mouse ergonómico',
        cantidad: 50,
        precio: 25.50,
        categoria: 'Accesorios',
        ubicacion: 'Almacén B',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
};

const readData = () => {
  ensureDataFile();
  const data = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(data);
};

const writeData = (data) => {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

export const findAll = () => {
  return readData();
};

export const findById = (id) => {
  const inventory = readData();
  return inventory.find(item => item.id === id);
};

export const create = (itemData) => {
  const inventory = readData();
  const newItem = {
    id: uuidv4(),
    ...itemData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  inventory.push(newItem);
  writeData(inventory);
  return newItem;
};

export const update = (id, updateData) => {
  const inventory = readData();
  const index = inventory.findIndex(item => item.id === id);
  if (index === -1) return null;
  
  inventory[index] = {
    ...inventory[index],
    ...updateData,
    updatedAt: new Date().toISOString()
  };
  writeData(inventory);
  return inventory[index];
};

export const remove = (id) => {
  const inventory = readData();
  const index = inventory.findIndex(item => item.id === id);
  if (index === -1) return false;
  
  inventory.splice(index, 1);
  writeData(inventory);
  return true;
};