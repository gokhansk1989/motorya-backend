import { IsEnum, IsOptional, IsString, IsIn, MaxLength } from 'class-validator';
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

export class AnnouncementDto {
  @IsString()
  @MaxLength(120)
  title: string;

  @IsString()
  @MaxLength(160)
  subject: string;

  @IsString()
  @MaxLength(160)
  heading: string;

  @IsString()
  @MaxLength(6000)
  body: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ctaText?: string;

  @IsOptional()
  @IsString()
  ctaUrl?: string;

  // MARKETING: yalnizca pazarlama izni verenler. ALL: tum aktif ve
  // dogrulanmis uyeler — yalnizca hizmet duyurulari icin kullanilmali.
  @IsOptional()
  @IsIn(['MARKETING', 'ALL'])
  audience?: string;
}
