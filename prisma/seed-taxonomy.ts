import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
  {
    name: 'Kask', slug: 'kask',
    subcategories: [
      { name: 'Kapalı Kask', slug: 'kapali-kask' },
      { name: 'Açık Kask', slug: 'acik-kask' },
      { name: 'Modüler Kask', slug: 'moduler-kask' },
      { name: 'Cross / Enduro Kask', slug: 'cross-enduro-kask' },
      { name: 'Adventure Kask', slug: 'adventure-kask' },
      { name: 'Kask Aksesuarları', slug: 'kask-aksesuarlari' },
    ],
  },
  {
    name: 'Mont', slug: 'mont',
    subcategories: [
      { name: 'Yazlık Mont', slug: 'yazlik-mont' },
      { name: 'Kışlık Mont', slug: 'kislik-mont' },
      { name: '3 Mevsim Mont', slug: 'uc-mevsim-mont' },
      { name: 'Gore-Tex Mont', slug: 'gore-tex-mont' },
      { name: 'Deri Mont', slug: 'deri-mont' },
      { name: 'Softshell Mont', slug: 'softshell-mont' },
      { name: 'Tulum (One-Piece)', slug: 'tulum' },
    ],
  },
  {
    name: 'Pantolon', slug: 'pantolon',
    subcategories: [
      { name: 'Yazlık Pantolon', slug: 'yazlik-pantolon' },
      { name: 'Kışlık Pantolon', slug: 'kislik-pantolon' },
      { name: '3 Mevsim Pantolon', slug: 'uc-mevsim-pantolon' },
      { name: 'Gore-Tex Pantolon', slug: 'gore-tex-pantolon' },
      { name: 'Deri Pantolon', slug: 'deri-pantolon' },
      { name: 'Kot / Kevlar Pantolon', slug: 'kot-kevlar-pantolon' },
    ],
  },
  {
    name: 'Eldiven', slug: 'eldiven',
    subcategories: [
      { name: 'Yazlık Eldiven', slug: 'yazlik-eldiven' },
      { name: 'Kışlık Eldiven', slug: 'kislik-eldiven' },
      { name: '3 Mevsim Eldiven', slug: 'uc-mevsim-eldiven' },
      { name: 'Gore-Tex Eldiven', slug: 'gore-tex-eldiven' },
      { name: 'Deri Eldiven', slug: 'deri-eldiven' },
    ],
  },
  {
    name: 'Bot / Çizme', slug: 'bot-cizme',
    subcategories: [
      { name: 'Yazlık Bot', slug: 'yazlik-bot' },
      { name: 'Kışlık Bot', slug: 'kislik-bot' },
      { name: '3 Mevsim Bot', slug: 'uc-mevsim-bot' },
      { name: 'Gore-Tex Bot', slug: 'gore-tex-bot' },
      { name: 'Deri Bot', slug: 'deri-bot' },
      { name: 'Motosiklet Ayakkabısı', slug: 'motosiklet-ayakkabisi' },
    ],
  },
  {
    name: 'Koruma Ekipmanları', slug: 'koruma',
    subcategories: [
      { name: 'Tam Vücut Koruma', slug: 'tam-vucut-koruma' },
      { name: 'Sırt Koruyucu', slug: 'sirt-koruyucu' },
      { name: 'Göğüs Koruyucu', slug: 'gogus-koruyucu' },
      { name: 'Omuz / Dirsek Koruyucu', slug: 'omuz-dirsek-koruyucu' },
      { name: 'Diz / Bacak Koruyucu', slug: 'diz-bacak-koruyucu' },
      { name: 'Boyun Koruyucu', slug: 'boyun-koruyucu' },
      { name: 'Hava Yastığı (Airbag)', slug: 'airbag-sistemi' },
    ],
  },
  {
    name: 'MX / Off-Road', slug: 'mx-off-road',
    subcategories: [
      { name: 'Motocross Ekipmanı', slug: 'mx-motocross' },
      { name: 'Enduro Ekipmanı', slug: 'mx-enduro' },
      { name: 'Adventure Ekipmanı', slug: 'mx-adventure' },
      { name: 'MX Gözlük', slug: 'mx-gozluk' },
      { name: 'MX Aksesuar', slug: 'mx-aksesuar' },
    ],
  },
  {
    name: 'Motosiklet Çantaları', slug: 'canta',
    subcategories: [
      { name: 'Arka Çanta (Top Case)', slug: 'canta-topcase' },
      { name: 'Yan Çanta (Side Case)', slug: 'canta-yan' },
      { name: 'Depo Çantası (Tank Bag)', slug: 'canta-tank' },
      { name: 'Sırt Çantası', slug: 'canta-sirt' },
      { name: 'Şehir Çantası', slug: 'canta-sehir' },
    ],
  },
  {
    name: 'Motosiklet Aksesuarları', slug: 'aksesuar',
    subcategories: [
      { name: 'Telefon & Navigasyon', slug: 'aksesuar-elektronik' },
      { name: 'Kilit & Güvenlik', slug: 'aksesuar-guvenlik' },
      { name: 'Konfor & Ergonomi', slug: 'aksesuar-konfor' },
      { name: 'Görünüm & Tuning', slug: 'aksesuar-tuning' },
    ],
  },
  {
    name: 'Yedek Parça', slug: 'yedek-parca',
    subcategories: [
      { name: 'Motor & Silindir', slug: 'parca-motor' },
      { name: 'Fren Sistemi', slug: 'parca-fren' },
      { name: 'Aktarma (Zincir, Dişli)', slug: 'parca-aktarma' },
      { name: 'Süspansiyon', slug: 'parca-suspansiyon' },
      { name: 'Egzoz Sistemi', slug: 'parca-egzoz' },
      { name: 'Elektrik & Elektronik', slug: 'parca-elektrik' },
      { name: 'Grenaj & Kaporta', slug: 'parca-kaporta' },
      { name: 'Lastik & Jant', slug: 'parca-lastik' },
    ],
  },
  {
    name: 'Bakım Ürünleri', slug: 'bakim',
    subcategories: [
      { name: 'Motor Yağı', slug: 'bakim-yag' },
      { name: 'Zincir & Temizlik', slug: 'bakim-temizlik' },
      { name: 'Lastik Bakım', slug: 'bakim-lastik' },
      { name: 'Alet & Takım', slug: 'bakim-alet' },
    ],
  },
  {
    name: 'Motosiklet', slug: 'motosiklet',
    subcategories: [
      { name: 'Scooter / Skutik', slug: 'moto-scooter' },
      { name: 'Naked / Roadster', slug: 'moto-naked' },
      { name: 'Sport / Supersport', slug: 'moto-sport' },
      { name: 'Adventure / Enduro', slug: 'moto-adventure' },
      { name: 'Cruiser / Chopper / Klasik', slug: 'moto-klasik' },
      { name: 'Cross / Motocross', slug: 'moto-cross' },
      { name: 'ATV / Quad', slug: 'moto-atv' },
    ],
  },
  {
    name: 'Casual Giyim', slug: 'casual-giyim',
    subcategories: [
      { name: 'T-Shirt', slug: 't-shirt' },
      { name: 'Sweatshirt / Kapüşonlu', slug: 'sweatshirt-kapusonlu' },
      { name: 'Günlük Ceket', slug: 'gunluk-ceket' },
      { name: 'Şort / Bermuda', slug: 'sort-bermuda' },
      { name: 'Şapka / Bere', slug: 'sapka-bere' },
      { name: 'Çorap & Diğer', slug: 'corap' },
    ],
  },
  {
    name: 'Sürücü Aksesuarları', slug: 'surucu-aksesuarlari',
    subcategories: [
      { name: 'Yağmurluk Seti', slug: 'yagmurluk-ust' },
      { name: 'Termal İç Giyim', slug: 'termal-ic-giyim' },
      { name: 'Boyunluk / Buff / Balaklava', slug: 'boyunluk-buff' },
      { name: 'Sürücü Yeleği', slug: 'surucu-yelegi' },
      { name: 'Reflektif Ürün', slug: 'reflektif-urun' },
    ],
  },
];

const BRANDS = [
  { name: 'Shoei', slug: 'shoei' },
  { name: 'Arai', slug: 'arai' },
  { name: 'AGV', slug: 'agv' },
  { name: 'HJC', slug: 'hjc' },
  { name: 'Nolan', slug: 'nolan' },
  { name: 'Schuberth', slug: 'schuberth' },
  { name: 'Shark', slug: 'shark' },
  { name: 'LS2', slug: 'ls2' },
  { name: 'Caberg', slug: 'caberg' },
  { name: 'Scorpion', slug: 'scorpion' },
  { name: 'Bell', slug: 'bell' },
  { name: 'Airoh', slug: 'airoh' },
  { name: 'Suomy', slug: 'suomy' },
  { name: 'KYT', slug: 'kyt' },
  { name: 'X-Lite', slug: 'x-lite' },
  { name: 'Nexx', slug: 'nexx' },
  { name: 'Grex', slug: 'grex' },
  { name: 'Zeus', slug: 'zeus' },
  { name: 'Axxis', slug: 'axxis' },
  { name: 'Just1', slug: 'just1' },
  { name: 'Torc', slug: 'torc' },
  { name: 'Icon', slug: 'icon' },
  { name: 'Blauer HT', slug: 'blauer-ht' },
  { name: 'Momo Design', slug: 'momo-design' },
  { name: 'Alpinestars', slug: 'alpinestars' },
  { name: 'Dainese', slug: 'dainese' },
  { name: "Rev'it", slug: 'revit' },
  { name: 'Spidi', slug: 'spidi' },
  { name: 'Held', slug: 'held' },
  { name: 'Rukka', slug: 'rukka' },
  { name: 'Klim', slug: 'klim' },
  { name: 'Richa', slug: 'richa' },
  { name: 'Modeka', slug: 'modeka' },
  { name: 'Bering', slug: 'bering' },
  { name: 'Macna', slug: 'macna' },
  { name: 'iXS', slug: 'ixs' },
  { name: 'Forma', slug: 'forma' },
  { name: 'TCX', slug: 'tcx' },
  { name: 'Gaerne', slug: 'gaerne' },
  { name: 'Five Gloves', slug: 'five-gloves' },
  { name: 'Knox', slug: 'knox' },
  { name: 'Clover', slug: 'clover' },
  { name: 'Tucano Urbano', slug: 'tucano-urbano' },
  { name: 'Scoyco', slug: 'scoyco' },
  { name: 'John Doe', slug: 'john-doe' },
  { name: 'Forcefield', slug: 'forcefield' },
  { name: 'Sena', slug: 'sena' },
  { name: 'Cardo', slug: 'cardo' },
  { name: 'Givi', slug: 'givi' },
  { name: 'Kappa', slug: 'kappa' },
  { name: 'Shad', slug: 'shad' },
  { name: 'Kriega', slug: 'kriega' },
  { name: 'Oxford', slug: 'oxford' },
  { name: 'SP Connect', slug: 'sp-connect' },
  { name: 'Touratech', slug: 'touratech' },
  { name: 'Akrapovic', slug: 'akrapovic' },
  { name: 'Arrow', slug: 'arrow' },
  { name: 'LeoVince', slug: 'leovince' },
  { name: 'Mivv', slug: 'mivv' },
  { name: 'Yoshimura', slug: 'yoshimura' },
  { name: 'SC Project', slug: 'sc-project' },
  { name: 'Brembo', slug: 'brembo' },
  { name: 'EBC Brakes', slug: 'ebc-brakes' },
  { name: 'Pirelli', slug: 'pirelli' },
  { name: 'Michelin', slug: 'michelin' },
  { name: 'Bridgestone', slug: 'bridgestone' },
  { name: 'Metzeler', slug: 'metzeler' },
  { name: 'Dunlop', slug: 'dunlop' },
  { name: 'Continental', slug: 'continental' },
  { name: 'Anlas', slug: 'anlas' },
  { name: 'Motul', slug: 'motul' },
  { name: 'Ipone', slug: 'ipone' },
  { name: 'Scottoiler', slug: 'scottoiler' },
  { name: 'Abus', slug: 'abus' },
  { name: 'Kovix', slug: 'kovix' },
  { name: 'Honda', slug: 'honda' },
  { name: 'Yamaha', slug: 'yamaha' },
  { name: 'Kawasaki', slug: 'kawasaki' },
  { name: 'Suzuki', slug: 'suzuki' },
  { name: 'KTM', slug: 'ktm' },
  { name: 'BMW Motorrad', slug: 'bmw-motorrad' },
  { name: 'Ducati', slug: 'ducati' },
  { name: 'Aprilia', slug: 'aprilia' },
  { name: 'Triumph', slug: 'triumph' },
  { name: 'Harley-Davidson', slug: 'harley-davidson' },
  { name: 'Husqvarna', slug: 'husqvarna' },
  { name: 'Kuba', slug: 'kuba' },
  { name: 'Mondial', slug: 'mondial' },
  { name: 'CF Moto', slug: 'cf-moto' },
  { name: 'Voge', slug: 'voge' },
  { name: 'Bajaj', slug: 'bajaj' },
  { name: 'Kymco', slug: 'kymco' },
  { name: 'Piaggio', slug: 'piaggio' },
  { name: 'Vespa', slug: 'vespa' },
  { name: 'Benelli', slug: 'benelli' },
];

async function main() {
  console.log('Seeding categories...');

  // Delete old L3 and stale L2 categories not in new taxonomy
  const newSlugs = CATEGORIES.flatMap(c => [c.slug, ...c.subcategories.map(s => s.slug)]);
  await prisma.category.deleteMany({ where: { slug: { notIn: newSlugs } } });

  let catCount = 0; let subCount = 0;
  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const parent = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: i, parentId: null },
      create: { name: cat.name, slug: cat.slug, sortOrder: i, isActive: true },
    });
    catCount++;
    for (let j = 0; j < cat.subcategories.length; j++) {
      const sub = cat.subcategories[j];
      await prisma.category.upsert({
        where: { slug: sub.slug },
        update: { name: sub.name, parentId: parent.id, sortOrder: j },
        create: { name: sub.name, slug: sub.slug, parentId: parent.id, sortOrder: j, isActive: true },
      });
      subCount++;
    }
  }
  console.log(`  ${catCount} ana kategori, ${subCount} alt kategori`);

  console.log('Seeding brands...');
  let brandCount = 0;
  for (const brand of BRANDS) {
    await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: { name: brand.name },
      create: { name: brand.name, slug: brand.slug },
    });
    brandCount++;
  }
  console.log(`  ${brandCount} marka`);
  console.log('Done!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
