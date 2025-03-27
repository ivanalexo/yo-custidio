/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import { RabbitMQService } from './core/services/rabbitmq.service';
import appConfig from './config/app.config';
import { BallotProcessingModule } from './modules/ballot-processing/ballot-processing.module';
import { AdminModule } from './modules/admin/admin.module';
import { CoreModule } from './core/core.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),

    // Database
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('app.database.uri'),
      }),
      inject: [ConfigService],
    }),
    // Redis/Bull Queue
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('app.redis.host', 'localhost'),
        port: configService.get<number>('app.redis.port', 6379),
        ttl: 60 * 60 * 24,
      }),
      inject: [ConfigService],
      isGlobal: true,
    }),
    CoreModule,
    BallotProcessingModule,
    AdminModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AppModule {}