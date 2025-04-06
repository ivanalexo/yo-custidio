/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';

import { BallotController } from './controller/ballot.controller';
import { ResultsController } from './controller/results.controller';
import { BallotService } from './services/ballot.service';
import { ImageProcessingService } from './services/image-processing.service';
import { Ballot, BallotSchema } from './schemas/ballot.schema';
import { RabbitMQService } from '../../core/services/rabbitmq.service';
import { DataExtractionService } from './services/data-extraction.service';
import { ResultsService } from './services/results.service';
import { CoreModule } from '../../core/core.module';
import { BallotConsumerService } from './services/ballot-consumer.service';

@Module({
  imports: [
    ConfigModule,
    CoreModule,
    MongooseModule.forFeature([{ name: Ballot.name, schema: BallotSchema }]),
    MulterModule.register({
      limits: {
        fileSize: 20 * 1024 * 1024,
        fieldSize: 20 * 1024 * 1024,
      },
    }),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get('app.redis.host'),
        port: configService.get('app.redis.port'),
        ttl: configService.get('app.cache.ttl') * 1000,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [BallotController, ResultsController],
  providers: [
    RabbitMQService,
    BallotService,
    ImageProcessingService,
    DataExtractionService,
    BallotConsumerService,
    ResultsService,
  ],
  exports: [
    BallotService,
    ImageProcessingService,
    DataExtractionService,
    ResultsService,
  ],
})
export class BallotProcessingModule {}
