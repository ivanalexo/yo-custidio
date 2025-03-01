/* eslint-disable prettier/prettier */
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

@Injectable()
export class BallotService {
    private readonly logger = new Logger(BallotService.name);

    constructor(
        @InjectModel(Ballot.name) private ballotModel: Model<BallotDocument>,
        private configService: ConfigService,
        private rabbitMQService: RabbitMQService,
        private imageProcessingService: ImageProcessingService,
        private dataExtractionService: DataExtractionService,
    ) {}

    async createBallot(
        imageBuffer: Buffer,
        createBallotDto: CreateBallotDto,
        clientInfo: { ipAddress: string; userAgent: string },
    ) {
        try {
            const trackingId = randomUUID();
            const { imageHash } = await this.imageProcessingService.processImage(imageBuffer);
            const existingBallot = await this.ballotModel.findOne({ imageHash });

            if (existingBallot) {
                this.logger.warn(`Dupliate ballot: ${imageHash}`);
                return {
                    trackingId: existingBallot._id,
                    status: 'DUPLICATE',
                    message: 'Esta acta ya ha sido subida previamente',
                };
            }

            const validation = await this.imageProcessingService.isBallotValid(imageBuffer);

            if (!validation.isValid) {
                this.logger.warn('Imagen rechazada', validation.reason, validation.confidence);
                return {
                    trackingId,
                    status: 'RECHAZADO',
                    message: 'La imagen no parace ser un acta electoral'
                }
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

            this.rabbitMQService.publishMessage(
                this.configService.get<string>('app.rabbitmq.exchanges.ballotProcessing')!,
                'image_processing',
                {
                    ballotId: savedBallot._id,
                    imageBuffer: imageBuffer.toString('base64'),
                    confidence: validation.confidence,
                },
            );

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
            throw new NotFoundException('Acta no encontrada')
        }

        return {
            trackingId,
            tableNumber: ballot.tableNumber,
            status: ballot.processingStatus.stage,
            verificationHistory: ballot.verificationHistory,
        }
    }

    async listBallots(filters: { tableNumber?: string; status?: string }) {
        const query: { tableNumber?: string; 'processingStatus.stage'?: string } = {};

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
          ballots: ballots.map(ballot => ({
            trackingId: ballot._id,
            tableNumber: ballot.tableNumber,
            status: ballot.processingStatus.stage,
          })),
        };
      }

      async processBallotFromQueue(ballotId: string, imageBase64: string): Promise<void> {
        try {
            const ballot = await this.ballotModel.findById(ballotId).exec();

            if (!ballot) {
                this.logger.error(`No se encontro acta ID: ${ballotId}`);
                return;
            }

            ballot.processingStatus.stage = 'PROCESSING';
            await ballot.save();

            const imageBuffer = Buffer.from(imageBase64, 'base64');

            const extractionResult = await this.dataExtractionService.extractDataFromBallot(imageBuffer);

            if (!extractionResult.success) {
                ballot.processingStatus.stage = 'EXTRACTION_FAILED';
                ballot.processingStatus.error = extractionResult.errorMessage;
                await ballot.save();

                this.logger.error(`Error extracting data from ballot ${ballotId}`);
                return;
            }

            ballot.votes = {
                validVotes: extractionResult.votes.validVotes,
                nullVotes: extractionResult.votes.nullVotes,
                blankVotes: extractionResult.votes.blankVotes,
                partyVotes: extractionResult.votes.partyVotes,
            };

            if (!ballot.tableNumber && extractionResult.tableNumber) {
                ballot.tableNumber = extractionResult.tableNumber;
            } else if (ballot.tableNumber && extractionResult.tableNumber) {
                if (ballot.tableNumber !== extractionResult.tableNumber) {
                    ballot.tableNumber = extractionResult.tableNumber;
                }
            }

            ballot.processingStatus.stage = 'COMPLETED';
            ballot.processingStatus.confidenceScore = 0.9;

            ballot.verificationHistory.push({
                status: 'PROCESSED',
                verifiedAt: new Date(),
                notes: 'Acta procesada automaticamente',
            });

            await ballot.save();

            this.logger.log(`Acta ${ballotId} procesada correctamente`);
        } catch (error) {
            this.logger.error(error);

            try {
                await this.ballotModel.findByIdAndUpdate(
                    ballotId,
                    {
                        $set: {
                            'processingStatus.stage': 'ERROR',
                            'processingStatus.error': error instanceof Error ? error.message : 'Unknown error',
                        },
                        $push: {
                            verificationHistory: {
                                status: 'ERROR',
                                verifiedAt: new Date(),
                                notes: `Error durante el procesamient ${error}`
                            },
                        },
                    }
                ).exec();
            } catch (dbError) {
                this.logger.error(dbError);
            }
        }
      }
}