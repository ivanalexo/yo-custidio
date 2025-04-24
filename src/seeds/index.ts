/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { Logger } from '@nestjs/common';

// Importar funciones de semilla
import { seedPoliticalParties } from './political-parties.seed';
import { seedElectoralLocations } from './electoral-locations.seed';
import { seedBallots } from './ballots.seed';

// Configurar logger y variables de entorno
config();
const logger = new Logger('Seed');

// Configuración de MongoDB
//const MONGODB_HOST = process.env.MONGODB_HOST || 'localhost';
const MONGODB_PORT = process.env.MONGODB_PORT || '27019';
const MONGODB_DB = process.env.MONGODB_DB || 'electoral_db';
const MONGODB_URI =
  `mongodb://localhost:${MONGODB_PORT}/${MONGODB_DB}`;

async function bootstrap() {
  logger.log(`Conectando a MongoDB en ${MONGODB_URI}`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    logger.log('Conexión a MongoDB establecida');

    const db = client.db(MONGODB_DB);

    // Analizar argumentos
    const args = process.argv.slice(2);
    const onlyFlag = args.find((arg) => arg.startsWith('--only='));
    const only = onlyFlag ? onlyFlag.split('=')[1] : null;

    // Ejecutar semillas según parámetros
    if (!only || only === 'parties') {
      logger.log('Creando partidos políticos...');
      await seedPoliticalParties(db);
      logger.log('✅ Partidos políticos creados');
    }

    if (!only || only === 'locations') {
      logger.log('Creando recintos electorales...');
      await seedElectoralLocations(db);
      logger.log('✅ Recintos electorales creados');
    }

    if (!only || only === 'ballots') {
      logger.log('Creando actas electorales...');
      await seedBallots(db);
      logger.log('✅ Actas electorales creados');
    }

    logger.log('Proceso de semilla completado exitosamente');
  } catch (error) {
    logger.error(`Error durante el proceso: ${error.message}`);
    logger.error(error.stack);
  } finally {
    await client.close();
    process.exit(0);
  }
}

bootstrap();
