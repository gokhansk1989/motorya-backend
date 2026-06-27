import { IsString, IsOptional, IsObject, MaxLength, IsIn } from 'class-validator';

const SOURCES = ['web', 'admin'] as const;

export class CreateErrorLogDto {
  @IsIn(SOURCES)
  source: 'web' | 'admin';

  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  path?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
