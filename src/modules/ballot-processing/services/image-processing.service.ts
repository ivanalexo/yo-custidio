/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ImageProcessingService {
  private readonly logger = new Logger(ImageProcessingService.name);
  private readonly imageProcessorUrl: string;

  constructor(private configService: ConfigService) {
    this.imageProcessorUrl =
      this.configService.get<string>('app.imageProcessor.url') ??
      'http://localhost:5000/';
  }

  async processImage(imageBuffer: Buffer): Promise<{
    processedBuffer: Buffer;
    imageHash: string;
    dimensions: { width: number; height: number };
  }> {
    try {
      if (!imageBuffer) {
        throw new Error('El buffer de imagen es undefined');
      }

      if (!(imageBuffer instanceof Buffer)) {
        throw new Error(`Tipo de dato incorrecto: ${typeof imageBuffer}`);
      }

      if (imageBuffer.length === 0) {
        throw new Error('El buffer de imagen vacio');
      }
      const base64Image = imageBuffer.toString('base64');

      this.logger.log(`Enviando peticion a ${this.imageProcessorUrl}/process`);
      const response = await axios.post<{
        processedImage: string;
        imageHash: string;
        dimensions: { width: number; height: number };
      }>(
        `${this.imageProcessorUrl}/process`,
        {
          image: base64Image,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      );

      this.logger.log('Respuesta recibida del procesador');

      if (!response.data || !response.data.imageHash) {
        throw new Error('Respuesta del procesador imcompleta');
      }

      // Obtener resultados
      const result = response.data;

      if (!result.processedImage) {
        throw new Error('La imagen procesada no fue devuelta por el servicio');
      }

      this.logger.log(
        `Decodificando imagen procesada, hash: ${result.imageHash}`,
      );

      // Convertir la imagen procesada de base64 a buffer
      const processedBuffer = Buffer.from(result.processedImage, 'base64');

      return {
        processedBuffer,
        imageHash: result.imageHash,
        dimensions: result.dimensions,
      };
    } catch (error) {
      this.logger.error(`Error processing image: ${error.message}`);
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error(
          'Error procesando: ',
          error.message || JSON.stringify(error),
        );
      }
    }
  }

  async isBallotValid(imageBuffer: Buffer): Promise<{
    isValid: boolean;
    confidence: number;
    reason?: string;
  }> {
    try {
      // Convertir buffer a base64
      const base64Image = imageBuffer.toString('base64');

      // Llamar al microservicio de Python
      const response = await axios.post<{
        validation: {
          isValid: boolean;
          confidence: number;
          reason?: string;
        };
      }>(
        `${this.imageProcessorUrl}/process`,
        {
          image: base64Image,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      );

      // Obtener resultados de validación
      this.logger.log('Result process: ', response.data);
      return response.data.validation;
    } catch (error) {
      this.logger.error(`Error validating ballot: ${error}`, error);
      return {
        isValid: false,
        confidence: 0,
        reason: `Error técnico: ${error}`,
      };
    }
  }
}
