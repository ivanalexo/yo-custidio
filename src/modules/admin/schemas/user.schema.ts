/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class TokenQuota {
  @Prop({ default: 10 })
  total: number;

  @Prop({ default: 10 })
  remaining: number;

  @Prop({ default: Date.now })
  resetAt: Date;
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ default: 'admin' })
  role: string;

  @Prop({ default: true })
  active: boolean;

  @Prop()
  lastLogin: Date;

  @Prop({
    type: {
      upload: { type: Object },
    },
    default: {
      upload: { total: 10, remaining: 10, resetAt: Date.now() },
    }
  })
  tokens: {
    upload: TokenQuota;
  }

  // Timestamps agregados automáticamente
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);