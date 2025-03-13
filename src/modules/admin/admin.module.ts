/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './controller/auth.controller';
import { ElectoralLocationController } from './controller/electoral-location-controller';

import { AuthService } from './services/auth.service';
import { ElectoralLocationService } from './services/electoral-location.service';

import { JwtStrategy } from './strategies/jwt.strategy';

import { User, UserSchema } from './schemas/user.schema';
import { ElectoralLocation, LocationSchema } from './schemas/electoral-location.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: ElectoralLocation.name, schema: LocationSchema },
        ]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('app.jwt.secret'),
                signOptions: {
                    expiresIn: configService.get('app.jwt.expirationTime', '1d')
                },
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [AuthController, ElectoralLocationController],
    providers: [AuthService, ElectoralLocationService, JwtStrategy],
    exports: [AuthService, ElectoralLocationService],
})
export class AdminModule {}
