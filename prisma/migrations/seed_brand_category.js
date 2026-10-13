/**
 * Marka - kategori eslemesini veritabanina yazar.
 *
 * TEKRAR KOSULABILIR: mevcut satirlari bozmaz, eksikleri ekler. Panelden
 * elle yapilan eklemeler SILINMEZ - betik yalnizca ekler, cikarmaz. Bir
 * eslemeyi kaldirmak isteyen panelden kaldirir; betigi tekrar kosmak onu
 * geri getirmez cunku kurator listesinden de cikarilmis olmasi gerekir.
 *
 * Kullanim:
 *   DATABASE_URL=... node prisma/migrations/seed_brand_category.js
 *   DATABASE_URL=... node prisma/migrations/seed_brand_category.js --kuru
 *
 * --kuru: hicbir sey yazmaz, ne yapacagini ve eslesmeyenleri raporlar.
 */
const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../../node_modules/@prisma/client'));
const { ESLEME } = require('./brand-category-esleme.js');

const kuru = process.argv.includes('--kuru');
const p = new PrismaClient();

async function main() {
  const markalar = await p.brand.findMany({ select: { id: true, name: true } });
  const kategoriler = await p.category.findMany({ select: { id: true, slug: true } });

  // Marka adlari kurator listesinde elle yazildi; buyuk/kucuk harf ve
  // bosluk farki yuzunden eslesmemeleri sessiz bir veri kaybi olurdu.
  const markaIndeks = new Map(markalar.map((m) => [m.name.toLocaleLowerCase('tr'), m.id]));
  const katIndeks = new Map(kategoriler.map((c) => [c.slug, c.id]));

  const satirlar = [];
  const bulunamayanMarka = new Set();
  const bulunamayanKategori = [];

  for (const [slug, adlar] of Object.entries(ESLEME)) {
    const categoryId = katIndeks.get(slug);
    if (!categoryId) { bulunamayanKategori.push(slug); continue; }
    for (const ad of new Set(adlar)) {
      const brandId = markaIndeks.get(ad.toLocaleLowerCase('tr'));
      if (!brandId) { bulunamayanMarka.add(ad); continue; }
      satirlar.push({ brandId, categoryId });
    }
  }

  console.log(`marka: ${markalar.length}, kategori: ${kategoriler.length}`);
  console.log(`yazilacak esleme: ${satirlar.length}`);
  if (bulunamayanKategori.length) console.log('BULUNAMAYAN KATEGORI:', bulunamayanKategori.join(', '));
  if (bulunamayanMarka.size) console.log('BULUNAMAYAN MARKA:', [...bulunamayanMarka].join(', '));

  if (kuru) { console.log('(kuru kosu - hicbir sey yazilmadi)'); return; }

  const { count } = await p.brandCategory.createMany({ data: satirlar, skipDuplicates: true });
  console.log(`eklenen yeni satir: ${count} (zaten var olanlar atlandi)`);

  const toplam = await p.brandCategory.count();
  const kapsanan = await p.brandCategory.findMany({ distinct: ['brandId'], select: { brandId: true } });
  console.log(`tabloda toplam: ${toplam} satir, ${kapsanan.length} marka en az bir kategoride`);
  console.log(`eslenmemis marka: ${markalar.length - kapsanan.length} (yalnizca "Tüm markalar" altinda cikar)`);
}

main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => p.$disconnect());
