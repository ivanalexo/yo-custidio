/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from '@nestjs/cache-manager';
import { UserDocument } from 'src/modules/admin/schemas/user.schema';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly defaultUploadTokens: number;
  private readonly resetInterval: number;

  constructor(
    @InjectModel('User') private userModel: Model<UserDocument>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private configService: ConfigService,
  ) {
    this.defaultUploadTokens = this.configService.get<number>(
      'app.tokens.upload.default',
      10,
    );
    this.resetInterval = this.configService.get<number>(
      'app.tokens.upload.resetInterval',
      24 * 60 * 60 * 1000,
    );
  }

  // verificar si un usuario tiene tokens disponibles para subir imagenes

  async hasUploadTokens(userId: string): Promise<boolean> {
    if (!userId) {
      return true;
    }

    const cacheKey = `tokens:${userId}:upload`;

    let tokens = await this.cacheManager.get<any>(cacheKey);

    if (tokens === undefined) {
      const user = await this.userModel.findById(userId).exec();

      if (!user) {
        this.logger.warn(`Usuario no encontrado: ${userId}`);
        return false;
      }

      // iniciar tokens si no existe
      if (!user.tokens || !user.tokens.upload) {
        await this.userModel
          .findByIdAndUpdate(userId, {
            $set: {
              'tokens.upload': {
                total: this.defaultUploadTokens,
                remaining: this.defaultUploadTokens,
                resetAt: new Date(),
              },
            },
          })
          .exec();

        tokens = {
          total: this.defaultUploadTokens,
          remaining: this.defaultUploadTokens,
          resetAt: new Date(),
        };
      } else {
        tokens = user.tokens.upload;

        const now = new Date();
        const resetAt = new Date(tokens.resetAt);
        if (now.getTime() - resetAt.getTime() > this.resetInterval) {
          await this.resetUploadTokens(userId);
          tokens.remaining = this.defaultUploadTokens;
          tokens.resetAt = now;
        }
      }

      // guardar en cache
      await this.cacheManager.set(cacheKey, tokens, 60 * 5 * 1000);
    }

    return tokens.remaining > 0;
  }

  // consume un token de subida para el usuario
  async consumeUploadToken(userId: string): Promise<boolean> {
    if (!userId) {
      return true;
    }

    const cacheKey = `tokens:${userId}:upload`;

    const hasTokens = await this.hasUploadTokens(userId);
    if (!hasTokens) {
      return false;
    }

    const tokens = await this.cacheManager.get<any>(cacheKey);

    // decrementar token
    tokens.remaining--;

    // actualizar cache
    await this.cacheManager.set(cacheKey, tokens, 60 * 5 * 1000);

    this.userModel
      .findByIdAndUpdate(userId, { $inc: { 'tokens.upload.remaining': -1 } })
      .exec()
      .catch((err) => this.logger.error(`Error actualizando tokens: ${err}`));

    return true;
  }

  /**
   * Resetea los tokens de subida para un usuario
   */
  async resetUploadTokens(userId: string): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, {
        $set: {
          'tokens.upload.remaining': this.defaultUploadTokens,
          'tokens.upload.resetAt': new Date(),
        },
      })
      .exec();

    // actualizar cache
    const cacheKey = `tokens:${userId}:upload`;
    await this.cacheManager.del(cacheKey);
  }

  /**
   * Obtener informacion de tokens de un usuario
   */
  async getTokenInfo(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId).exec();
    if (!user || !user.tokens || !user.tokens.upload) {
      return {
        upload: {
          total: this.defaultUploadTokens,
          remaining: this.defaultUploadTokens,
          resetAt: new Date(),
        },
      };
    }

    return {
      upload: user.tokens.upload,
    };
  }

  /**
   * Proteccion basica contra abusos para usuarios no autenticados
   * Solo limita subidas excesivas desde una misma IP
   */
  async checkIpUploadLimit(ip: string): Promise<boolean> {
    const cacheKey = `ratelimit:${ip}:upload`;
    let count = (await this.cacheManager.get<number>(cacheKey)) || 0;

    if (count === undefined) {
      count = 0;
    }

    // limite basico por IP (5 subidas/hora)
    const limit = this.configService.get<number>('app.rateLimit.upload', 5);
    if (count >= limit) {
      return false;
    }

    await this.cacheManager.set(cacheKey, count + 1, 60 * 60 * 1000);
    return true;
  }
}
