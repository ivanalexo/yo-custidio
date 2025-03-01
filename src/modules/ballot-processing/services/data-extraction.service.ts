/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface BallotData {
    tableNumber: string;
    votes: {
        validVotes: number;
        nullVotes: number;
        blankVotes: number;
        partyVotes: Array<{ partyId: string; votes: number }>;
    };
}

@Injectable()
export class DataExtractionService {
    private readonly logger = new Logger(DataExtractionService.name);
    private readonly anthropicApiKey: string;
    private readonly anthropicApiUrl: string = 'https://api.anthropic.com/v1/messages';
    private readonly model: string = 'claude-3-5-sonnet-20241022';

    constructor(private configService: ConfigService) {
        this.anthropicApiKey = this.configService.get<string>('ANTHROPIC_API_KEY') || '';
    }

    // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unused-vars
    async extractDataFromBallot(imageBuffer: Buffer): Promise<{
        tableNumber: string;
        votes: {
            validVotes: number;
            nullVotes: number;
            blankVotes: number;
            partyVotes: Array<{ partyId: string; votes: number }>;
        };
        success: boolean;
        errorMessage?: string;
    }> {
        try {
            const base64Image = imageBuffer.toString('base64');

            const prompt = this.createExtractionPrompt();

            const response = await axios.post(
                this.anthropicApiUrl,
                {
                    model: this.model,
                    max_tokens: 4096,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: prompt,
                                },
                                {
                                    type: 'image',
                                    source: {
                                        type: 'base64',
                                        media_type: 'image/jpeg',
                                        data: base64Image,
                                    },
                                },
                            ],
                        },
                    ],
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': this.anthropicApiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    timeout: 60000,
                }
            );

            if (!response.data || !response.data.content || !response.data.content[0]) {
                throw new Error('Respuesta de Anthropic incompleta o con formato incorrecto');
            }
            this.logger.log('Extracted data: ', response.data.content[0].text);
            const extractedData = this.parseAnthropicResponse(response.data.content[0].text);

            return {
                ...extractedData,
                success: true,
            };
        } catch (error) {
            this.logger.error(`Error ${error}`);
            return {
                tableNumber: '',
                votes: {
                    validVotes: 0,
                    nullVotes: 0,
                    blankVotes: 0,
                    partyVotes: [],
                },
                success: false,
                errorMessage: 'Failed to extract data',
            };
        }
    }

    private createExtractionPrompt(): string {
        return `
        Por favor, extrae la siguiente información de esta imagen:

        1. Código/Número de mesa
        Solo de la sección que dice PRESIDENTE/A
        2. Información de votos:
           - Votos válidos (total)
           - Votos nulos
           - Votos blancos
           - Votos por partido político (para cada partido con su sigla correspondiente)

        Proporciona solo los números extraídos, sin explicaciones adicionales, en formato JSON con la siguiente estructura:

        {
          "tableNumber": "string",
          "votes": {
            "validVotes": number,
            "nullVotes": number,
            "blankVotes": number,
            "partyVotes": [
              {
                "partyId": "string", // Sigla del partido (ej: CC, MAS-IPSP)
                "votes": number
              }
            ]
          }
        }

        Incluye SOLO datos que puedas ver claramente en la imagen. Si no puedes ver algún valor, déjalo como null o 0.
        `;
    }

    private parseAnthropicResponse(response: string): BallotData {
        try {
          // Extraer el JSON de la respuesta
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('No se encontró JSON válido en la respuesta');
          }
          
          const jsonStr = jsonMatch[0];
          const data = JSON.parse(jsonStr) as BallotData;

          // Validar el formato de datos
          if (!data.tableNumber || !data.votes) {
            throw new Error('Formato de datos incompleto');
          }

          return data;
        } catch (error) {
          this.logger.error(`Error parsing Anthropic response: ${error}`);
          throw new Error(`Failed to parse extraction result: ${error}`);
        }
      }
}