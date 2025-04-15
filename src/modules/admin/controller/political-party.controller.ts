/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Controller, Get, Post, Body, Param, Put, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PoliticalPartyService } from '../services/political-party.service';
import { CreatePoliticalPartyDto, UpdatePoliticalPartyDto } from '../dto/political-party.dto';

@ApiTags('Administación - Partidos Políticos')
@Controller('api/v1/admin/parties')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class PoliticalPartyController {
    constructor(private readonly partyService: PoliticalPartyService) {}

    @Post()
    @ApiOperation({ summary: 'Crear un nuevo partido politico' })
    create(@Body() createPartyDto: CreatePoliticalPartyDto, @Req() req: any) {
        console.log('UserId:', req);
        return this.partyService.create(createPartyDto, req.user.userId);
    }

    @Get()
    @ApiOperation({ summary: 'Listar partidos politicos' })
    @ApiQuery({ name: 'partyId', required: false })
    @ApiQuery({ name: 'fullName', required: false })
    @ApiQuery({ name: 'active', required: false, enum: ['true', 'false'] })
    @ApiQuery({ name: 'electionYear', required: false })
    findAll(
      @Query('partyId') partyId?: string,
      @Query('fullName') fullName?: string,
      @Query('active') active?: string,
      @Query('electionYear') electionYear?: number,
    ) {
      return this.partyService.findAll({ partyId, fullName, active, electionYear });
    }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de partido político' })
  findOne(@Param('id') id: string) {
    return this.partyService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar partido político' })
  update(@Param('id') id: string, @Body() updatePartyDto: UpdatePoliticalPartyDto) {
    return this.partyService.update(id, updatePartyDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar partido político' })
  remove(@Param('id') id: string) {
    return this.partyService.remove(id);
  }
}