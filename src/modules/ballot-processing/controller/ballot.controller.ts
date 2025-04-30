/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  Query,
  Req,
  Logger,
  ParseFilePipe,
  FileTypeValidator,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { CreateBallotDto } from '../dto/create-ballot.dto';
import { BallotService } from '../services/ballot.service';
import { TokenService } from 'src/core/services/token.service';

@ApiTags('Actas Eletorales')
@Controller('api/v1/public/ballots')
export class BallotController {
  private readonly logger = new Logger(BallotController.name);

  constructor(
    private readonly ballotService: BallotService,
    private readonly tokenService: TokenService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Subir una acta electoral' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        tableCode: {
          type: 'string',
        },
        tableNumber: {
          type: 'string',
        },
        citizenId: {
          type: 'string',
        },
        locationCode: {
          type: 'string',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadBallot(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new FileTypeValidator({ fileType: /(jpg|jpeg|png)$/ })],
        exceptionFactory: (error) => {
          return new BadRequestException(`Error al cargar archivo: ${error}`);
        },
      }),
    )
    file: Express.Multer.File,
    @Body() createBallotDto: CreateBallotDto,
    @Req() request: any,
  ) {
    this.logger.log(
      `Recibiendo acta para mesa: ${createBallotDto.tableNumber}`,
    );

    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningun archivo');
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('El archivo esta vacio o no es valido');
    }

    this.logger.log(
      `Archivo recibido: ${file.originalname}, tamanio: ${file.buffer.length}`,
    );

    const clientInfo = {
      ipAddress: request.ip || 'unknown',
      userAgent: request.headers['user-agent'] || 'unknown',
    };

    const userId = request.user?.userId; // undefined si no esta autienticado

    if (userId) {
      // Si hay usuario autenticado, verificar límite de tokens
      this.logger.log(`Usuario autenticado con ID: ${userId}`);
      const hasTokens = await this.tokenService.hasUploadTokens(userId);
      if (!hasTokens) {
        throw new UnauthorizedException(
          'Has excedido el límite de subidas. Inténtalo más tarde.',
        );
      }
    } else {
      // Si no hay usuario autenticado, verificar límite por IP
      this.logger.log(`Usuario no autenticado. IP: ${clientInfo.ipAddress}`);
      const ipAllowed = await this.tokenService.checkIpUploadLimit(
        clientInfo.ipAddress,
      );
      if (!ipAllowed) {
        throw new UnauthorizedException(
          'Has excedido el límite de subidas por IP. Inténtalo más tarde.',
        );
      }
    }

    // Procesar la subida (independientemente de si hay usuario o no)
    const result = await this.ballotService.createBallot(
      file.buffer,
      createBallotDto,
      clientInfo,
    );

    // Si hay usuario autenticado y la subida fue exitosa, consumir token
    if (result.status === 'RECEIVED' && userId) {
      await this.tokenService.consumeUploadToken(userId);
    }

    return result;
  }

  @Get(':trackingId')
  @ApiOperation({ summary: 'Consultar estado de procesamiento de acta ' })
  @ApiParam({ name: 'trackingId', description: 'ID de seguimiento de acta' })
  async getBallotStatus(@Param('trackingId') trackingId: string) {
    this.logger.log(`Consultando estado de acta con ID: ${trackingId}`);
    return this.ballotService.getBallotStatus(trackingId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar actas electorales con filtros' })
  @ApiQuery({ name: 'tableNumber', required: false })
  @ApiQuery({ name: 'status', required: false })
  async listBallots(
    @Query('tableNumber') tableNumber?: string,
    @Query('status') status?: string,
  ) {
    this.logger.log('Consultando listado de actas electorales');
    return await this.ballotService.listBallots({ tableNumber, status });
  }
}
