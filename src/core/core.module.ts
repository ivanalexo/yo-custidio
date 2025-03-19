/* eslint-disable prettier/prettier */
// src/core/core.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitMQService } from './services/rabbitmq.service';
import { TokenService } from './services/token.service';
import { RealtimeService } from './services/realtime.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../modules/admin/schemas/user.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [RabbitMQService, TokenService, RealtimeService],
  exports: [RabbitMQService, TokenService, RealtimeService],
})
export class CoreModule {}
