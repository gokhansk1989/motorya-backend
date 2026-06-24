import { IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const URL_OR_PATH = /^(https?:\/\/|\/)/;

export class CreateBlogPostDto {
  @IsOptional() @IsString() @MaxLength(200) @Matches(/^[a-z0-9-]+$/, { message: 'slug yalnızca küçük harf, rakam ve tire içerebilir' })
  slug?: string;

  @IsString() @MinLength(3) @MaxLength(200)
  title: string;

  @IsString() @MaxLength(500)
  excerpt: string;

  @IsString() @MinLength(1)
  content: string;

  @IsString() @MaxLength(100)
  category: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsString() @MaxLength(8)
  coverEmoji?: string;

  @IsOptional() @IsString() @MaxLength(500) @Matches(URL_OR_PATH, { message: 'coverImage geçerli bir URL/yol olmalı' })
  coverImage?: string;

  @IsOptional() @IsString() @MaxLength(100)
  author?: string;

  @IsOptional() @IsInt() @Min(1) @Max(60)
  readTime?: number;

  @IsOptional() @IsBoolean()
  published?: boolean;

  @IsOptional() @IsDateString()
  publishedAt?: string;
}

export class UpdateBlogPostDto {
  @IsOptional() @IsString() @MaxLength(200) @Matches(/^[a-z0-9-]+$/, { message: 'slug yalnızca küçük harf, rakam ve tire içerebilir' })
  slug?: string;

  @IsOptional() @IsString() @MinLength(3) @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MaxLength(500)
  excerpt?: string;

  @IsOptional() @IsString() @MinLength(1)
  content?: string;

  @IsOptional() @IsString() @MaxLength(100)
  category?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsString() @MaxLength(8)
  coverEmoji?: string;

  @IsOptional() @IsString() @MaxLength(500) @Matches(URL_OR_PATH, { message: 'coverImage geçerli bir URL/yol olmalı' })
  coverImage?: string;

  @IsOptional() @IsString() @MaxLength(100)
  author?: string;

  @IsOptional() @IsInt() @Min(1) @Max(60)
  readTime?: number;

  @IsOptional() @IsBoolean()
  published?: boolean;

  @IsOptional() @IsDateString()
  publishedAt?: string;
}
