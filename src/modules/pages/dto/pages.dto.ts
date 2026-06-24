import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateStaticPageDto {
  @IsOptional() @IsString() @MaxLength(200) @Matches(/^[a-z0-9-]+$/, { message: 'slug yalnızca küçük harf, rakam ve tire içerebilir' })
  slug?: string;

  @IsString() @MinLength(3) @MaxLength(200)
  title: string;

  @IsString() @MinLength(1)
  content: string;

  @IsOptional() @IsBoolean()
  published?: boolean;
}

export class UpdateStaticPageDto {
  @IsOptional() @IsString() @MaxLength(200) @Matches(/^[a-z0-9-]+$/, { message: 'slug yalnızca küçük harf, rakam ve tire içerebilir' })
  slug?: string;

  @IsOptional() @IsString() @MinLength(3) @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MinLength(1)
  content?: string;

  @IsOptional() @IsBoolean()
  published?: boolean;
}
