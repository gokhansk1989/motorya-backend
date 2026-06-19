import { IsString, IsInt, IsOptional, Min, Max } from 'class-validator';

export class CreateReviewDto {
  @IsString()
  listingId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
