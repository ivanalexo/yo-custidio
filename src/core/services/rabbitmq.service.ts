/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-for-in-array */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private readonly logger = new Logger(RabbitMQService.name);
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
    await this.setupQueues();
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
      this.logger.log('Successfully connected to RabbitMQ');
      this.isConnecting = false;
    } catch (error) {
      this.logger.error('Error connecting to RabbitMQ:', error);
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
            if (this.channel) {
                await this.setupQueues();
            }
        } catch (error) {
            this.logger.log('Failed reconnecting: ', error);
        }
    }, 5000);
  }
  private async setupQueues() {
    if (!this.channel) {
        this.logger.error('Cannot setup queues: channel is not available');
        return;
    }
    const queues = this.configService.get<Record<string, string>>(
      'app.rabbitmq.queues',
    );
    const exchanges = this.configService.get<Record<string, string>>(
      'app.rabbitmq.exchanges',
    );

    if (queues) {
      this.logger.log(queues);
      for (const [key, queueName] of Object.entries(queues)) {
        this.logger.log(`Creando cola: ${queueName}`);
        await this.channel.assertQueue(queueName, { durable: true });
      }
    }

    if (exchanges) {
      this.logger.log(exchanges);
      for (const [key, exchangeName] of Object.entries(exchanges)) {
        this.logger.log(`Creando exchange: ${exchangeName}`);
        await this.channel.assertExchange(exchangeName, 'direct', {
          durable: true,
        });
      }
    }

    if (queues && exchanges) {
      const imageProcessingQueue = queues.imageProcessing;
      const ocrProcessingQueue = queues.ocrProcessing;
      const ballotProcessingExchange = exchanges.ballotProcessing;

      if (imageProcessingQueue && ballotProcessingExchange) {
        this.logger.log(
          `Binding cola ${imageProcessingQueue} a exchange ${ballotProcessingExchange}`,
        );
        await this.channel.bindQueue(
          imageProcessingQueue,
          ballotProcessingExchange,
          'image_processing',
        );
      }

      if (ocrProcessingQueue && ballotProcessingExchange) {
        this.logger.log(
          `Binding cola ${ocrProcessingQueue} a exchange ${ballotProcessingExchange}`,
        );
        await this.channel.bindQueue(
          ocrProcessingQueue,
          ballotProcessingExchange,
          'ocr_processing',
        );
      }
    }
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

  publishMessage(exchange: string, routingKey: string, message: any) {
    try {
        if (!this.channel) {
            this.logger.error('Cannot publish message');
            return;
        }
      this.channel.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        { persistent: true },
      );
    } catch (error) {
      console.error('Error publishing:', error);
    }
  }

  async consumeMessage<T>(
    queue: string,
    callback: (message: T) => Promise<void>,
  ) {
    const setupConsumer = async () => {
      try {
        if (!this.channel) {
          await this.connect();
          if (!this.channel) {
            throw new Error('Failed to create channel');
          }
        }

        return await this.channel.consume(
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
                  this.logger.warn('Cannot acknowledge message: channel is null');
                  await this.connect();
                  await setupConsumer();
                }
              } catch (ackError) {
                this.logger.error('Error acknowledging message, channel might be closed:', ackError);
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
                this.logger.error('Error rejecting message, channel might be closed:', nackError);
                await this.connect();
                await setupConsumer();
              }
            }
          },
          { noAck: false },
        );
      } catch (error) {
        this.logger.error('Error setting up consumer:', error);

        // Reintenta configurar el consumidor después de un tiempo
        setTimeout(() => {
          this.logger.log('Retrying to set up consumer...');
          setupConsumer().catch(err => {
            this.logger.error('Failed to retry consumer setup:', err);
          });
        }, 5000);

        throw error;
      }
    };

    return setupConsumer();
  }
}
