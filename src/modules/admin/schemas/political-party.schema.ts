/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { Document } from 'mongoose';
import { User } from './user.schema';

export type PoliticalPartyDocument = PoliticalParty & Document;

@Schema({ timestamps: true })
export class PoliticalParty {
  @Prop({ required: true, unique: true })
  partyId: string; // La abreviatura (ej: CC)

  @Prop({ required: true })
  fullName: string;

  @Prop()
  description: string;

  @Prop()
  logoUrl: string;

  @Prop()
  color: string;

  @Prop()
  legalRepresentative: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  createdBy: User;

  @Prop({ default: true })
  active: boolean;

  // Campos para elecciones específicas
  @Prop([
    {
      electionYear: Number,
      candidateName: String,
      position: String,
      enabled: Boolean,
    },
  ])
  electionParticipation: Array<{
    electionYear: number;
    candidateName: string;
    position: string;
    enabled: boolean;
  }>;

  createdAt: Date;
  updatedAt: Date;
}

export const PoliticalPartySchema =
  SchemaFactory.createForClass(PoliticalParty);

PoliticalPartySchema.index({ partyId: 1 });
PoliticalPartySchema.index({ fullName: 1 });
PoliticalPartySchema.index({ active: 1 });
