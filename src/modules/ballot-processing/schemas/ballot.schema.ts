import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BallotDocument = Ballot & Document;

@Schema({ timestamps: true }) // Esto añade automáticamente createdAt y updatedAt
export class Location {
  @Prop()
  department: string;

  @Prop()
  province: string;

  @Prop()
  locality: string;

  @Prop()
  pollingPlace: string;
}

@Schema({ timestamps: true })
export class Party {
  @Prop({ required: true })
  partyId: string;

  @Prop({ required: true })
  votes: number;
}

@Schema({ timestamps: true })
export class Ballot {
  @Prop({ required: true })
  tableCode: string;

  @Prop({ required: true })
  tableNumber: string;

  @Prop()
  locationId: string;

  @Prop({ type: Object })
  location: {
    department?: string;
    province?: string;
    municipality?: string;
    locality?: string;
    pollingPlace?: string;
  };

  @Prop({ type: Number, default: 0, min: 0, max: 1 })
  confidence: number;

  @Prop({ type: Boolean, default: false })
  needsHumanVerification: boolean;

  @Prop()
  verificationCode: string;

  @Prop()
  imageUrl: string;

  @Prop()
  imageHash: string;

  @Prop({
    type: {
      stage: String,
      error: String,
      confidenceScore: Number,
    },
  })
  processingStatus: {
    stage: string;
    error?: string;
    confidenceScore?: number;
  };

  @Prop({
    type: {
      validVotes: Number,
      nullVotes: Number,
      blankVotes: Number,
      partyVotes: [{ partyId: String, votes: Number }],
    },
  })
  votes: {
    validVotes: number;
    nullVotes: number;
    blankVotes: number;
    partyVotes: Array<{ partyId: string; votes: number }>;
  };

  @Prop({
    type: {
      submitterId: String,
      ipAddress: String,
      userAgent: String,
      geolocation: {
        latitude: Number,
        longitude: Number,
      },
    },
  })
  metadata: {
    submitterId?: string;
    ipAddress?: string;
    userAgent?: string;
    geolocation?: {
      latitude: number;
      longitude: number;
    };
  };

  @Prop([
    {
      status: String,
      verifiedBy: String,
      verifiedAt: Date,
      notes: String,
    },
  ])
  verificationHistory: Array<{
    status: string;
    verifiedBy?: string;
    verifiedAt: Date;
    notes?: string;
  }>;

  // Timestamps que se añaden automáticamente con { timestamps: true }
  createdAt: Date;
  updatedAt: Date;
}

export const BallotSchema = SchemaFactory.createForClass(Ballot);

// Crear índices para mejorar el rendimiento
BallotSchema.index({ tableCode: 1 });
BallotSchema.index({ tableNumber: 1 });
BallotSchema.index({ 'processingStatus.stage': 1 });
BallotSchema.index({ verificationCode: 1 });
BallotSchema.index({ imageHash: 1 });
BallotSchema.index({ updatedAt: -1 }); // Para consultas ordenadas por fecha
