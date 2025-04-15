/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsString, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested, IsHexColor } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class ElectionParticipationDto {
    @ApiProperty({ example: 2019 })
    @IsNumber()
    @IsNotEmpty()
    electionYear: number;

    @ApiProperty({ example: 'Ivan Omonte' })
    @IsString()
    @IsOptional()
    candidateName: string;

    @ApiProperty({ example: 'Presidente' })
    @IsString()
    @IsOptional()
    position: string;

    @ApiProperty({ example: true })
    @IsBoolean()
    @IsOptional()
    enabled: boolean;
}

export class CreatePoliticalPartyDto {
    @ApiProperty({ example: 'CC' })
    @IsString()
    @IsNotEmpty()
    partyId: string;

    @ApiProperty({ example: 'Comunidad Ciudadana' })
    @IsString()
    @IsNotEmpty()
    fullName: string;

    @ApiProperty({ example: 'https://example.com/logo.png' })
    @IsString()
    @IsOptional()
    logoUrl?: string;

    @ApiProperty({ example: '#2196F3' })
    @IsHexColor()
    @IsOptional()
    color?: string;

    @ApiProperty({ example: 'María García' })
    @IsString()
    @IsOptional()
    legalRepresentative?: string;

    @ApiProperty({ type: [ElectionParticipationDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ElectionParticipationDto)
    @IsOptional()
    electionParticipation?: ElectionParticipationDto[];
}

export class UpdatePoliticalPartyDto extends CreatePoliticalPartyDto {
    @ApiProperty({ example: true })
    @IsBoolean()
    @IsOptional()
    active?: boolean;
  }