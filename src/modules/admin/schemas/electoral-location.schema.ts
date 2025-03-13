/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
import { User } from './user.schema';

export type LocationDocument = ElectoralLocation & Document;

@Schema({ timestamps: true })
export class ElectoralLocation {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  department: string;

  @Prop({ required: true })
  province: string;

  @Prop({ required: true })
  municipality: string;

  @Prop()
  address: string;

  @Prop({ default: 0 })
  totalTables: number;

  @Prop({
    type: {
      latitude: Number,
      longitude: Number,
    },
  })
  coordinates: {
    latitude: number;
    longitude: number;
  };

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  createdBy: User;

  @Prop({ default: true })
  active: boolean;

  // Campos de timestamp automáticos
  createdAt: Date;
  updatedAt: Date;
}

export const LocationSchema = SchemaFactory.createForClass(ElectoralLocation);