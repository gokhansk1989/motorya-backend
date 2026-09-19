const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Gercek ad-soyad ile herkese acik gosterilen ad ayristirilir.
//
// Neden: ilan sayfalarinda saticinin GERCEK ad-soyadi yayinlaniyordu - olcumde
// tek bir ilan sayfasinda 4 kez geciyor, Google'in okudugu yapilandirilmis
// veride yer aliyor ve sayfa "index, follow" oldugu icin aranabilir hale
// geliyordu. Ilanda sehir de oldugundan "ad + sehir + ne sattigi" birlesip
// kisiyi hedeflenebilir kiliyordu.
//
// Yontem: 43 ayri sorguyu degistirmek yerine alanlarin anlami degisiyor.
//   displayName -> herkese acik gorunen ad (yeni uyelerde KULLANICI ADI)
//   realName    -> gercek ad-soyad; yalnizca yonetim paneli ve fatura gorur
// Boylece site ve mobil uygulama hicbir kod degisikligi olmadan dogru alani
// gostermeye devam eder.
//
// MEVCUT uyelerde gercek ad, kendileri degistirene kadar gorunen ad olarak
// kaliyor (urun karari): otomatik uretilmis "uye7k2m9" gibi adlar kotu bir
// ilk izlenim yaratirdi. Bunun bedeli, kullanici adini secmeyenlerin adinin
// yayinda kalmasi - bu yuzden hem girISTE hem de ilan verirken soruluyor.
async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "realName" TEXT;`);

  // Gercek adlari sakla. Tekrar kosarsa uzerine yazmaz: kullanici adini
  // degistirmis birinin gercek adini kullanici adiyla ezmek geri donulmez olurdu.
  const sonuc = await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "realName" = "displayName" WHERE "realName" IS NULL;`,
  );

  console.log(`\u2713 realName eklendi ve ${sonuc} kayit icin gercek ad saklandi`);
  console.log('  Gorunen adlar degistirilmedi; kullanicilar kendi secene kadar ayni kalacak.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
