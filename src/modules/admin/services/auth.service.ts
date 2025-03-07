/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../schemas/user.schema';
import { LoginDto, RegisterUserDto } from '../dto/auth.dto';

export interface UserData {
    id: string;
    email: string;
    name: string;
    role: string;
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        private jwtService: JwtService,
    ) {}

    async validateUser(email: string, password: string): Promise<UserData> {
        const user = await this.userModel.findOne({ email }).exec();

        if (!user) {
            throw new UnauthorizedException('Credenciales inválidas');
        }

        if (!user.active) {
            throw new UnauthorizedException('Usuario desactivado');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Credenciales inválidas');
        }

        user.lastLogin = new Date();
        await user.save();

        return {
            id: user._id as string,
            email: user.email,
            name: user.name,
            role: user.role,
        };
    }

    async login(loginDto: LoginDto) {
        const user = await this.validateUser(loginDto.email, loginDto.password);

        const payload = {
            sub: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        }

        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
        };
    }

    async register(registerDto: RegisterUserDto) {
        const existingUser = await this.userModel.findOne({ email: registerDto.email }).exec();

        if (existingUser) {
            throw new UnauthorizedException('El correo ya está registrado');
        }

        const hashedPassword = await bcrypt.hash(registerDto.password, 10);

        const newUser = new this.userModel({
            name: registerDto.name,
            email: registerDto.email,
            password: hashedPassword,
            role: 'admin',
            active: true,
        });

        const savedUser = await newUser.save();

        this.logger.log(`Nuevo usuario registrado: ${savedUser.email}`);

        return {
            id: savedUser._id,
            name: savedUser.name,
            email: savedUser.email,
            role: savedUser.role,
        };
    }
}
