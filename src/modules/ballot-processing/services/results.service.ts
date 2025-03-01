/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/modules/ballot-processing/services/results.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ballot, BallotDocument } from '../schemas/ballot.schema';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';

// Definir interfaces para los tipos de respuesta
export interface PartyResult {
  partyId: string;
  totalVotes: number;
  ballotCount: number;
  percentage?: number;
}

export interface AggregatedResults {
  results: PartyResult[];
  totals: {
    validVotes: number;
    nullVotes: number;
    blankVotes: number;
    totalBallots: number;
  };
  filters: {
    department?: string;
    province?: string;
    municipality?: string;
  };
  generatedAt: Date;
}

export interface TableResults {
  tableNumber: string;
  votes: {
    validVotes: number;
    nullVotes: number;
    blankVotes: number;
    partyVotes: Array<{ partyId: string; votes: number }>;
  };
  location: any;
  processingStatus: {
    stage: string;
    error?: string;
    confidenceScore?: number;
  };
  lastUpdated: Date;
  ballotCount: number;
}

export interface PartyResults {
  parties: PartyResult[];
  generatedAt: Date;
}

export interface SystemStatistics {
  processingStatus: {
    received: number;
    processing: number;
    completed: number;
    failed: number;
    rejected: number;
    total: number;
  };
  votingStatistics: {
    totalVotes: number;
    validVotes: number;
    nullVotes: number;
    blankVotes: number;
    processedBallots: number;
  };
  recentActivity: any[];
  generatedAt: Date;
}

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);
  private readonly cacheEnabled: boolean;
  private readonly cacheTTL: number;

  constructor(
    @InjectModel(Ballot.name) private ballotModel: Model<BallotDocument>,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.cacheEnabled = this.configService.get<boolean>(
      'app.cache.enabled',
      true,
    );
    this.cacheTTL = this.configService.get<number>('app.cache.ttl', 300); // 5 minutos por defecto
  }

  async getAggregatedResults(filters: {
    department?: string;
    province?: string;
    municipality?: string;
  }): Promise<AggregatedResults> {
    const cacheKey = `results_${JSON.stringify(filters)}`;

    // Intentar obtener resultados de caché
    if (this.cacheEnabled) {
      const cachedResults = await this.cacheManager.get<
        AggregatedResults | undefined
      >(cacheKey);
      if (cachedResults) {
        this.logger.log(`Results served from cache for key: ${cacheKey}`);
        return cachedResults;
      }
    }

    // Construir filtro para la consulta
    const query: Record<string, any> = {
      'processingStatus.stage': 'COMPLETED',
    };

    if (filters.department) {
      query['location.department'] = filters.department;
    }
    if (filters.province) {
      query['location.province'] = filters.province;
    }
    if (filters.municipality) {
      query['location.municipality'] = filters.municipality;
    }

    // Ejecutar agregación
    const results = await this.ballotModel.aggregate<PartyResult>([
      { $match: query },
      { $unwind: '$votes.partyVotes' },
      {
        $group: {
          _id: '$votes.partyVotes.partyId',
          totalVotes: { $sum: '$votes.partyVotes.votes' },
          ballotCount: { $sum: 1 },
        },
      },
      { $sort: { totalVotes: -1 } },
      {
        $project: {
          partyId: '$_id',
          totalVotes: 1,
          ballotCount: 1,
          _id: 0,
        },
      },
    ]);

    // Calcular totales
    const totalStats = await this.ballotModel.aggregate<{
      validVotes: number;
      nullVotes: number;
      blankVotes: number;
      totalBallots: number;
    }>([
      { $match: query },
      {
        $group: {
          _id: null,
          validVotes: { $sum: '$votes.validVotes' },
          nullVotes: { $sum: '$votes.nullVotes' },
          blankVotes: { $sum: '$votes.blankVotes' },
          totalBallots: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          validVotes: 1,
          nullVotes: 1,
          blankVotes: 1,
          totalBallots: 1,
        },
      },
    ]);

    const response: AggregatedResults = {
      results,
      totals:
        totalStats.length > 0
          ? totalStats[0]
          : {
              validVotes: 0,
              nullVotes: 0,
              blankVotes: 0,
              totalBallots: 0,
            },
      filters,
      generatedAt: new Date(),
    };

    // Guardar en caché
    if (this.cacheEnabled) {
      await this.cacheManager.set(cacheKey, response, this.cacheTTL * 1000);
    }

    return response;
  }

  async getTableResults(tableNumber: string): Promise<TableResults> {
    const cacheKey = `table_results_${tableNumber}`;

    // Intentar obtener de caché
    if (this.cacheEnabled) {
      const cachedResults = await this.cacheManager.get<
        TableResults | undefined
      >(cacheKey);
      if (cachedResults) {
        return cachedResults;
      }
    }

    // Buscar actas para esta mesa
    const ballots = await this.ballotModel
      .find({
        tableNumber,
        'processingStatus.stage': 'COMPLETED',
      })
      .sort({ updatedAt: -1 })
      .exec();

    if (ballots.length === 0) {
      throw new NotFoundException(
        `No se encontraron resultados para la mesa: ${tableNumber}`,
      );
    }

    // Tomar la más reciente como la válida
    const latestBallot = ballots[0];

    const response: TableResults = {
      tableNumber,
      votes: latestBallot.votes,
      location: latestBallot.location,
      processingStatus: latestBallot.processingStatus,
      lastUpdated: latestBallot.updatedAt,
      ballotCount: ballots.length,
    };

    // Guardar en caché
    if (this.cacheEnabled) {
      await this.cacheManager.set(cacheKey, response, this.cacheTTL * 1000);
    }

    return response;
  }

  async getResultsByParty(): Promise<PartyResults> {
    const cacheKey = 'results_by_party';

    // Intentar obtener de caché
    if (this.cacheEnabled) {
      const cachedResults = await this.cacheManager.get<
        PartyResults | undefined
      >(cacheKey);
      if (cachedResults) {
        return cachedResults;
      }
    }

    // Agregación para obtener votos por partido
    const partyResults = await this.ballotModel.aggregate<PartyResult>([
      { $match: { 'processingStatus.stage': 'COMPLETED' } },
      { $unwind: '$votes.partyVotes' },
      {
        $group: {
          _id: '$votes.partyVotes.partyId',
          totalVotes: { $sum: '$votes.partyVotes.votes' },
          ballotCount: { $sum: 1 },
        },
      },
      { $sort: { totalVotes: -1 } },
      {
        $project: {
          partyId: '$_id',
          totalVotes: 1,
          ballotCount: 1,
          percentage: {
            $multiply: [{ $divide: ['$totalVotes', { $literal: 1 }] }, 100],
          },
          _id: 0,
        },
      },
    ]);

    // Calcular porcentajes correctamente después de obtener los totales
    const totalVotes = partyResults.reduce(
      (sum, party) => sum + party.totalVotes,
      0,
    );

    // Calcular porcentajes
    const partiesWithPercentages = partyResults.map((party) => ({
      ...party,
      percentage: totalVotes > 0 ? (party.totalVotes / totalVotes) * 100 : 0,
    }));

    const response: PartyResults = {
      parties: partiesWithPercentages,
      generatedAt: new Date(),
    };

    // Guardar en caché
    if (this.cacheEnabled) {
      await this.cacheManager.set(cacheKey, response, this.cacheTTL * 1000);
    }

    return response;
  }

  async getSystemStatistics(): Promise<SystemStatistics> {
    const cacheKey = 'system_statistics';

    // Intentar obtener de caché
    if (this.cacheEnabled) {
      const cachedStats = await this.cacheManager.get<
        SystemStatistics | undefined
      >(cacheKey);
      if (cachedStats) {
        return cachedStats;
      }
    }

    // Estadísticas generales
    type StatusCount = { _id: string; count: number };
    const statusCounts = await this.ballotModel.aggregate<StatusCount>([
      {
        $group: {
          _id: '$processingStatus.stage',
          count: { $sum: 1 },
        },
      },
    ]);

    // Convertir a objeto para fácil acceso
    const statusMap: Record<string, number> = statusCounts.reduce(
      (acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Estadísticas de votación
    interface VotingStats {
      totalVotes: number;
      validVotes: number;
      nullVotes: number;
      blankVotes: number;
      processedBallots: number;
    }

    const votingStats = await this.ballotModel.aggregate<VotingStats>([
      { $match: { 'processingStatus.stage': 'COMPLETED' } },
      {
        $group: {
          _id: null,
          totalVotes: { $sum: '$votes.validVotes' },
          validVotes: { $sum: '$votes.validVotes' },
          nullVotes: { $sum: '$votes.nullVotes' },
          blankVotes: { $sum: '$votes.blankVotes' },
          processedBallots: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          totalVotes: 1,
          validVotes: 1,
          nullVotes: 1,
          blankVotes: 1,
          processedBallots: 1,
        },
      },
    ]);

    // Últimas actas procesadas
    const recentBallots = await this.ballotModel
      .find()
      .sort({ updatedAt: -1 })
      .limit(10)
      .select('tableNumber processingStatus updatedAt')
      .exec();

    const response: SystemStatistics = {
      processingStatus: {
        received: statusMap['RECEIVED'] || 0,
        processing: statusMap['PROCESSING'] || 0,
        completed: statusMap['COMPLETED'] || 0,
        failed: statusMap['FAILED'] || 0,
        rejected: statusMap['REJECTED'] || 0,
        total: await this.ballotModel.countDocuments(),
      },
      votingStatistics:
        votingStats.length > 0
          ? votingStats[0]
          : {
              totalVotes: 0,
              validVotes: 0,
              nullVotes: 0,
              blankVotes: 0,
              processedBallots: 0,
            },
      recentActivity: recentBallots,
      generatedAt: new Date(),
    };

    // Guardar en caché
    if (this.cacheEnabled) {
      await this.cacheManager.set(cacheKey, response, 60 * 1000); // 1 minuto
    }

    return response;
  }
}
