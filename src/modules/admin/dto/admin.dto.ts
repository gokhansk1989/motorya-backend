import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserStatus, UserRole, ReportStatus } from '@prisma/client';

export class ModerateListingDto {
  @IsEnum(['ACTIVE', 'REJECTED', 'ARCHIVED'])
  action: 'ACTIVE' | 'REJECTED' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ModerateUserDto {
  @IsEnum(['ACTIVE', 'SUSPENDED', 'BANNED'])
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ChangeRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

export class UpdateReportStatusDto {
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
