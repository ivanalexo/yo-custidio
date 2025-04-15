/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-for-in-array */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { resolve } from 'path';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private readonly logger = new Logger(RabbitMQService.name);
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  private readonly exchangeName: string;
  private readonly resultQueueName: string;

  constructor(private configService: ConfigService) {
    this.exchangeName = this.configService.get<string>(
      'app.rabbitmq.exchanges.ballotProcessing',
      'ballot_processing_exchange',
    );
    this.resultQueueName = this.configService.get<string>(
      'app.rabbitmq.queues.results',
      'results_queue',
    );
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    await this.disconnect();
  }

  private async connect() {
    if (this.isConnecting) {
      return;
    }
    this.isConnecting = true;

    try {
      this.connection = await amqp.connect(
        this.configService.get<string>('app.rabbitmq.url')!,
      );

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ Connection Error: ', err);
        this.scheduleReconnect();
      });

      this.connection.on('close', () => {
        this.logger.error('RabbitMQ Connection Closed');
        this.scheduleReconnect();
      });

      this.channel = await this.connection.createChannel();

      this.channel.on('error', (err) => {
        console.error('RabbitMQ Channel Error:', err);
      });

      this.channel.on('close', () => {
        console.warn('RabbitMQ Channel Closed');
      });

      try {
        await this.channel.checkExchange(this.exchangeName);
        this.logger.log(`Exchange ${this.exchangeName} encontado`);
      } catch (error) {
        this.logger.warn(
          `Exchange ${this.exchangeName} no existe, esperando que el worker de python inicie...`,
        );
      }
      this.logger.log('Successfully connected to RabbitMQ');
      this.isConnecting = false;
    } catch (error) {
      this.logger.error('Error conectando a RabbitMQ:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
      throw error;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.channel = null;
    this.connection = null;

    this.reconnectTimeout = setTimeout(async () => {
      this.logger.log('Attempting to reconnect to RabbitMQ...');
      try {
        await this.connect();
      } catch (error) {
        this.logger.log('Failed reconnecting: ', error);
      }
    }, 5000);
  }

  private async disconnect() {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.logger.log('Successfully disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error('Error disconnecting:', error);
    }
  }

  async publishMessage(exchange: string, routingKey: string, message: any) {
    try {
      if (!this.channel) {
        this.logger.error('No se puede publicar mensaje: Canal nulo');
        await this.connect();
        if (!this.channel) {
          throw new Error('Fallo al crear canal');
        }
      }

      try {
        await this.channel.checkExchange(exchange);
      } catch (error) {
        this.logger.error(
          `Exchange ${exchange} no existe. Esperando 2 segundos y reintentar...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));

        try {
          await this.channel.checkExchange(exchange);
        } catch (secondError) {
          this.logger.error(
            `Exchange ${exchange} sigue sin existir. Mensaje no publicado.`,
          );
          return false;
        }
      }

      this.logger.log(`Publicando mensaje a ${exchange}:${routingKey}`);

      this.channel.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        { persistent: true },
      );

      this.logger.log(
        `Mensaje publicado exitosamente a ${exchange}:${routingKey}`,
      );
    } catch (error) {
      console.error('Error publishing:', error);
    }
  }

  async consumeMessage<T>(
    queue: string,
    callback: (message: T) => Promise<void>,
  ): Promise<{ consumerTag: string }> {
    const setupConsumer = async () => {
      try {
        if (!this.channel) {
          await this.connect();
          if (!this.channel) {
            throw new Error('Failed to create channel');
          }
        }

        // verificar que la cola exista antes de consumir

        try {
          await this.channel.checkQueue(queue);
        } catch (error) {
          this.logger.error(
            `Cola ${queue} no existe. Esperando a que sea creada...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return setupConsumer();
        }

        const { consumerTag } = await this.channel.consume(
          queue,
          async (message) => {
            if (!message) return;

            try {
              // No podemos verificar directamente si el canal está cerrado
              // Asumimos que está abierto si existe
              const content = JSON.parse(message.content.toString()) as T;
              await callback(content);

              // Envolvemos el ack en un try/catch para capturar errores si el canal está cerrado
              try {
                if (this.channel) {
                  this.channel.ack(message);
                } else {
                  this.logger.warn(
                    'No se puede reconocer el mensaje: canal es null',
                  );
                  await this.connect();
                  await setupConsumer();
                }
              } catch (ackError) {
                this.logger.error(
                  'Error reconociendo mensaje, el canal pudo haberse cerrado:',
                  ackError,
                );
                // Si hay un error al hacer ack, intentamos reconectar
                await this.connect();
                await setupConsumer();
              }
            } catch (error) {
              this.logger.error('Error processing message:', error);

              try {
                if (this.channel) {
                  // No reencolar el mensaje para evitar bucles
                  this.channel.nack(message, false, false);
                } else {
                  this.logger.warn('Cannot nack message: channel is null');
                  await this.connect();
                  await setupConsumer();
                }
              } catch (nackError) {
                this.logger.error(
                  'Error rejecting message, channel might be closed:',
                  nackError,
                );
                await this.connect();
                await setupConsumer();
              }
            }
          },
          { noAck: false },
        );
        return { consumerTag };
      } catch (error) {
        this.logger.error('Error setting up consumer:', error);

        // Reintenta configurar el consumidor después de un tiempo
        setTimeout(() => {
          this.logger.log('Retrying to set up consumer...');
          setupConsumer().catch((err) => {
            this.logger.error('Failed to retry consumer setup:', err);
          });
        }, 5000);

        throw error;
      }
    };

    return setupConsumer();
  }

  async retryDeadLetterMessages(
    dlqName: string,
    targetQueue: string,
    count: number = 10,
  ): Promise<number> {
    if (!this.channel) {
      await this.connect();
      if (!this.channel) {
        throw new Error('Failed to create channel');
      }
    }

    let processedCount = 0;

    for (let i = 0; i < count; i++) {
      const message = await this.channel.get(dlqName, { noAck: false });
      if (!message) {
        break; // No hay más mensajes
      }

      try {
        // Publicar a la cola original
        this.channel.publish('', targetQueue, message.content, {
          persistent: true,
        });

        // Confirmar procesamiento
        this.channel.ack(message);

        processedCount++;
      } catch (error) {
        this.logger.error(`Error retrying message: ${error}`);
        this.channel.nack(message, false, true); // Reencolar en DLQ
        break;
      }
    }

    return processedCount;
  }
}
