/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/core/services/realtime.service.ts
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private publisher: any;
  private subscriber: any;
  private readonly enabled: boolean;
  private readonly channels: Record<string, string>;

  constructor(private configService: ConfigService) {
    this.enabled = this.configService.get<boolean>(
      'app.realtime.enabled',
      false,
    );
    this.channels = this.configService.get<Record<string, string>>(
      'app.realtime.channel',
      {
        results: 'realtime:results',
        stats: 'realtime:stats',
        processing: 'realtime:processing',
      },
    );
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Realtime service is disabled');
      return;
    }

    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    try {
      const redisOptions = {
        url: `redis://${this.configService.get<string>('app.redis.host')}:${this.configService.get<number>('app.redis.port')}`,
        password: this.configService.get<string>('app.redis.password'),
      };

      // Crear cliente publisher
      this.publisher = createClient(redisOptions);
      await this.publisher.connect();

      // Crear cliente subscriber
      this.subscriber = createClient(redisOptions);
      await this.subscriber.connect();

      this.logger.log('Connected to Redis Pub/Sub');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
    }
  }

  private async disconnect() {
    try {
      if (this.publisher) {
        await this.publisher.quit();
      }

      if (this.subscriber) {
        await this.subscriber.quit();
      }

      this.logger.log('Disconnected from Redis Pub/Sub');
    } catch (error) {
      this.logger.error('Error disconnecting from Redis:', error);
    }
  }

  async publish(channel: string, message: any): Promise<void> {
    if (!this.enabled || !this.publisher) {
      return;
    }

    try {
      const channelName = this.channels[channel] || channel;
      await this.publisher.publish(channelName, JSON.stringify(message));
    } catch (error) {
      this.logger.error(`Error publishing to channel ${channel}:`, error);
    }
  }

  async subscribe(
    channel: string,
    callback: (message: any) => void,
  ): Promise<void> {
    if (!this.enabled || !this.subscriber) {
      return;
    }

    try {
      const channelName = this.channels[channel] || channel;
      await this.subscriber.subscribe(channelName, (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage);
        } catch (error) {
          this.logger.error(
            `Error parsing message from channel ${channel}:`,
            error,
          );
        }
      });

      this.logger.log(`Subscribed to channel: ${channelName}`);
    } catch (error) {
      this.logger.error(`Error subscribing to channel ${channel}:`, error);
    }
  }

  // Métodos de utilidad para canales comunes
  async publishResults(results: any): Promise<void> {
    await this.publish('results', results);
  }

  async publishStats(stats: any): Promise<void> {
    await this.publish('stats', stats);
  }

  async publishProcessingUpdate(update: any): Promise<void> {
    await this.publish('processing', update);
  }
}
