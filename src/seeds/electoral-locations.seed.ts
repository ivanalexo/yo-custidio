/* eslint-disable prettier/prettier */
import { Db } from 'mongodb';
import { generateObjectId } from './utils';

export async function seedElectoralLocations(db: Db): Promise<void> {
  const collection = db.collection('electorallocations');

  // Primero, limpiar la colección existente
  await collection.deleteMany({});

  // Datos de recintos electorales
  const locations = [
    {
      code: 'LP001',
      name: 'Unidad Educativa Bolivia',
      department: 'La Paz',
      province: 'Murillo',
      municipality: 'La Paz',
      address: 'Av. 16 de Julio #1234',
      totalTables: 15,
      coordinates: { latitude: -16.495, longitude: -68.132 },
      createdBy: generateObjectId(),
      active: true,
    },
    {
      code: 'LP002',
      name: 'Colegio Simón Bolívar',
      department: 'La Paz',
      province: 'Murillo',
      municipality: 'La Paz',
      address: 'Calle Comercio #567',
      totalTables: 12,
      coordinates: { latitude: -16.489, longitude: -68.135 },
      createdBy: generateObjectId(),
      active: true,
    },
    {
      code: 'CBBA001',
      name: 'Universidad Mayor de San Simón',
      department: 'Cochabamba',
      province: 'Cercado',
      municipality: 'Cochabamba',
      address: 'Av. Ballivián #123',
      totalTables: 20,
      coordinates: { latitude: -17.393, longitude: -66.158 },
      createdBy: generateObjectId(),
      active: true,
    },
    {
      code: 'CBBA002',
      name: 'Escuela Guido Villagómez',
      department: 'Cochabamba',
      province: 'Cercado',
      municipality: 'Cochabamba',
      address: 'Calle Sucre #890',
      totalTables: 8,
      coordinates: { latitude: -17.388, longitude: -66.154 },
      createdBy: generateObjectId(),
      active: true,
    },
    {
      code: 'SC001',
      name: 'Colegio Nacional Florida',
      department: 'Santa Cruz',
      province: 'Andrés Ibáñez',
      municipality: 'Santa Cruz de la Sierra',
      address: 'Av. Irala #432',
      totalTables: 25,
      coordinates: { latitude: -17.783, longitude: -63.182 },
      createdBy: generateObjectId(),
      active: true,
    },
    {
      code: 'SC002',
      name: 'Universidad Autónoma Gabriel René Moreno',
      department: 'Santa Cruz',
      province: 'Andrés Ibáñez',
      municipality: 'Santa Cruz de la Sierra',
      address: 'Av. Busch #543',
      totalTables: 30,
      coordinates: { latitude: -17.773, longitude: -63.195 },
      createdBy: generateObjectId(),
      active: true,
    },
    {
      code: 'PT001',
      name: 'Escuela Tacopalca',
      department: 'Potosí',
      province: 'Bustillo',
      municipality: 'Chaquihuta Ayllu Jucumani',
      address: 'Localidad Tacopalca',
      totalTables: 5,
      coordinates: { latitude: -18.456, longitude: -66.789 },
      createdBy: generateObjectId(),
      active: true,
    },
    {
      code: 'PT002',
      name: 'Unidad Educativa Potosí',
      department: 'Potosí',
      province: 'Tomás Frías',
      municipality: 'Potosí',
      address: 'Calle Sucre #345',
      totalTables: 10,
      coordinates: { latitude: -19.578, longitude: -65.754 },
      createdBy: generateObjectId(),
      active: true,
    },
    {
      code: 'OR001',
      name: 'Colegio Pantaleón Dalence',
      department: 'Oruro',
      province: 'Cercado',
      municipality: 'Oruro',
      address: 'Av. 6 de Octubre #678',
      totalTables: 15,
      coordinates: { latitude: -17.967, longitude: -67.109 },
      createdBy: generateObjectId(),
      active: true,
    },
    {
      code: 'TJ001',
      name: 'Universidad Juan Misael Saracho',
      department: 'Tarija',
      province: 'Cercado',
      municipality: 'Tarija',
      address: 'Calle Campero #987',
      totalTables: 12,
      coordinates: { latitude: -21.535, longitude: -64.729 },
      createdBy: generateObjectId(),
      active: true,
    },
  ];

  // Insertar recintos
  await collection.insertMany(locations);

  console.log(`Se han creado ${locations.length} recintos electorales`);
}
