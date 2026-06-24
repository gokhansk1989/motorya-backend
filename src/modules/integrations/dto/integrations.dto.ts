import { IsBoolean, IsObject } from 'class-validator';

export class UpdateIntegrationDto {
  @IsObject()
  config: Record<string, string>;

  @IsBoolean()
  enabled: boolean;
}
