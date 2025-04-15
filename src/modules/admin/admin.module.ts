/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './controller/auth.controller';
import { ElectoralLocationController } from './controller/electoral-location-controller';
import { PoliticalPartyController } from './controller/political-party.controller';

import { AuthService } from './services/auth.service';
import { ElectoralLocationService } from './services/electoral-location.service';
import { PoliticalPartyService } from './services/political-party.service';

import { JwtStrategy } from './strategies/jwt.strategy';

import { CoreModule } from '../../core/core.module';
import { User, UserSchema } from './schemas/user.schema';
import {
  ElectoralLocation,
  LocationSchema,
} from './schemas/electoral-location.schema';
import {
  PoliticalParty,
  PoliticalPartySchema,
} from './schemas/political-party.schema';

@Module({
  imports: [
    CoreModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: ElectoralLocation.name, schema: LocationSchema },
      { name: PoliticalParty.name, schema: PoliticalPartySchema },
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('app.jwt.secret'),
        signOptions: {
          expiresIn: configService.get('app.jwt.expirationTime', '1d'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    AuthController,
    ElectoralLocationController,
    PoliticalPartyController,
  ],
  providers: [
    AuthService,
    ElectoralLocationService,
    PoliticalPartyService,
    JwtStrategy,
  ],
  exports: [AuthService, ElectoralLocationService, PoliticalPartyService],
})
export class AdminModule {}
