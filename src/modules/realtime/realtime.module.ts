/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { CoreModule } from '../../core/core.module';

@Module({
  imports: [CoreModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
