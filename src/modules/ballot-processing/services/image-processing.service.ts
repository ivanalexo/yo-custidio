/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ImageProcessingService {
    private readonly logger = new Logger(ImageProcessingService.name);
    private readonly imageProcessorUrl: string;

    constructor(private configService: ConfigService) {
        this.imageProcessorUrl = this.configService.get<string>('IMAGE_PROCESSOR_URL') ?? 'http://localhost:5000/';
    }

    async processImage(imageBuffer: Buffer): Promise<{
        processedBuffer: Buffer;
        imageHash: string;
        dimensions: { width: number; height: number};
    }> {
        try {
            const base64Image = imageBuffer.toString('base64');

            const response = await axios.post<{
                processedImage: string;
                imageHash: string;
                dimensions: { width: number; height: number };
            }>(`${this.imageProcessorUrl}/process`, {
                image: base64Image,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                }
            });;

            // Obtener resultados
            const result = response.data;

            // Convertir la imagen procesada de base64 a buffer
            const processedBuffer = Buffer.from(result.processedImage, 'base64');

            return {
                processedBuffer,
                imageHash: result.imageHash,
                dimensions: result.dimensions
      };
        } catch (error) {
            this.logger.error(`Error processing image: ${error}`);
            throw new Error(error);
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
            }
          }>(`${this.imageProcessorUrl}/process`, {
            image: base64Image
          }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            }
          });

          // Obtener resultados de validación
          return response.data.validation;
        } catch (error) {
          this.logger.error(`Error validating ballot: ${error}`, error);
          return {
            isValid: false,
            confidence: 0,
            reason: `Error técnico: ${error}`
          };
        }
      }
}