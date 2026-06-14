import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class ModerateListingDto {
  @IsEnum(['ACTIVE', 'REJECTED', 'ARCHIVED'])
  action: 'ACTIVE' | 'REJECTED' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  note?: string;
}

export class ModerateUserDto {
  @IsEnum(['ACTIVE', 'SUSPENDED', 'BANNED'])
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';

  @IsOptional()
  @IsString()
  note?: string;
}
