/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// src/seeds/ballots.seed.ts
import { Db } from 'mongodb';
import * as crypto from 'crypto';

// Funciones utilitarias
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
}

function generateTableNumber(): string {
  return randomInt(10000, 99999).toString();
}

function generateVerificationCode(): string {
  return `${randomInt(100, 999)}-${randomInt(100, 999)}`;
}

function generateConfidence(min: number = 0.3, max: number = 0.95): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

export async function seedBallots(db: Db): Promise<void> {
  const ballotCollection = db.collection('ballots');
  const locationCollection = db.collection('electorallocations');
  const partyCollection = db.collection('politicalparties');

  // Primero, limpiar la colección existente
  await ballotCollection.deleteMany({});

  // Obtener todos los recintos y partidos para crear relaciones
  const locations = await locationCollection.find().toArray();
  const parties = await partyCollection.find().toArray();

  if (locations.length === 0 || parties.length === 0) {
    throw new Error('Debes crear recintos y partidos antes de crear actas.');
  }

  // Estados posibles para las actas
  const possibleStatuses = [
    'RECEIVED',
    'COMPLETED',
    'EXTRACTION_FAILED',
    'REJECTED',
    'VALIDATION_PENDING',
    'ERROR',
  ];

  // Distribución de probabilidades para los estados
  const statusDistribution = {
    COMPLETED: 0.6, // 60% de actas completadas
    VALIDATION_PENDING: 0.2, // 20% pendientes de validación
    RECEIVED: 0.1, // 10% recibidas pero no procesadas
    EXTRACTION_FAILED: 0.05, // 5% con fallos de extracción
    REJECTED: 0.03, // 3% rechazadas
    ERROR: 0.02, // 2% con errores
  };

  // Generar 20 actas con diferentes estados
  const ballots: any[] = [];

  for (let i = 0; i < 20; i++) {
    // Seleccionar estado basado en probabilidades
    const statusRoll = Math.random();
    let cumulativeProbability = 0;
    let selectedStatus = possibleStatuses[0];

    for (const status in statusDistribution) {
      cumulativeProbability += statusDistribution[status];
      if (statusRoll <= cumulativeProbability) {
        selectedStatus = status;
        break;
      }
    }

    // Seleccionar recinto aleatorio
    const location = randomItem(locations);

    // Generar número de mesa aleatorio o dentro del rango del recinto
    const tableNumber =
      i % 2 === 0
        ? generateTableNumber()
        : `${randomInt(1, location.totalTables || 10)}`;

    // Crear acta base
    const ballot: any = {
      tableNumber,
      locationId: location._id,
      location: {
        department: location.department,
        province: location.province,
        municipality: location.municipality,
        address: location.address,
      },
      verificationCode: generateVerificationCode(),
      imageUrl: `ballot_${i}_${generateHash(tableNumber).substring(0, 8)}`,
      imageHash: generateHash(`${tableNumber}_${Date.now()}_${i}`),
      processingStatus: {
        stage: selectedStatus,
        error: ['EXTRACTION_FAILED', 'ERROR', 'REJECTED'].includes(
          selectedStatus,
        )
          ? 'Error en el procesamiento de la imagen'
          : undefined,
        confidenceScore:
          selectedStatus === 'COMPLETED'
            ? randomInt(70, 100) / 100
            : randomInt(20, 60) / 100,
      },
      confidence: generateConfidence(),
      needsHumanVerification:
        ['VALIDATION_PENDING'].includes(selectedStatus) || Math.random() < 0.3,
      metadata: {
        submitterId: `CITIZEN_${randomInt(1000, 9999)}`,
        ipAddress: `192.168.${randomInt(1, 255)}.${randomInt(1, 255)}`,
        userAgent: 'Mozilla/5.0 (YoCustodioApp) Test Data',
      },
      verificationHistory: [
        {
          status: 'RECEIVED',
          verifiedAt: randomDate(
            new Date('2025-04-01'),
            new Date('2025-04-05'),
          ),
          notes: 'Acta recibida para procesamiento',
        },
      ],
      createdAt: randomDate(new Date('2025-04-01'), new Date('2025-04-05')),
      updatedAt: new Date(),
    };

    // Añadir historial según el estado
    if (selectedStatus !== 'RECEIVED') {
      ballot.verificationHistory.push({
        status: selectedStatus,
        verifiedAt: new Date(
          new Date(ballot.createdAt).getTime() + randomInt(5, 60) * 60000,
        ),
        notes:
          selectedStatus === 'COMPLETED'
            ? 'Procesamiento completado con éxito'
            : selectedStatus === 'VALIDATION_PENDING'
              ? 'Requiere validación manual'
              : 'Error en el procesamiento',
      });
    }

    // Añadir datos de votos para actas completadas
    if (['COMPLETED', 'VALIDATION_PENDING'].includes(selectedStatus)) {
      // Generar votos aleatorios
      const totalVotesBase = randomInt(100, 300);
      const validVotesBase = randomInt(
        Math.floor(totalVotesBase * 0.7),
        totalVotesBase,
      );
      const nullVotesBase = randomInt(
        0,
        Math.floor((totalVotesBase - validVotesBase) * 0.6),
      );
      const blankVotesBase = totalVotesBase - validVotesBase - nullVotesBase;

      // Generar distribución de votos por partido
      const partyVotes: { partyId: string; votes: number }[] = [];
      let remainingValidVotes = validVotesBase;

      // Asignar votos a cada partido
      for (let j = 0; j < parties.length; j++) {
        const isLastParty = j === parties.length - 1;
        const votes = isLastParty
          ? remainingValidVotes
          : randomInt(0, Math.floor(remainingValidVotes * 0.6));

        partyVotes.push({
          partyId: parties[j].partyId,
          votes: votes,
        });

        remainingValidVotes -= votes;
        if (remainingValidVotes <= 0) break;
      }

      ballot.votes = {
        validVotes: validVotesBase,
        nullVotes: nullVotesBase,
        blankVotes: blankVotesBase,
        partyVotes: partyVotes,
      };
    }

    ballots.push(ballot);
  }

  // Insertar actas
  if (ballots.length > 0) {
    await ballotCollection.insertMany(ballots);
  }

  console.log(`Se han creado ${ballots.length} actas electorales`);
}
