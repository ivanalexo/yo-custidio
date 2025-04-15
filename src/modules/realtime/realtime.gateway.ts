/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RealtimeService } from '../../core/services/realtime.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private realtimeService: RealtimeService) {}

  async onModuleInit() {
    // suscribirse a los canales de redis
    await this.realtimeService.subscribe('results', (data) => {
      this.server.emit('results:update', data);
    });

    await this.realtimeService.subscribe('stats', (data) => {
      this.server.emit('stats:update', data);
    });

    await this.realtimeService.subscribe('processing', (data: any) => {
      this.server.emit('processing:update', data);

      this.server.to(`ballot${data.ballotId}`).emit('status:update', data);
    });

    await this.realtimeService.subscribe('locations', (data) => {
      this.server.emit('locations:update', data);
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('subscribe:ballot')
  async handleSubscribeBallot(client: Socket, data: { ballotId: string }) {
    await client.join(`ballot:${data.ballotId}`);
    this.logger.log(
      `Cliente ${client.id} se suscribio al acta ${data.ballotId}`,
    );
  }

  @SubscribeMessage('unsubscribe:ballot')
  async handleUnsubscribeBallot(client: Socket, data: { ballotId: string }) {
    await client.leave(`ballot:${data.ballotId}`);
    this.logger.log(
      `Cliente ${client.id} se desuscribio del acta ${data.ballotId}`,
    );
  }
}
