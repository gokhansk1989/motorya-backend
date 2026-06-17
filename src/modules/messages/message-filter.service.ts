import { Injectable, BadRequestException } from '@nestjs/common';

// Türkçe argo/küfür kelimeleri — kök haliyle, ekler de yakalanır.
const PROFANITY_WORDS = [
  'amk', 'aq', 'amına', 'amcık', 'orospu', 'oç', 'piç', 'yarrak', 'yarak',
  'siktir', 'sik', 'göt', 'ibne', 'gerizekalı', 'şerefsiz',
  'pezevenk', 'kahpe', 'puşt', 'döl', 'taşşak', 'taşak', 'sürtük',
  'yavşak', 'gavat', 'dalyarak', 'ananı sik', 'amına koy',
  'yarrağ', 'sikik', 'siktiğim', 'şıllık', 'kancık', 'fahişe',
  // İngilizce — sık karşılaşılan argo/küfürler
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'bastard', 'cunt',
  'slut', 'whore', 'dick', 'pussy', 'motherfucker',
];

// Rakip platform isimleri — platform dışına yönlendirmeyi tespit etmek için.
const COMPETITOR_PLATFORMS = [
  'sahibinden', 'dolap', 'gardrobe', 'gardrops', 'letgo', 'dolapfresh',
  'vinted', 'trendyol', 'hepsiburada', 'n11', 'gittigidiyor', 'çıngırdak',
  'shopier', 'facebook market', 'instagram', 'ebay', 'amazon',
];

// Telefon numarası / WhatsApp paylaşımı kalıpları (platform dışı iletişime geçişi engellemek için).
const PHONE_REGEX = /(\+?90[\s.-]?)?0?\s?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/;
const WHATSAPP_HINT_REGEX = /\b(wp|whatsapp|whats app)\b/i;

function normalize(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[i̇]/g, 'i')
    .replace(/[^a-z0-9çğıöşü\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class MessageFilterService {
  assertClean(body: string): void {
    const normalized = normalize(body);

    for (const word of PROFANITY_WORDS) {
      if (normalized.includes(word)) {
        throw new BadRequestException('Mesajında uygunsuz/argo ifade tespit edildi. Lütfen düzenleyip tekrar gönder.');
      }
    }

    for (const platform of COMPETITOR_PLATFORMS) {
      if (normalized.includes(platform)) {
        throw new BadRequestException('Mesajın başka bir platforma yönlendirme içeriyor. Alışverişler Motorya üzerinden güvenle tamamlanmalı.');
      }
    }

    if (PHONE_REGEX.test(body) || WHATSAPP_HINT_REGEX.test(body)) {
      throw new BadRequestException('Telefon numarası veya platform dışı iletişim bilgisi paylaşımı yasak. Alıcı koruması yalnızca Motorya üzerinden geçerlidir.');
    }
  }
}
