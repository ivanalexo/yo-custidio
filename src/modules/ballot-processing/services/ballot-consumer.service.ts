/* eslint-disable prettier/prettier */
// src/modules/ballot-processing/services/ballot-consumer.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitMQService } from '../../../core/services/rabbitmq.service';
import { BallotService } from './ballot.service';

// Configurar consumidor para procesamiento de imágenes
interface BallotMessage {
    ballotId: string;
    imageBuffer: string;
}

@Injectable()
export class BallotConsumerService implements OnModuleInit {
  private readonly logger = new Logger(BallotConsumerService.name);

  constructor(
    private configService: ConfigService,
    private rabbitMQService: RabbitMQService,
    private ballotService: BallotService,
  ) {}

  async onModuleInit() {
    await this.setupConsumers();
  }

  private async setupConsumers() {
    try {
      // Buscar las colas en la configuración
      const queuesConfig = this.configService.get<{ imageProcessing: string }>('app.rabbitmq.queues');
      
      if (!queuesConfig || !queuesConfig.imageProcessing) {
        this.logger.error('Queue configuration not found');
        return;
      }

      const ballotProcessingQueue = queuesConfig.imageProcessing;
      this.logger.log(`Setting up consumer for queue: ${ballotProcessingQueue}`);

      await this.rabbitMQService.consumeMessage<BallotMessage>(
        ballotProcessingQueue,
        async (parsedMessage: BallotMessage) => {
            try {
                this.logger.log(`Received ballot for processing: ${JSON.stringify(parsedMessage)}`);

                await this.ballotService.processBallotFromQueue(
                  parsedMessage.ballotId,
                  parsedMessage.imageBuffer,
                );

            } catch (error) {
                this.logger.error(`Error processing ballot ${parsedMessage.ballotId}: ${error}`);
            }
        }
      );

      this.logger.log(`Consumer successfully set up for queue: ${ballotProcessingQueue}`);
    } catch (error) {
      this.logger.error(`Error setting up consumer: ${error}`, error);

      setTimeout(() => {
        this.setupConsumers().catch(err => {
            this.logger.error('Failed to retry setup: ', err);
        });
      }, 5000);
    }
  }
}