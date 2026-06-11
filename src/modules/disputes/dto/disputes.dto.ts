import { IsString, IsEnum, IsOptional, MinLength } from 'class-validator';
import { DisputeStatus } from '@prisma/client';

export class OpenDisputeDto {
  @IsString()
  orderId: string;

  @IsString()
  @MinLength(10)
  reason: string;
}

export class AddDisputeMessageDto {
  @IsString()
  @MinLength(1)
  body: string;
}

export class ResolveDisputeDto {
  @IsEnum(['RESOLVED_REFUND', 'RESOLVED_RELEASE', 'CLOSED'])
  status: 'RESOLVED_REFUND' | 'RESOLVED_RELEASE' | 'CLOSED';

  @IsOptional()
  @IsString()
  resolutionNote?: string;
}
