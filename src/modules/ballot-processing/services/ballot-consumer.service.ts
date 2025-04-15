/* eslint-disable prettier/prettier */
// src/modules/ballot-processing/services/ballot-consumer.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitMQService } from '../../../core/services/rabbitmq.service';
import { BallotService } from './ballot.service';

// Configurar consumidor para procesamiento de imágenes
interface BallotResultMessage {
  ballotId: string;
  status: string;
  results?: {
    tableNumber?: string;
    votes?: any;
  };
  confidence?: number;
  source?: string;
  error?: string;
  reason?: string;
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
      const resultsQueue = this.configService.get<string>(
        'app.rabbitmq.queues.results',
        'results_queue',
      );

      this.logger.log(
        `Configurando consumidor para cola de resultados: ${resultsQueue}`,
      );

      await this.rabbitMQService.consumeMessage<BallotResultMessage>(
        resultsQueue,
        async (resultMessage: BallotResultMessage) => {
          try {
            this.logger.log(
              `Recibido resultado para acta ${resultMessage.ballotId}, status: ${resultMessage.status}`,
            );

            await this.ballotService.processBallotFromQueue(
              resultMessage.ballotId,
              resultMessage,
            );

            this.logger.log(
              `Resultado procesado correctamente para acta: ${resultMessage.ballotId}`,
            );
          } catch (error) {
            this.logger.error(
              `Error processing ballot ${resultMessage.ballotId}: ${error}`,
            );
          }
        },
      );

      this.logger.log(
        `Consumidor configurado exitosamente para cola de resultados: ${resultsQueue}`,
      );
    } catch (error) {
      this.logger.error(`Error setting up consumer: ${error}`, error);

      setTimeout(() => {
        this.setupConsumers().catch((err) => {
          this.logger.error('Failed to retry setup: ', err);
        });
      }, 5000);
    }
  }
}
