/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ElectoralLocation,
  LocationDocument,
} from '../schemas/electoral-location.schema';
import {
  CreateLocationDto,
  UpdateLocationDto,
} from '../dto/electoral-location.dto';
import { RealtimeService } from 'src/core/services/realtime.service';

@Injectable()
export class ElectoralLocationService {
  private readonly logger = new Logger(ElectoralLocationService.name);

  constructor(
    @InjectModel(ElectoralLocation.name)
    private locationModel: Model<LocationDocument>,
    private realtimeService: RealtimeService,
  ) {}

  async create(
    createLocationDto: CreateLocationDto,
    userId: string,
  ): Promise<ElectoralLocation> {
    const newLocation = new this.locationModel({
      ...createLocationDto,
      createdBy: userId,
    });

    const savedLocation = await newLocation.save();
    this.logger.log(`Recinto electoral creado: ${savedLocation.code}`);

    // podriamos quitar esto de la DB cache...
    await this.realtimeService.publish('locations', {
      action: 'created',
      locationId: savedLocation._id,
      code: savedLocation.code,
      name: savedLocation.name,
      timestamp: new Date(),
    });

    return savedLocation;
  }

  async findAll(filters: any = {}): Promise<ElectoralLocation[]> {
    const query: any = {};

    if (filters.department) {
      query.department = filters.department;
    }

    if (filters.province) {
      query.province = filters.province;
    }

    if (filters.municipality) {
      query.municipality = filters.municipality;
    }

    if (filters.active !== undefined) {
      query.active = filters.active === 'true';
    }

    return this.locationModel
      .find(query)
      .sort({ department: 1, province: 1, name: 1 })
      .exec();
  }

  async findOne(id: string): Promise<ElectoralLocation> {
    const location = await this.locationModel.findById(id).exec();

    if (!location) {
      throw new NotFoundException(`Recinto con ID ${id} no encontrado`);
    }

    return location;
  }

  async update(
    id: string,
    updateLocationDto: UpdateLocationDto,
  ): Promise<ElectoralLocation> {
    const updatedLocation = await this.locationModel
      .findByIdAndUpdate(id, updateLocationDto, { new: true })
      .exec();

    if (!updatedLocation) {
      throw new NotFoundException(`Recinto con ID ${id} no encontrado`);
    }

    this.logger.log(`Recinto electoral actualizado: ${updatedLocation.code}`);

    return updatedLocation;
  }

  async remove(id: string): Promise<void> {
    // En lugar de borrar, marcamos como inactivo
    const result = await this.locationModel
      .findByIdAndUpdate(id, { active: false })
      .exec();

    if (!result) {
      throw new NotFoundException(`Recinto con ID ${id} no encontrado`);
    }

    this.logger.log(`Recinto electoral desactivado: ${id}`);
  }

  async getDepartments(): Promise<string[]> {
    const departments = await this.locationModel.distinct('department').exec();
    return departments.sort();
  }

  async getProvinces(department?: string): Promise<string[]> {
    const query = department ? { department } : {};
    const provinces = await this.locationModel
      .distinct('province', query)
      .exec();
    return provinces.sort();
  }

  async getMunicipalities(
    department?: string,
    province?: string,
  ): Promise<string[]> {
    const query: any = {};

    if (department) {
      query.department = department;
    }

    if (province) {
      query.province = province;
    }

    const municipalities = await this.locationModel
      .distinct('municipality', query)
      .exec();
    return municipalities.sort();
  }
}
