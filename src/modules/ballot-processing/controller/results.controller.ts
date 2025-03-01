/* eslint-disable prettier/prettier */
// src/modules/ballot-processing/controllers/results.controller.ts
import { Controller, Get, Query, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ResultsService } from '../services/results.service';

@ApiTags('Resultados Electorales')
@Controller('api/v1/public/results')
export class ResultsController {
  private readonly logger = new Logger(ResultsController.name);

  constructor(private readonly resultsService: ResultsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener resultados globales agrupados' })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'province', required: false })
  @ApiQuery({ name: 'municipality', required: false })
  async getResults(
    @Query('department') department?: string,
    @Query('province') province?: string,
    @Query('municipality') municipality?: string,
  ) {
    this.logger.log('Consultando resultados globales');
    return this.resultsService.getAggregatedResults({
      department,
      province,
      municipality,
    });
  }

  @Get('tables/:tableNumber')
  @ApiOperation({ summary: 'Obtener resultados para una mesa específica' })
  async getTableResults(@Param('tableNumber') tableNumber: string) {
    this.logger.log(`Consultando resultados para mesa: ${tableNumber}`);
    return this.resultsService.getTableResults(tableNumber);
  }

  @Get('parties')
  @ApiOperation({ summary: 'Obtener resultados agrupados por partido político' })
  async getResultsByParty() {
    this.logger.log('Consultando resultados por partido político');
    return this.resultsService.getResultsByParty();
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Obtener estadísticas del sistema' })
  async getStatistics() {
    this.logger.log('Consultando estadísticas del sistema');
    return this.resultsService.getSystemStatistics();
  }
}
