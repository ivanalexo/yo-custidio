/* eslint-disable prettier/prettier */
import { Controller, Post, Body, UseGuards, Get, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LoginDto, RegisterUserDto } from '../dto/auth.dto';
import { AuthService } from '../services/auth.service';

interface RequestWithUser extends Request {
    user: {
      userId: string;
      email: string;
      name: string;
      role: string;
    };
  }

@ApiTags('Administración - Autenticación')
@Controller('api/v1/admin/auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('login')
    @ApiOperation({ summary: 'Iniciar sesión' })
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Post('register')
    @ApiOperation({ summary: 'Registrar nuevo usuario' })
    //@UseGuards(AuthGuard('jwt'))
    //@ApiBearerAuth()
    async register(@Body() registerDto: RegisterUserDto) {
        return this.authService.register(registerDto);
    }

    @Get('profile')
    @ApiOperation({ summary: 'Obtener perfil de administrador' })
    @UseGuards(AuthGuard('jwt'))
    @ApiBearerAuth()
    getProfile(@Req() req: RequestWithUser) {
        return {
            id: req.user.userId,
            email: req.user.email,
            name: req.user.name,
            role: req.user.role,
        }
    }
}