/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PoliticalParty,
  PoliticalPartyDocument,
} from '../schemas/political-party.schema';
import {
  CreatePoliticalPartyDto,
  UpdatePoliticalPartyDto,
} from '../dto/political-party.dto';
import { RealtimeService } from 'src/core/services/realtime.service';

@Injectable()
export class PoliticalPartyService {
  private readonly logger = new Logger(PoliticalPartyService.name);

  constructor(
    @InjectModel(PoliticalParty.name)
    private partyModel: Model<PoliticalPartyDocument>,
    private realtimeService: RealtimeService,
  ) {}

  async create(
    createPartyDto: CreatePoliticalPartyDto,
    userId: string,
  ): Promise<PoliticalParty> {
    this.logger.log(`UserId: ${userId}`);
    const newParty = new this.partyModel({
      ...createPartyDto,
      createdBy: userId,
    });

    const savedParty = await newParty.save();
    this.logger.log(`Partido politico creado: ${savedParty.partyId}`);

    await this.realtimeService.publish('parties', {
      action: 'created',
      partyId: savedParty.partyId,
      fullName: savedParty.fullName,
      timestamp: new Date(),
    });

    return savedParty;
  }

  async findAll(filter: any = {}): Promise<PoliticalParty[]> {
    const query: any = {};

    if (filter.partyId) {
      query.partyId = { $regex: filter.partyId, $options: 'i' };
    }

    if (filter.fullName) {
      query.fullName = { $regex: filter.fullName, $options: 'i' };
    }

    if (filter.active !== undefined) {
      query.active = filter.active === 'true';
    }

    if (filter.electionYear) {
      query['electionParticipation.electionYear'] = filter.electionYear;
    }

    return this.partyModel.find(query).sort({ partyId: 1 }).exec();
  }

  async findOne(id: string): Promise<PoliticalParty> {
    const party = await this.partyModel.findById(id).exec();

    if (!party) {
      throw new NotFoundException(`Partido con ID ${id} no encontrado`);
    }

    return party;
  }

  async findByPartyId(partyId: string): Promise<PoliticalParty | null> {
    return this.partyModel.findOne({ partyId }).exec();
  }

  async update(id: string, updatePartyDto: UpdatePoliticalPartyDto): Promise<PoliticalParty> {
    const updatedParty = await this.partyModel
      .findByIdAndUpdate(id, updatePartyDto, { new: true })
      .exec();

    if (!updatedParty) {
      throw new NotFoundException(`Partido con ID ${id} no encontrado`);
    }

    this.logger.log(`Partido político actualizado: ${updatedParty.partyId}`);

    return updatedParty;
  }

  async remove(id: string): Promise<void> {
    // Marcamos como inactivo en lugar de eliminar
    const party = await this.partyModel
      .findByIdAndUpdate(id, { active: false })
      .exec();

    if (!party) {
      throw new NotFoundException(`Partido con ID ${id} no encontrado`);
    }

    this.logger.log(`Partido político desactivado: ${party.partyId}`);
  }
}
