import { IsString, IsNumber, IsPositive, IsOptional, MaxLength } from 'class-validator';

export class CreateOfferDto {
  @IsString()
  listingId: string;

  // class-validator'ın varsayılan metinleri İngilizce; teklif kutusunda
  // doğrudan kullanıcıya gösteriliyor.
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Teklif tutarı geçerli bir sayı olmalı (en fazla 2 ondalık)' })
  @IsPositive({ message: 'Teklif tutarı sıfırdan büyük olmalı' })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Mesaj en fazla 300 karakter olabilir' })
  message?: string;
}

export class RespondOfferDto {
  @IsString()
  action: 'ACCEPTED' | 'REJECTED';
}

export class CounterOfferDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Karşı teklif geçerli bir sayı olmalı (en fazla 2 ondalık)' })
  @IsPositive({ message: 'Karşı teklif sıfırdan büyük olmalı' })
  counterAmount: number;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Mesaj en fazla 300 karakter olabilir' })
  counterMessage?: string;
}
