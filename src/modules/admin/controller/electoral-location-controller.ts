/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ElectoralLocationService } from '../services/electoral-location.service';
import {
  CreateLocationDto,
  UpdateLocationDto,
} from '../dto/electoral-location.dto';

@ApiTags('Administración - Recintos Electorales')
@Controller('api/v1/admin/locations')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ElectoralLocationController {
  constructor(private readonly locationService: ElectoralLocationService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo recinto electoral' })
  create(@Body() createLocationDto: CreateLocationDto, @Req() req: any) {
    return this.locationService.create(createLocationDto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar recintos electorales' })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'province', required: false })
  @ApiQuery({ name: 'municipality', required: false })
  @ApiQuery({ name: 'active', required: false, enum: ['true', 'false'] })
  findAll(
    @Query('department') department?: string,
    @Query('province') province?: string,
    @Query('municipality') municipality?: string,
    @Query('active') active?: string,
  ) {
    return this.locationService.findAll({
      department,
      province,
      municipality,
      active,
    });
  }

  @Get('departments')
  @ApiOperation({ summary: 'Obtener lista de departamentos' })
  getDepartments() {
    return this.locationService.getDepartments();
  }

  @Get('provinces')
  @ApiOperation({ summary: 'Obtener lista de provincias' })
  @ApiQuery({ name: 'department', required: false })
  getProvinces(@Query('department') department?: string) {
    return this.locationService.getProvinces(department);
  }

  @Get('municipalities')
  @ApiOperation({ summary: 'Obtener lista de municipios' })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'province', required: false })
  getMunicipalities(
    @Query('department') department?: string,
    @Query('province') province?: string,
  ) {
    return this.locationService.getMunicipalities(department, province);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de recinto' })
  findOne(@Param('id') id: string) {
    return this.locationService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar recinto' })
  update(
    @Param('id') id: string,
    @Body() updateLocationDto: UpdateLocationDto,
  ) {
    return this.locationService.update(id, updateLocationDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar recinto' })
  remove(@Param('id') id: string) {
    return this.locationService.remove(id);
  }
}
