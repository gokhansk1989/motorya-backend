import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFeedbackDto {
  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  page?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactEmail?: string;
}

export class UpdateFeedbackStatusDto {
  @IsIn(['NEW', 'REVIEWED', 'RESOLVED'])
  status: 'NEW' | 'REVIEWED' | 'RESOLVED';
}
