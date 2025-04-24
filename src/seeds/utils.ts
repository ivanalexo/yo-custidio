/* eslint-disable prettier/prettier */
import * as mongoose from 'mongoose';
import * as crypto from 'crypto';

/**
 * Genera un valor aleatorio entre min y max (inclusivo)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Genera un hash SHA-256 de una cadena
 */
export function generateHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Selecciona un elemento aleatorio de un array
 */
export function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Genera una fecha aleatoria entre dos fechas
 */
export function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
}

/**
 * Genera un nuevo ObjectId de MongoDB
 */
export function generateObjectId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId();
}

/**
 * Genera un código de mesa aleatorio
 */
export function generateTableNumber(): string {
  return randomInt(10000, 99999).toString();
}

/**
 * Genera un código de mesa similar al formato real
 */
export function generateVerificationCode(): string {
  return `${randomInt(100, 999)}-${randomInt(100, 999)}`;
}

/**
 * Genera un valor de confianza aleatorio en un rango
 */
export function generateConfidence(
  min: number = 0.3,
  max: number = 0.95,
): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}
