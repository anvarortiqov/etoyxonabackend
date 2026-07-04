import { IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto';

export class QueryBookingsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Holat (bitta yoki vergul bilan ajratilgan bir nechta), masalan: pending,confirmed',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '2026-04-15' })
  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hallId?: string;
}
