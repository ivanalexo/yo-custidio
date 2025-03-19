/* eslint-disable prettier/prettier */
import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT || '3000', 10) || 3000,
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  database: {
    uri: process.env.MONGODB_URI,
  },
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    queue: process.env.RABBITMQ_QUEUE || 'ballot_processing',
    queues: {
        imageProcessing: 'image_processing_queue',
        ocrProcessing: 'ocr_processing_queue',
        dataValidation: 'data_validation_queue',
        resultAggregation: 'result_aggregation_queue',
        results: process.env.RABBITMQ_QUEUE_RESULTS || 'results_queue',
    },
    exchanges: {
        ballotProcessing: 'ballot_processing_exchange',
        notifications: 'notifications_exchange',
    }
  },
  cache: {
    enabled: process.env.CACHE_ENABLED === "true",
    ttl: parseInt(process.env.CACHE_TTL || '300', 10),
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219'
  },
  imageProcessor: {
    url: process.env.IMAGE_PROCESSOR_URL || 'http://image-processor:5000'
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expirationTime: process.env.JWT_EXPIRATION,
  },
  cors: {
    enabled: process.env.CORS_ENABLED === 'true',
    origin: process.env.CORS_ORIGINS?.split(',') || [],
  },
}));
