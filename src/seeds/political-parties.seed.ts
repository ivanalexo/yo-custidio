/* eslint-disable prettier/prettier */
import { Db } from 'mongodb';

export async function seedPoliticalParties(db: Db): Promise<void> {
  const collection = db.collection('politicalparties');

  // Primero, limpiar la colección existente
  await collection.deleteMany({});

  // Datos de partidos políticos
  const parties = [
    {
      partyId: 'MAS-IPSP',
      fullName: 'Movimiento Al Socialismo - Instrumento Político por la Soberanía de los Pueblos',
      description: 'Partido político boliviano fundado en 1995.',
      logoUrl: 'https://example.com/logos/mas.png',
      color: '#2196F3',
      foundedYear: 1995,
      website: 'https://masbolivia.org',
      legalRepresentative: 'Evo Morales',
      active: true,
      electionParticipation: [
        {
          electionYear: 2025,
          candidateName: 'Luis Arce',
          position: 'Presidente',
          enabled: true
        }
      ]
    },
    {
      partyId: 'CC',
      fullName: 'Comunidad Ciudadana',
      description: 'Coalición política boliviana fundada en 2018.',
      logoUrl: 'https://example.com/logos/cc.png',
      color: '#FF5722',
      foundedYear: 2018,
      website: 'https://comunidadciudadana.org',
      legalRepresentative: 'Carlos Mesa',
      active: true,
      electionParticipation: [
        {
          electionYear: 2025,
          candidateName: 'Carlos Mesa',
          position: 'Presidente',
          enabled: true
        }
      ]
    },
    {
      partyId: 'CREEMOS',
      fullName: 'Creemos',
      description: 'Alianza política boliviana fundada en 2019.',
      logoUrl: 'https://example.com/logos/creemos.png',
      color: '#4CAF50',
      foundedYear: 2019,
      website: 'https://creemos.org',
      legalRepresentative: 'Luis Fernando Camacho',
      active: true,
      electionParticipation: [
        {
          electionYear: 2025,
          candidateName: 'Luis Fernando Camacho',
          position: 'Presidente',
          enabled: true
        }
      ]
    },
    {
      partyId: 'FPV',
      fullName: 'Frente Para la Victoria',
      description: 'Coalición política boliviana.',
      logoUrl: 'https://example.com/logos/fpv.png',
      color: '#9C27B0',
      foundedYear: 2014,
      website: 'https://fpv.org',
      legalRepresentative: 'Chi Hyun Chung',
      active: true,
      electionParticipation: [
        {
          electionYear: 2025,
          candidateName: 'Chi Hyun Chung',
          position: 'Presidente',
          enabled: true
        }
      ]
    },
    {
      partyId: 'PAN-BOL',
      fullName: 'Partido de Acción Nacional Boliviano',
      description: 'Partido político boliviano.',
      logoUrl: 'https://example.com/logos/pan.png',
      color: '#FF9800',
      foundedYear: 2017,
      website: 'https://pan-bol.org',
      legalRepresentative: 'Ruth Nina',
      active: true,
      electionParticipation: [
        {
          electionYear: 2025,
          candidateName: 'Ruth Nina',
          position: 'Presidente',
          enabled: true
        }
      ]
    }
  ];

  // Insertar partidos
  await collection.insertMany(parties);

  console.log(`Se han creado ${parties.length} partidos políticos`);
}
