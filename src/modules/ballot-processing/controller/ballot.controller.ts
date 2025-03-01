/* eslint-disable prettier/prettier */
import { Controller, Post, Get, Param, Body, UseInterceptors, UploadedFile, Query, Req, Logger, ParseFilePipe, FileTypeValidator, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { CreateBallotDto } from '../dto/create-ballot.dto';
import { BallotService } from '../services/ballot.service';

@ApiTags('Actas Eletorales')
@Controller('api/v1/public/ballots')
export class BallotController {
    private readonly logger = new Logger(BallotController.name);

    constructor(private readonly ballotService: BallotService) {}

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
    @UseInterceptors(
        FileInterceptor('file'))
    async uploadBallot(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new FileTypeValidator({ fileType: /(jpg|jpeg|png)$/ }),
                ],
                exceptionFactory: (error) => {
                    return new BadRequestException(`Error al cargar archivo: ${error}`);
                }
            })
        ) file: Express.Multer.File,
        @Body() createBallotDto: CreateBallotDto,
        @Req() request: Request,
    ) {
        this.logger.log(`Recibiendo acta para mesa: ${createBallotDto.tableNumber}`);

        const clientInfo = {
            ipAddress: request.ip || 'unknown',
            userAgent: request.headers['user-agent'] || 'unknown',
        };

        return this.ballotService.createBallot(file.buffer, createBallotDto, clientInfo);
    }

    @Get(':trackingId')
    @ApiOperation({ summary: 'Consultar estado de procesamiento de acta '})
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
      return  await this.ballotService.listBallots({ tableNumber, status });
    }
}