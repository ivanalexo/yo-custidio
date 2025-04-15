/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { RabbitMQService } from '../../../core/services/rabbitmq.service';
import { ImageProcessingService } from './image-processing.service';
import { Ballot, BallotDocument } from '../schemas/ballot.schema';
import { CreateBallotDto } from '../dto/create-ballot.dto';
import { randomUUID } from 'crypto';
import { DataExtractionService } from './data-extraction.service';
import { RealtimeService } from 'src/core/services/realtime.service';

@Injectable()
export class BallotService {
  private readonly logger = new Logger(BallotService.name);

  constructor(
    @InjectModel(Ballot.name) private ballotModel: Model<BallotDocument>,
    private configService: ConfigService,
    private rabbitMQService: RabbitMQService,
    private imageProcessingService: ImageProcessingService,
    private dataExtractionService: DataExtractionService,
    private realtimeService: RealtimeService,
  ) {}

  async createBallot(
    imageBuffer: Buffer,
    createBallotDto: CreateBallotDto,
    clientInfo: { ipAddress: string; userAgent: string },
  ) {
    try {
      const trackingId = randomUUID();

      if (!imageBuffer || !(imageBuffer instanceof Buffer)) {
        throw new Error('Buffer de imagen no valido');
      }

      const { imageHash } =
        await this.imageProcessingService.processImage(imageBuffer);
      const existingBallot = await this.ballotModel.findOne({ imageHash });

      if (existingBallot) {
        this.logger.warn(`Dupliate ballot: ${imageHash}`);
        return {
          trackingId: existingBallot._id,
          status: 'DUPLICATE',
          message: 'Esta acta ya ha sido subida previamente',
        };
      }

      const validation =
        await this.imageProcessingService.isBallotValid(imageBuffer);
      this.logger.log(`Validacion: ${JSON.stringify(validation)}`);

      if (!validation.isValid) {
        this.logger.warn(
          'Imagen rechazada',
          validation.reason,
          validation.confidence,
        );
        return {
          trackingId,
          status: 'RECHAZADO',
          message: 'La imagen no parace ser un acta electoral',
        };
      }

      const newBallot = new this.ballotModel({
        tableNumber: createBallotDto.tableNumber,
        locationId: createBallotDto.locationCode,
        imageHash,
        imageUrl: `ballot_${trackingId}`,
        processingStatus: {
          stage: 'RECEIVED',
          confidenceScore: 0,
        },
        metadata: {
          submitterId: createBallotDto.citizenId,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        },
        verificationHistory: [
          {
            status: 'RECEIVED',
            verifiedAt: new Date(),
            notes: 'Acta recibida para procesamiento',
          },
        ],
      });

      const savedBallot = await newBallot.save();

      const exchangeName = this.configService.get<string>(
        'app.rabbitmq.exchanges.ballotProcessing',
      )!;
      this.logger.log(`Enviando a cola: ${exchangeName} - image_processing`);

      await this.rabbitMQService.publishMessage(
        this.configService.get<string>(
          'app.rabbitmq.exchanges.ballotProcessing',
        )!,
        'image_processing',
        {
          ballotId: savedBallot._id,
          imageBuffer: imageBuffer.toString('base64'),
          confidence: validation.confidence,
        },
      );

      await this.realtimeService.publish('processing', {
        ballotId: savedBallot._id,
        status: 'RECEIVED',
        timestamp: new Date(),
        metadata: {
          tableNumber: savedBallot.tableNumber,
        }
      });

      return {
        trackingId: savedBallot._id,
        status: 'RECEIVED',
        message: 'Acta recibida correctamente y en proceso',
      };
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async getBallotStatus(trackingId: string) {
    const ballot = await this.ballotModel.findById(trackingId).exec();

    if (!ballot) {
      throw new NotFoundException('Acta no encontrada');
    }

    return {
      trackingId,
      tableNumber: ballot.tableNumber,
      status: ballot.processingStatus.stage,
      verificationHistory: ballot.verificationHistory,
    };
  }

  async listBallots(filters: { tableNumber?: string; status?: string }) {
    const query: { tableNumber?: string; 'processingStatus.stage'?: string } =
      {};

    if (filters.tableNumber) {
      query.tableNumber = filters.tableNumber;
    }

    if (filters.status) {
      query['processingStatus.stage'] = filters.status;
    }

    const ballots = await this.ballotModel
      .find(query)
      .select('tableNumber processingStatus updatedAt')
      .sort({ updatedAt: -1 })
      .limit(100)
      .exec();

    return {
      total: ballots.length,
      ballots: ballots.map((ballot) => ({
        trackingId: ballot._id,
        tableNumber: ballot.tableNumber,
        status: ballot.processingStatus.stage,
      })),
    };
  }

  async processBallotFromQueue(
    ballotId: string,
    resultData: any,
  ): Promise<void> {
    try {
      this.logger.log(
        `Procesando resultado para acta ${ballotId}, status: ${resultData.status}`,
      );

      const ballot = await this.ballotModel.findById(ballotId).exec();

      if (!ballot) {
        this.logger.error(`No se encontró acta ID: ${ballotId}`);
        return;
      }

      // Añadir registro en el historial de verificación
      const historyEntry = {
        status: resultData.status,
        verifiedAt: new Date(),
        notes: '',
      };

      await this.realtimeService.publish('processing', {
        ballotId: ballotId,
        status: resultData.status,
        timestamp: new Date(),
        metadata: {
          tableNumber: ballot.tableNumber,
        }
      })

      switch (resultData.status) {
        case 'COMPLETED':
          // Actualizar datos de votos si están disponibles
          ballot.confidence = resultData.confidence || 0;
          ballot.needsHumanVerification = resultData.needsHumanVerification || (resultData.confidence < 0.7);

          historyEntry.notes = `Acta procesada correctamente (fuente: ${resultData.source || 'unknown'}, confianza: ${ballot.confidence.toFixed(2)})`;

          if (ballot.needsHumanVerification) {
            historyEntry.notes += '. Require verificacion humana.';
            ballot.processingStatus.stage = 'VALIDATION_PENDING';
          }
          if (resultData.results) {
            ballot.votes = {
              validVotes: resultData.results.votes?.validVotes || 0,
              nullVotes: resultData.results.votes?.nullVotes || 0,
              blankVotes: resultData.results.votes?.blankVotes || 0,
              partyVotes: resultData.results.votes?.partyVotes || [],
            };
          
          if (resultData.results.location) {
            ballot.location = {
              department: resultData.results.location.department || "",
              province: resultData.results.location.province || "",
              municipality: resultData.results.location.municipality || "",
              address: resultData.results.location.venue || ""
            }
          }

            // Actualizar número de mesa si es necesario
            if (
              resultData.results.tableNumber &&
              (!ballot.tableNumber ||
                ballot.tableNumber !== resultData.results.tableNumber)
            ) {
              ballot.tableNumber = resultData.results.tableNumber;
            }
          }

          ballot.processingStatus.stage = 'COMPLETED';
          ballot.processingStatus.confidenceScore =
            resultData.confidence || 0.9;

          historyEntry.notes = `Acta procesada correctamente (fuente: ${resultData.source || 'unknown'})`;

          this.logger.log(
            `Acta ${ballotId} procesada con éxito, confianza: ${ballot.processingStatus.confidenceScore}`,
          );

          await this.realtimeService.publish('results', {
            ballotId: ballotId,
            tableNumber: ballot.tableNumber,
            votes: ballot.votes,
            timestamp: new Date(),
          });

          break;

        case 'EXTRACTION_FAILED':
          ballot.processingStatus.stage = 'EXTRACTION_FAILED';
          ballot.processingStatus.error =
            resultData.error || 'Error desconocido en extracción';

          historyEntry.notes = `Error durante la extracción: ${resultData.error || 'Error desconocido'}`;

          this.logger.error(
            `Error de extracción para acta ${ballotId}: ${resultData.error}`,
          );
          break;

        case 'REJECTED':
          ballot.processingStatus.stage = 'REJECTED';
          ballot.processingStatus.error = resultData.reason || 'Acta rechazada';
          ballot.processingStatus.confidenceScore = resultData.confidence || 0;

          historyEntry.notes = `Acta rechazada: ${resultData.reason || 'Razón no especificada'}`;

          this.logger.warn(`Acta ${ballotId} rechazada: ${resultData.reason}`);
          break;

        case 'VALIDATION_PENDING':
          // Caso para actas que requieren validación manual
          ballot.processingStatus.stage = 'VALIDATION_PENDING';
          ballot.processingStatus.confidenceScore = resultData.confidence || 0;

          if (resultData.results) {
            // Guardar resultados preliminares aunque requieran validación
            ballot.votes = {
              validVotes: resultData.results.votes?.validVotes || 0,
              nullVotes: resultData.results.votes?.nullVotes || 0,
              blankVotes: resultData.results.votes?.blankVotes || 0,
              partyVotes: resultData.results.votes?.partyVotes || [],
            };
          }

          historyEntry.notes = `Acta requiere validación manual (confianza: ${resultData.confidence})`;

          this.logger.warn(
            `Acta ${ballotId} requiere validación manual, confianza: ${resultData.confidence}`,
          );
          break;

        default:
          // Estado no reconocido
          ballot.processingStatus.stage = 'UNKNOWN';
          ballot.processingStatus.error = `Estado no reconocido: ${resultData.status}`;

          historyEntry.notes = `Estado no reconocido: ${resultData.status}`;

          this.logger.error(
            `Estado no reconocido para acta ${ballotId}: ${resultData.status}`,
          );
      }

      // Añadir entrada al historial
      ballot.verificationHistory.push(historyEntry);

      // Guardar cambios en la base de datos
      await ballot.save();
      this.logger.log(`Actualización guardada para acta ${ballotId}`);
    } catch (error) {
      this.logger.error(
        `Error procesando resultado para acta ${ballotId}: ${error}`,
      );

      await this.realtimeService.publish('processing', {
        ballotId: ballotId,
        status: 'ERROR',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Error desconocido'
      });

      // Intentar actualizar el estado a ERROR en caso de fallo
      try {
        await this.ballotModel
          .findByIdAndUpdate(ballotId, {
            $set: {
              'processingStatus.stage': 'ERROR',
              'processingStatus.error':
                error instanceof Error ? error.message : 'Error desconocido',
            },
            $push: {
              verificationHistory: {
                status: 'ERROR',
                verifiedAt: new Date(),
                notes: `Error durante el procesamiento: ${error}`,
              },
            },
          })
          .exec();
      } catch (dbError) {
        this.logger.error(
          `Error adicional al actualizar estado de ERROR: ${dbError}`,
        );
      }
    }
  }
}
