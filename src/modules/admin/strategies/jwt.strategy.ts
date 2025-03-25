/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { ConfigService } from '@nestjs/config';
import { UserData } from '../services/auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private configService: ConfigService,
        @InjectModel(User.name) private userModel: Model<UserDocument>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('app.jwt.secret')!,
        });
    }

    async validate(payload: UserData) {
        const user = await this.userModel.findById(payload.sub).exec();

        if (!user || !user.active) {
            throw new UnauthorizedException();
        }

        return {
            userId: payload.id,
            email: payload.email,
            name: payload.name,
            role: payload.role,
        }
    }
}
