const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// "Firebase FCM" etiketi yanlıştı — gerçek push altyapısı VAPID/web-push (webpush.service.ts),
// Firebase değil. Hiç yapılandırılmamış (enabled:false) olduğu için config alanlarını da
// güvenle yeni isimlere (public_key/private_key) çeviriyoruz.
async function main() {
  const row = await prisma.integration.findUnique({ where: { key: 'fcm' } });
  if (row && !row.enabled) {
    await prisma.integration.update({
      where: { key: 'fcm' },
      data: { name: 'Web Push (VAPID)', config: { public_key: '', private_key: '' } },
    });
    console.log('Migration tamamlandı: fcm entegrasyon etiketi/config alanları düzeltildi.');
  } else {
    console.log('fcm entegrasyonu zaten yapılandırılmış veya bulunamadı, atlanıyor.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
