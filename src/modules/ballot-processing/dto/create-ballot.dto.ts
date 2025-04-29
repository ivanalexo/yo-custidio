/* eslint-disable prettier/prettier */
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateBallotDto {
  @IsString()
  @IsNotEmpty()
  tableCode: string;

  @IsString()
  @IsOptional()
  tableNumber?: string;

  @IsString()
  @IsOptional()
  citizenId?: string;

  @IsString()
  @IsOptional()
  locationCode?: string;
}
