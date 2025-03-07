/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLocationDto {
  @ApiProperty({ example: 'LOC001' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Escuela Nacional' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'La Paz' })
  @IsString()
  @IsNotEmpty()
  department: string;

  @ApiProperty({ example: 'Murillo' })
  @IsString()
  @IsNotEmpty()
  province: string;

  @ApiProperty({ example: 'La Paz' })
  @IsString()
  @IsNotEmpty()
  municipality: string;

  @ApiProperty({ example: 'Calle Principal #123' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ example: 25 })
  @IsNumber()
  @IsOptional()
  totalTables?: number;

  @ApiProperty({ example: { latitude: -16.5, longitude: -68.15 } })
  @IsOptional()
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export class UpdateLocationDto extends CreateLocationDto {
  @ApiProperty({ example: true })
  @IsOptional()
  active?: boolean;
}