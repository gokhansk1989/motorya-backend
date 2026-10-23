import { kadrajHaritasiniCoz } from './kadraj';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException, ConflictException} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListingStatus } from '@prisma/client';
import { CreateListingDto, UpdateListingDto, ListingsQueryDto } from './dto/listings.dto';
import { SetFeaturedDto } from './dto/admin-category.dto';
import { SearchService, ListingDocument } from '../search/search.service';
import { SocialService } from '../social/social.service';
import { MailService } from '../mail/mail.service';
import { WebPushService } from '../users/webpush.service';
import { FcmService } from '../users/fcm.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { gorselleriDogrula, YUKLEME_TABANI } from './gorsel-dogrula';
import { degisenIncelemeAlanlari, SERBEST_ALANLAR } from './moderasyon-alanlari';

// Türkçe karakterleri latinize edip URL-safe slug üretir
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}


// "Xl" ile "XL" ayni bedeni anlatir; arama tam eslesme yaptigi icin
// yaziyi daima buyuk harfe sabitliyoruz.
function bedenNormalle(ad?: string | null): string | null {
  const t = (ad ?? '').trim();
  return t ? t.toUpperCase() : null;
}

// Harf bedenleri dogal sirada tutar; sayisal bedenler (56, 47) sona duser.
const BEDEN_SIRASI = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
function bedenSiralama(ad: string): number {
  const i = BEDEN_SIRASI.indexOf(ad.toUpperCase());
  return i === -1 ? 100 : i;
}

// /ilan/{l1}-{l2}-{title}-{city}-{id} formatında slug üretir.
// category.parentId varsa l2, parent ise l1; yoksa sadece l1 kullanılır.
// İlanın mevcut alanlarından otomatik etiket üretir.
// Kullanıcı müdahalesi olmadan arka planda çalışır.
function buildAutoTags(fields: {
  brandName?: string | null;
  categoryName?: string | null;
  city?: string | null;
  sizeLabel?: string | null;
  condition?: string | null;
  title?: string | null;
}): string[] {
  const conditionMap: Record<string, string> = {
    NEW: 'sifir',
    LIKE_NEW: 'sifir-gibi',
    GOOD: 'iyi',
    FAIR: 'makul',
    POOR: 'kullanilmis',
  };

  const tags = new Set<string>();

  if (fields.brandName) tags.add(toSlug(fields.brandName));
  if (fields.categoryName) tags.add(toSlug(fields.categoryName));
  if (fields.city) tags.add(toSlug(fields.city));
  if (fields.sizeLabel) tags.add(toSlug(fields.sizeLabel));
  if (fields.condition && conditionMap[fields.condition]) tags.add(conditionMap[fields.condition]);

  // Başlıktan anlamlı kelimeler: 4+ karakter, alfasayısal
  if (fields.title) {
    fields.title.split(/\s+/).forEach(w => {
      const slug = toSlug(w);
      if (slug.length >= 4) tags.add(slug);
    });
  }

  return Array.from(tags).slice(0, 20);
}

export function buildListingSlug(listing: {
  id: string;
  title: string;
  city?: string | null;
  category?: { slug: string; parentId?: string | null; parent?: { slug: string } | null } | null;
}): string {
  const parts: string[] = [];
  if (listing.category) {
    if (listing.category.parentId && listing.category.parent) {
      parts.push(listing.category.parent.slug);
      parts.push(listing.category.slug);
    } else {
      parts.push(listing.category.slug);
    }
  }
  parts.push(toSlug(listing.title));
  if (listing.city) parts.push(toSlug(listing.city));
  parts.push(listing.id);
  return parts.join('-');
}

@Injectable()
export class ListingsService {
  constructor(
    private prisma: PrismaService,
    private search: SearchService,
    private social: SocialService,
    private mail: MailService,
    private webPush: WebPushService,
    private fcm: FcmService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  private toSearchDoc(listing: any): ListingDocument {
    return {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      price: Number(listing.price),
      originalPrice: listing.originalPrice ? Number(listing.originalPrice) : undefined,
      condition: listing.condition,
      city: listing.city ?? undefined,
      sizeLabel: listing.sizeLabel ?? undefined,
      gender: listing.gender ?? undefined,
      categoryId: listing.categoryId,
      categoryName: listing.category?.name ?? '',
      brandId: listing.brandId ?? undefined,
      brandName: listing.brand?.name ?? undefined,
      sellerId: listing.sellerId,
      sellerName: listing.seller?.displayName ?? '',
      imageUrl: listing.images?.[0]?.url ?? undefined,
      slug: buildListingSlug(listing),
      status: listing.status,
      createdAt: new Date(listing.createdAt).getTime(),
    };
  }

  /**
   * Menu, kategori sayfalari, arama filtreleri ve ilan formu hepsi buradan
   * besleniyor; tek kaynak olmasi icin kural da burada.
   *
   * Yalnizca isActive bakmak yetmiyordu: pasif bir ust kategorinin AKTIF
   * cocuklari listede kaliyordu. Ebeveynleri elendigi icin hicbir kartin
   * altinda gorunmuyorlar ama sayilara dahil oluyorlardi - "86 alt kategori"
   * yazip 67 gostermesinin sebebi buydu. Ayrica Kask sayfasinda
   * "Cross / Enduro" gibi, aslinda pasif bir agaca ait baslikler cikiyordu.
   */
  async getCategories() {
    const hepsi = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const aktifIdler = new Set(hepsi.map(c => c.id));
    return hepsi.filter(c => !c.parentId || aktifIdler.has(c.parentId));
  }

  async adminGetCategories() {
    return this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async getCategoryBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    // `return null` NestJS'te 200 + boş gövde döndürüyordu; istemci tarafında
    // res.json() patlıyor ve sayfa 500 veriyordu. Olmayan kategori 404 olmalı.
    if (!category) throw new NotFoundException('Category not found');
    // isActive suzgeci yoktu: pasif alt kategoriler (orn. "Cross / Enduro
    // Kask", "Adventure Kask") kategori sayfasinda gorunmeye devam ediyordu.
    const children = await this.prisma.category.findMany({ where: { parentId: category.id, isActive: true }, orderBy: { sortOrder: 'asc' } });
    const grandchildren = children.length > 0
      ? await this.prisma.category.findMany({ where: { parentId: { in: children.map(c => c.id) }, isActive: true }, orderBy: { sortOrder: 'asc' } })
      : [];
    return { category, children, grandchildren };
  }

  /**
   * Bir kategori ve TUM alt kategorilerinin kimlikleri.
   *
   * `resolveCategoryIds` ayni isi yapiyordu ama `private` idi; arama ucu
   * (Meilisearch yolu) ona ulasamadigi icin kendi filtresini kurarken
   * yalnizca secilen kategorinin kendisine bakiyordu. Sonuc: "Mont"
   * secildiginde 0 ilan, "Mont > Kislik Mont" secildiginde 1 ilan - oysa
   * ayni filtre /listings ucunda 4 donuyordu. Iki uc ayni kurali
   * kullanmali, bu yuzden disari aciliyor.
   *
   * Kategori agaci neredeyse hic degismiyor ama her arama icin iki sorgu
   * atmanin anlami yok; kisa omurlu bir bellek onbellegi yeterli.
   */
  private kategoriOnbellek: { veri: Map<string, string[]>; zaman: number } | null = null;
  private static readonly KATEGORI_ONBELLEK_MS = 60_000;

  async kategoriVeAltlari(categoryId: string): Promise<string[]> {
    const simdi = Date.now();
    if (!this.kategoriOnbellek || simdi - this.kategoriOnbellek.zaman > ListingsService.KATEGORI_ONBELLEK_MS) {
      const hepsi = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
      const cocuklar = new Map<string, string[]>();
      for (const c of hepsi) {
        if (!c.parentId) continue;
        const liste = cocuklar.get(c.parentId) ?? [];
        liste.push(c.id);
        cocuklar.set(c.parentId, liste);
      }
      // Her kategori icin kendisi + tum soyu. Agac sig (2-3 seviye) ama
      // derinlik varsayimi yapmiyoruz; dongu korumasi da var.
      const soy = new Map<string, string[]>();
      for (const c of hepsi) {
        const sonuc: string[] = [];
        const gorulen = new Set<string>();
        const yigin = [c.id];
        while (yigin.length) {
          const id = yigin.pop()!;
          if (gorulen.has(id)) continue;
          gorulen.add(id);
          sonuc.push(id);
          yigin.push(...(cocuklar.get(id) ?? []));
        }
        soy.set(c.id, sonuc);
      }
      this.kategoriOnbellek = { veri: soy, zaman: simdi };
    }
    // Bilinmeyen kimlik: kendisini dondur. Bos dizi dondurmek "filtre yok"
    // ile karisirdi ve silinmis bir kategoriyle gelen baglanti aniden
    // TUM ilanlari gosterirdi.
    return this.kategoriOnbellek.veri.get(categoryId) ?? [categoryId];
  }

  private async resolveCategoryIds(categoryId?: string, categorySlug?: string): Promise<string[] | null> {
    if (!categoryId && !categorySlug) return null;
    let rootId = categoryId;
    if (!rootId && categorySlug) {
      const cat = await this.prisma.category.findUnique({ where: { slug: categorySlug } });
      if (!cat) return [];
      rootId = cat.id;
    }
    // collect rootId + all descendant IDs
    const ids = [rootId!];
    const children = await this.prisma.category.findMany({ where: { parentId: rootId } });
    for (const child of children) {
      ids.push(child.id);
      const grandchildren = await this.prisma.category.findMany({ where: { parentId: child.id } });
      grandchildren.forEach(gc => ids.push(gc.id));
    }
    return ids;
  }

  async getBrands(categoryId?: string) {
    const brands = await this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
    if (!categoryId) return brands;

    // Kategori verildiginde liste KISALMIYOR, yalnizca her markaya
    // "oncelikli" bayragi ekleniyor. Marka gizlemek tehlikeli: yanlis
    // eslersek satici markasini bulamaz ve ilan veremez - sessiz bir kayip.
    // Onceliklendirmede yanlis eslemenin bedeli fazladan bir kaydirma.
    const { dogrudan, atadan } = await this.oncelikliMarkaIdleri(categoryId);

    // Sira: once SECILEN kategoriye (ve altina) ait markalar, sonra bir ust
    // kategoriden miras gelenler, sonra geri kalan her sey - her grup kendi
    // icinde alfabetik.
    //
    // Yakinlik ayrimi olmadan OEM'ler sinyali boguyordu: 33 motosiklet
    // ureticisi "yedek-parca" kokune eslendigi icin "Lastik" secildiginde
    // Michelin ve Pirelli'nin arasina karisiyorlardi. Oysa lastik ararken
    // once lastik markalarini gormek gerekiyor.
    const yakinlik = (id: string) => (dogrudan.has(id) ? 0 : atadan.has(id) ? 1 : 2);
    return brands
      .map((b) => ({ ...b, oncelikli: dogrudan.has(b.id) || atadan.has(b.id) }))
      .sort((a, b) => yakinlik(a.id) - yakinlik(b.id) || a.name.localeCompare(b.name, 'tr'));
  }

  /**
   * Bir kategoride one cikacak marka kimlikleri. Iki kaynak birlesiyor:
   *
   * 1. Kurator eslemesi (BrandCategory) - gun bir ilan bile yokken calisir.
   * 2. O kategoride gercekten ilan verilmis markalar - zamanla 1'i duzeltir
   *    ve kuratorun atladigi markalari kendiliginden one cikarir.
   *
   * Kategori agaci iki yonlu cozuluyor: secilen kategorinin ATALARINA
   * eslenmis markalar da one cikiyor (Dainese 'mont'a eslenmisse
   * 'kislik-mont' secildiginde de gorunur), ALTINDAKI kategorilere
   * eslenmis olanlar da (ana kategori secildiginde yapraklarin markalari).
   */
  private async oncelikliMarkaIdleri(
    categoryId: string,
  ): Promise<{ dogrudan: Set<string>; atadan: Set<string> }> {
    const bos = { dogrudan: new Set<string>(), atadan: new Set<string>() };
    const kategori = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, parentId: true },
    });
    if (!kategori) return bos;

    // Atalar: en fazla iki seviye (agac kok -> alt -> yaprak).
    const atalar: string[] = [];
    if (kategori.parentId) {
      atalar.push(kategori.parentId);
      const ustAta = await this.prisma.category.findUnique({
        where: { id: kategori.parentId },
        select: { parentId: true },
      });
      if (ustAta?.parentId) atalar.push(ustAta.parentId);
    }
    const altlar = (await this.resolveCategoryIds(categoryId)) ?? [categoryId];

    const [eslenmisAlt, eslenmisAta, ilanliMarkalar] = await Promise.all([
      this.prisma.brandCategory.findMany({
        where: { categoryId: { in: altlar } },
        select: { brandId: true },
      }),
      atalar.length
        ? this.prisma.brandCategory.findMany({
            where: { categoryId: { in: atalar } },
            select: { brandId: true },
          })
        : Promise.resolve([]),
      // Yalnizca ASAGI dogru: ustteki kategorilerde ilan verilmis markayi
      // one cikarmak alakasiz sonuc uretirdi (kaskta ilani olan marka
      // "kapali kask"ta anlamli, ama "bakim"da degil).
      this.prisma.listing.groupBy({
        by: ['brandId'],
        where: {
          categoryId: { in: altlar },
          status: 'ACTIVE',
          deletedAt: null,
          isTest: false,
          brandId: { not: null },
        },
      }),
    ]);

    const dogrudan = new Set<string>([
      ...eslenmisAlt.map((e) => e.brandId),
      ...ilanliMarkalar.map((g) => g.brandId as string),
    ]);
    // Ata eslemesi yalnizca dogrudan eslesmeyenler icin anlamli.
    const atadan = new Set<string>(
      eslenmisAta.map((e) => e.brandId).filter((id) => !dogrudan.has(id)),
    );
    return { dogrudan, atadan };
  }

  /** Panel: bir markanin eslendigi kategoriler. */
  async adminMarkaKategorileri(brandId: string) {
    const satirlar = await this.prisma.brandCategory.findMany({
      where: { brandId },
      select: { categoryId: true },
    });
    return satirlar.map((s) => s.categoryId);
  }

  /**
   * Panel: bir markanin kategorilerini topluca ayarlar.
   *
   * Tam degistirme (gonderilmeyen esleme silinir): panelde kutular isaretli
   * geldigi icin kullanici "kaldirdim" dediginde gercekten kalkmali.
   * Tek islemde yapiliyor ki yarim kalmis bir kayit birakmasin.
   */
  async adminMarkaKategorileriAyarla(brandId: string, categoryIds: string[]) {
    const marka = await this.prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } });
    if (!marka) throw new NotFoundException('Marka bulunamadı');

    const gecerli = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true },
    });

    await this.prisma.$transaction([
      this.prisma.brandCategory.deleteMany({ where: { brandId } }),
      this.prisma.brandCategory.createMany({
        data: gecerli.map((c) => ({ brandId, categoryId: c.id })),
        skipDuplicates: true,
      }),
    ]);
    return { brandId, kategoriSayisi: gecerli.length };
  }

  // Arama filtrelerinin seceneklerini yayindaki ilanlardan uretir; boylece
  // kullanici hicbir zaman sonuc dondurmeyen bir beden/sehir secemez.
  async getFacets(categorySlug?: string) {
    const categoryIds = await this.resolveCategoryIds(undefined, categorySlug);
    const where: any = { status: 'ACTIVE', deletedAt: null, isTest: false };
    if (categoryIds && categoryIds.length > 0) {
      where.categoryId = { in: categoryIds };
    }

    const [bedenler, sehirler] = await Promise.all([
      this.prisma.listing.groupBy({
        by: ['sizeLabel'],
        where: { ...where, sizeLabel: { not: null } },
        _count: { id: true },
      }),
      this.prisma.listing.groupBy({
        by: ['city'],
        where: { ...where, city: { not: null } },
        _count: { id: true },
      }),
    ]);

    // "Xl" ile "XL" ayni bedendir; buyuk harfe indirip sayilari topluyoruz.
    const bedenSayac = new Map<string, number>();
    for (const b of bedenler) {
      const ad = (b.sizeLabel as string).trim();
      if (!ad) continue;
      const anahtar = ad.toUpperCase();
      bedenSayac.set(anahtar, (bedenSayac.get(anahtar) ?? 0) + b._count.id);
    }

    const sehirSayac = new Map<string, number>();
    for (const c of sehirler) {
      const ad = (c.city as string).trim();
      if (!ad) continue;
      sehirSayac.set(ad, (sehirSayac.get(ad) ?? 0) + c._count.id);
    }

    return {
      sizes: [...bedenSayac.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => bedenSiralama(a.value) - bedenSiralama(b.value) || a.value.localeCompare(b.value, 'tr')),
      cities: [...sehirSayac.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'tr')),
    };
  }

  async getBrandsByCategory(categorySlug: string) {
    const categoryIds = await this.resolveCategoryIds(undefined, categorySlug);
    if (!categoryIds || categoryIds.length === 0) {
      throw new NotFoundException('Category not found');
    }

    const grouped = await this.prisma.listing.groupBy({
      by: ['brandId'],
      where: {
        categoryId: { in: categoryIds },
        status: 'ACTIVE',
        deletedAt: null,
        isTest: false,
        brandId: { not: null },
      },
      _count: { id: true },
    });

    if (grouped.length === 0) return [];

    const brandIds = grouped.map(g => g.brandId as string);
    const brands = await this.prisma.brand.findMany({
      where: { id: { in: brandIds } },
      select: { id: true, name: true, slug: true, logoUrl: true },
      orderBy: { name: 'asc' },
    });

    const countMap = new Map(grouped.map(g => [g.brandId as string, g._count.id]));
    return brands.map(b => ({ ...b, listingCount: countMap.get(b.id) ?? 0 }));
  }

  async adminCreateCategory(data: { name: string; slug: string; parentId?: string; sortOrder?: number; iconKey?: string }) {
    return this.prisma.category.create({ data: { ...data, isActive: true } });
  }

  async adminUpdateCategory(id: string, data: { name?: string; slug?: string; parentId?: string; sortOrder?: number; isActive?: boolean; iconKey?: string }) {
    if (data.parentId) {
      if (data.parentId === id) {
        throw new BadRequestException('Bir kategori kendi üst kategorisi olamaz');
      }
      const descendants = await this.getDescendantCategoryIds(id);
      if (descendants.has(data.parentId)) {
        throw new BadRequestException('Bir kategori kendi alt kategorisinin altına taşınamaz');
      }
    }
    return this.prisma.category.update({ where: { id }, data });
  }

  private async getDescendantCategoryIds(rootId: string): Promise<Set<string>> {
    const result = new Set<string>();
    let queue = [rootId];
    while (queue.length > 0) {
      const children = await this.prisma.category.findMany({
        where: { parentId: { in: queue } },
        select: { id: true },
      });
      queue = children.map((c) => c.id).filter((cid) => !result.has(cid));
      queue.forEach((cid) => result.add(cid));
    }
    return result;
  }

  async adminDeleteCategory(id: string) {
    const [childCount, listingCount] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id } }),
      this.prisma.listing.count({ where: { categoryId: id, deletedAt: null } }),
    ]);
    if (childCount > 0) {
      throw new BadRequestException('Bu kategorinin alt kategorileri var — önce onları silin');
    }
    if (listingCount > 0) {
      throw new BadRequestException(`Bu kategoride ${listingCount} ilan var — kategori silinemiyor`);
    }
    await this.prisma.category.delete({ where: { id } });
  }

  async adminCreateBrand(data: { name: string; slug: string; logoUrl?: string }) {
    return this.prisma.brand.create({ data });
  }

  async adminUpdateBrand(id: string, data: { name?: string; slug?: string; logoUrl?: string }) {
    return this.prisma.brand.update({ where: { id }, data });
  }

  async adminDeleteBrand(id: string) {
    const listingCount = await this.prisma.listing.count({ where: { brandId: id, deletedAt: null } });
    if (listingCount > 0) {
      throw new BadRequestException(`Bu markayı kullanan ${listingCount} ilan var — marka silinemiyor`);
    }
    await this.prisma.brand.delete({ where: { id } });
  }

  async createListing(sellerId: string, dto: CreateListingDto) {
    if (!(await this.settings.get('new_listings'))) {
      throw new ServiceUnavailableException('Yeni ilan girişi şu anda kapalı.');
    }

    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { tcKimlik: true, displayName: true, realName: true, isTestAccount: true },
    });
    if (!seller?.tcKimlik) {
      throw new BadRequestException('İlan vermek için önce profilinden T.C. Kimlik numaranı tamamlaman gerekiyor.');
    }
    // Ilan sayfasi herkese acik ve arama motorlarinca dizine ekleniyor; satici
    // adi orada goruntuleniyor. Gercek ad-soyadin yayinlanmamasi icin ilan
    // vermeden once kullanici adi secilmis olmali.
    if (seller.realName && seller.displayName === seller.realName) {
      throw new BadRequestException('İlan vermek için önce profilinden bir kullanıcı adı belirlemen gerekiyor.');
    }

    const { imageUrls = [], imageCrops, ...rest } = dto;
    gorselleriDogrula(imageUrls);
    // Kadrajlar yalnizca GERCEKTEN eklenen fotograflar icin saklaniyor;
    // listede olmayan adreslerin kadraji dusuyor.
    const kadrajlar = kadrajHaritasiniCoz(imageCrops, imageUrls);

    const [category, brand] = await Promise.all([
      rest.categoryId ? this.prisma.category.findUnique({ where: { id: rest.categoryId } }) : null,
      rest.brandId ? this.prisma.brand.findUnique({ where: { id: rest.brandId } }) : null,
    ]);

    // Kategori gercekten var ve yayinda mi? Once dogrulanmiyordu: gecersiz
    // kimlik Prisma'nin yabanci anahtar hatasina, pasif kategori ise hicbir
    // listede gorunmeyen bir ilana donusuyordu.
    if (!category || !category.isActive) {
      throw new BadRequestException('Geçersiz kategori seçimi.');
    }

    // Alt kategorisi olan bir ana kategoriye ilan verilemez.
    //
    // Arama ana kategoriyi alt kategorileriyle birlikte cozuyor, yani ana
    // kategoriye yazilan ilan "Çantalar"a bakanda gorunuyor ama "Topcase"
    // filtresinde HIC gorunmuyor - satici icin sessiz bir kayip. Istemci
    // tarafi kontrol tek savunma olmamali; istek dogrudan API'ye de
    // atilabiliyor.
    const altKategoriSayisi = await this.prisma.category.count({
      where: { parentId: category.id, isActive: true },
    });
    if (altKategoriSayisi > 0) {
      throw new BadRequestException('Lütfen alt kategori seçin.');
    }

    const tags = buildAutoTags({
      brandName: brand?.name,
      categoryName: category?.name,
      city: rest.city,
      sizeLabel: rest.sizeLabel,
      condition: rest.condition,
      title: rest.title,
    });

    const listing = await this.prisma.listing.create({
      data: {
        ...rest,
        brandId: rest.brandId || null,
        city: rest.city || null,
        sizeLabel: bedenNormalle(rest.sizeLabel),
        price: rest.price,
        originalPrice: rest.originalPrice ?? null,
        sellerId,
        status: 'PENDING_REVIEW',
        // Test hesabinin ilanlari isareti olusurken aliyor; moderator
        // sonradan elle isaretlemek zorunda kalmasin.
        isTest: seller.isTestAccount,
        tags,
        images: {
          create: imageUrls.map((url, i) => ({ url, sortOrder: i, crop: kadrajlar[url] ?? undefined })),
        },
      },
      include: { images: true, category: { include: { parent: { select: { slug: true, name: true } } } }, brand: true, seller: { select: { email: true, displayName: true } } },
    });

    // Satıcıya bildirim + mail
    await this.prisma.notification.create({
      data: {
        userId: sellerId,
        type: 'listing.pending',
        title: 'İlanın incelemeye alındı',
        body: `"${listing.title}" ilanın ekibimiz tarafından inceleniyor. Onaylandığında sana haber vereceğiz.`,
        payload: { listingId: listing.id, listingSlug: buildListingSlug(listing) },
      },
    });
    this.mail.sendListingPendingEmail(
      (listing.seller as any).email,
      (listing.seller as any).displayName,
      listing.title,
    ).catch(() => null);

    // Moderatörlere haber ver — kuyruğa ilan düştüğünü kimse bilmiyordu,
    // gece verilen ilan sabaha kadar bekliyordu.
    this.notifyModeratorsOfPendingListing(listing.id, listing.title).catch(() => null);

    this.audit.log({ actorId: sellerId, action: 'listing.create', entity: 'Listing', entityId: listing.id, meta: { title: listing.title } });

    return { ...listing, slug: buildListingSlug(listing) };
  }

  /**
   * Yeni ilan moderasyon kuyruğuna düştüğünde yöneticilere bildirim + e-posta.
   * E-posta kuyruk boşken (0'dan 1'e geçiş) gönderilir; yoğun saatlerde
   * her ilan için ayrı mail atıp gelen kutusunu doldurmamak için.
   */
  private async notifyModeratorsOfPendingListing(listingId: string, title: string) {
    const [moderators, pendingCount] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'] },
          deletedAt: null,
          status: 'ACTIVE',
        },
        select: { id: true, email: true, displayName: true },
      }),
      this.prisma.listing.count({ where: { status: 'PENDING_REVIEW', deletedAt: null } }),
    ]);

    if (moderators.length === 0) return;

    await this.prisma.notification.createMany({
      data: moderators.map(m => ({
        userId: m.id,
        type: 'moderation.pending',
        title: 'Onay bekleyen ilan var',
        body: `"${title}" incelemenizi bekliyor. Kuyrukta ${pendingCount} ilan var.`,
        payload: { listingId, pendingCount },
      })),
    });

    // Her yeni ilan için mail. Önceden koşul `pendingCount === 1` idi: yalnızca
    // kuyruk boşken haber veriliyordu. Amaç moderatörü boğmamaktı ama sonuç
    // tersi oldu - kuyrukta bir ilan beklediği sürece sonraki ilanlar sessizce
    // birikiyordu. 26 Eylül'de dakikalar içinde açılan 5 ilandan yalnızca
    // ilki mail çıkardı; kalan dördünden kimsenin haberi olmadı.
    //
    // Şu anki hacimde (günde birkaç ilan) her ilana mail doğru davranış.
    // Günde onlarca ilana çıkınca bunu saatlik/günlük özete çevirmek gerekir;
    // o zaman da "sessiz kalmak" değil, "tek mailde toplamak" yönüne gidilmeli.
    await Promise.all(
      moderators.map(m =>
        this.mail.sendModerationQueueEmail(m.email, m.displayName, title).catch(() => null),
      ),
    );
  }

  /**
   * Şikâyet gelince moderatörlere haber ver.
   *
   * Şikâyet yalnızca Report satırı oluşturuyordu; kimseye bildirim
   * gitmiyordu. App Store 1.2 maddesi "uygunsuz içerik şikâyetlerine 24
   * saat içinde işlem yapılmalı" diyor - haber gitmeden bu mümkün değil.
   * Yeni ilan eklenince bildirim gidiyordu ama şikâyette gitmiyordu.
   *
   * Push de gönderiliyor: bir şikâyet, kuyrukta bekleyen yeni ilandan
   * daha aciledir; moderatörün paneli açmasını beklemek doğru değil.
   */
  private async notifyModeratorsOfReport(reportId: string, listingId: string, listingTitle: string, reason: string) {
    const moderators = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'] }, deletedAt: null },
      select: { id: true, email: true, displayName: true },
    });
    if (moderators.length === 0) return;

    await this.prisma.notification.createMany({
      data: moderators.map(m => ({
        userId: m.id,
        type: 'report.received',
        title: '🚩 İlan şikâyet edildi',
        body: `"${listingTitle}" — ${reason}`,
        payload: { reportId, listingId },
      })),
    });

    this.webPush.sendToMany(
      moderators.map(m => m.id),
      { title: 'İlan şikâyet edildi', body: listingTitle, url: '/' },
    ).catch(() => null);

    // Mail de gitsin: kullanım şartlarında ve App Store incelemesinde
    // şikâyetleri 24 saat içinde inceleyeceğimizi taahhüt ettik. Panel
    // bildirimi ve push, moderatör o gün uygulamayı açmazsa o taahhüdü
    // tutmaya yetmiyor - mail açılmayan tek kanal değil ama en kalıcısı.
    await Promise.all(
      moderators.map(m =>
        this.mail.sendReportEmail(m.email, m.displayName, listingTitle, reason, listingId).catch(() => null),
      ),
    );
  }

  async getListings(query: ListingsQueryDto, viewerId?: string) {
    const {
      search,
      categoryId,
      categorySlug,
      brandId,
      condition,
      sizeLabel,
      city,
      minPrice,
      maxPrice,
      page = 1,
      limit = 20,
      sort = 'newest',
      isFeatured,
    } = query;

    const where: any = {
      status: ListingStatus.ACTIVE,
      deletedAt: null,
      // Test ilanlari genel listelerde gorunmuyor. Sahibi kendi ilanini
      // "ilanlarim" uzerinden gormeye devam ediyor.
      isTest: false,
    };

    if (isFeatured) {
      where.isFeatured = true;
      where.featuredUntil = { gt: new Date() };
    }

    if (viewerId) {
      const blockedIds = await this.social.getBlockedUserIds(viewerId).catch(() => []);
      if (blockedIds.length > 0) where.sellerId = { notIn: blockedIds };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    const categoryIds = await this.resolveCategoryIds(categoryId, categorySlug);
    if (categoryIds !== null) {
      where.categoryId = categoryIds.length === 1 ? categoryIds[0] : { in: categoryIds };
    }
    if (brandId) where.brandId = brandId;
    if (condition) where.condition = condition;
    if ((query as any).gender) where.gender = (query as any).gender;
    if (sizeLabel) where.sizeLabel = { equals: sizeLabel, mode: 'insensitive' };
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    const siralama = {
      price_asc: { price: 'asc' as const },
      price_desc: { price: 'desc' as const },
      newest: { createdAt: 'desc' as const },
      oldest: { createdAt: 'asc' as const },
    }[sort];

    /**
     * Vitrinde elle verilen sira one geciyor - ama YALNIZCA kullanici
     * kendi bir siralama secmediyse. Fiyata gore siralamak isteyen
     * birine vitrin sirasini dayatmak, sectigi seyi sessizce yok saymak
     * olurdu.
     *
     * Sira verilmemis ilanlar (NULL) sona dusuyor: boylece hic sira
     * atanmadiginda vitrin bugunku haliyle, en yeniden eskiye dizili
     * kaliyor.
     */
    const orderBy =
      isFeatured && sort === 'newest'
        ? [{ featuredOrder: { sort: 'asc' as const, nulls: 'last' as const } }, siralama]
        : siralama;

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          // Listede yalnizca KAPAK iniyor: 8 fotografin tamamini
          // listelemek bant genisligini bosa harciyor.
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          // Toplam fotograf SAYISI ayrica geliyor. Kart "3 fotograf"
          // rozetini bununla gosteriyor; `images.length` her zaman 1
          // oldugu icin ondan okunamiyordu.
          _count: { select: { images: true } },
          seller: { select: { id: true, displayName: true, avatarUrl: true, ratingAvg: true } },
          category: { select: { id: true, name: true, slug: true, parentId: true, parent: { select: { slug: true, name: true } } } },
          brand: { select: { id: true, name: true } },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    let favoritedIds = new Set<string>();
    if (viewerId) {
      const favs = await this.prisma.favorite.findMany({
        where: { userId: viewerId, listingId: { in: items.map(i => i.id) } },
        select: { listingId: true },
      });
      favoritedIds = new Set(favs.map(f => f.listingId));
    }

    return {
      items: items.map(item => ({ ...item, slug: buildListingSlug(item), isFavorited: favoritedIds.has(item.id) })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Slug'dan ID'yi çıkarır: son CUID veya tüm olası son segmentleri dener.
  async getListingBySlug(slug: string, viewerId?: string) {
    // CUID: c + 24 alfanumerik karakter (tire yok)
    const cuidMatch = slug.match(/c[a-z0-9]{24}$/);
    if (cuidMatch) {
      return this.getListingById(cuidMatch[0], viewerId);
    }

    // Non-CUID ID: slug'un sonundaki kısımlar olabilir (örn. "listing-e2").
    // Giderek uzayan suffix deneriz — ilk bulunan ACTIVE ilan kazanır.
    const parts = slug.split('-');
    for (let take = 1; take <= Math.min(parts.length, 4); take++) {
      const candidateId = parts.slice(-take).join('-');
      const found = await this.prisma.listing.findFirst({
        where: { id: candidateId, deletedAt: null },
        select: { id: true },
      });
      if (found) return this.getListingById(found.id, viewerId);
    }

    throw new NotFoundException('Listing not found');
  }

  async getListingById(id: string, viewerId?: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, deletedAt: null },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        seller: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            city: true,
            ratingAvg: true,
            ratingCount: true,
            salesCount: true,
            createdAt: true,
          },
        },
        category: { include: { parent: { select: { slug: true, name: true } } } },
        brand: true,
        bekleyenDuzenleme: true,
      },
    });

    if (!listing) throw new NotFoundException('Listing not found');

    /**
     * RESERVED ve SOLD ilanlar herkese açık kalır: teklif veren, favorileyen
     * veya mesajlaşan kullanıcı ilanı görebilmeli — aksi halde kendi teklifine
     * tıklayınca "ilan bulunamadı" alıyordu. Satılmış ilanın görünür kalması
     * ayrıca değerlendirme akışı ve SEO için gerekli (yapısal veri zaten
     * SOLD durumunu schema.org/SoldOut olarak bildiriyor).
     *
     * Taslak, inceleme bekleyen, reddedilen ve arşivlenen ilanlar yalnızca
     * sahibine görünür.
     */
    const publiclyVisible: ListingStatus[] = [
      ListingStatus.ACTIVE,
      ListingStatus.RESERVED,
      ListingStatus.SOLD,
    ];
    if (!publiclyVisible.includes(listing.status) && listing.sellerId !== viewerId) {
      throw new NotFoundException('Listing not found');
    }

    // Fire-and-forget view count increment
    this.prisma.listing
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => null);

    let isFavorited = false;
    if (viewerId) {
      const fav = await this.prisma.favorite.findUnique({
        where: { userId_listingId: { userId: viewerId, listingId: id } },
      });
      isFavorited = !!fav;
    }

    // Bekleyen duzenleme YALNIZCA sahibine gosteriliyor. Ziyaretci
    // incelenmemis icerigi hicbir sekilde gormemeli - detay sayfasi da
    // digerleri gibi onayli surumu okuyor.
    const sahibi = listing.sellerId === viewerId;
    const { bekleyenDuzenleme, ...kalan } = listing as typeof listing & {
      bekleyenDuzenleme: unknown;
    };

    return {
      ...kalan,
      slug: buildListingSlug(listing),
      isFavorited,
      ...(sahibi
        ? {
            bekleyenDuzenleme: bekleyenDuzenleme ?? null,
            degisiklikIncelemede: !!bekleyenDuzenleme,
          }
        : {}),
    };
  }

  async getListingsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const listings = await this.prisma.listing.findMany({
      where: { id: { in: ids }, status: 'ACTIVE', deletedAt: null, isTest: false },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        seller: { select: { id: true, displayName: true } },
        brand: true,
      },
    });
    const byId = new Map(listings.map((l) => [l.id, l]));
    return ids.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
  }

  // originalPrice/price karşılaştırması Prisma'da sütun-sütun filtrelenemediği için
  // (raw SQL gerektirir), indirimli olabilecek adayları çekip JS'te filtreliyoruz.
  /**
   * Alicinin "evet, bu alisverisi yaptim" onayi.
   *
   * Yalnizca satici tarafindan alici olarak kaydedilen kisi onaylayabilir.
   * Onay geri alinamaz; alindiginda satici profilinde "alici onayli"
   * sayisina dahil olur. Mevcut salesCount degismeden kalir - o sayac
   * saticinin beyanini temsil ediyor ve gecmise donuk yeniden
   * hesaplanmiyor.
   */
  async alisverisiOnayla(listingId: string, buyerId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: {
        id: true, title: true, sellerId: true, soldToUserId: true,
        status: true, buyerConfirmedAt: true, categoryId: true,
        city: true, brandId: true,
      },
    });
    if (!listing) throw new NotFoundException('Ilan bulunamadi');
    if (listing.status !== ListingStatus.SOLD) {
      throw new BadRequestException('Bu ilan satildi olarak isaretlenmemis');
    }
    if (listing.soldToUserId !== buyerId) {
      throw new ForbiddenException('Bu alisverisi yalnizca alicisi onaylayabilir');
    }
    if (listing.buyerConfirmedAt) {
      return { onaylandi: true, tarih: listing.buyerConfirmedAt };
    }

    const guncel = await this.prisma.listing.update({
      where: { id: listingId },
      data: { buyerConfirmedAt: new Date() },
      select: { buyerConfirmedAt: true },
    });

    await this.prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: 'sale.confirmed',
        title: 'Alici alisverisi onayladi',
        body: `"${listing.title}" alisverisi alici tarafindan onaylandi.`,
        payload: { listingId },
      },
    }).catch(() => null);

    return { onaylandi: true, tarih: guncel.buyerConfirmedAt };
  }

  /** Saticinin alici tarafindan onaylanmis alisveris sayisi. */
  async onayliSatisSayisi(sellerId: string): Promise<number> {
    return this.prisma.listing.count({
      where: { sellerId, buyerConfirmedAt: { not: null }, deletedAt: null },
    });
  }

  async getPriceDrops(limit = 12) {
    const candidates = await this.prisma.listing.findMany({
      where: { status: 'ACTIVE', deletedAt: null, isTest: false, originalPrice: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: Math.max(limit * 4, 60),
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        seller: { select: { id: true, displayName: true } },
        brand: true,
      },
    });
    const indirimliler = candidates.filter(
      (l) => l.originalPrice && Number(l.originalPrice) > Number(l.price),
    );

    // Satici basina en fazla bir ilan.
    //
    // Neden: bu liste ana sayfanin hero kosesinde donen bir seritte
    // gosteriliyor. Ayni saticinin ayni modelden iki ilani (ornegin ayni
    // fiyattan, ayni indirim oraniyla iki LS2 kask) yan yana dondugunde
    // ziyaretcinin okumasi "burasi bos / veriler sahte" oluyor - nitekim
    // uretimde tam olarak bu haldeydi: iki ilan, tek satici, ikisi de
    // 5500 -> 2000, ikisi de %64. Cesitlilik burada adaletten daha
    // onemli; amac indirim yapan herkesi listelemek degil, pazarin canli
    // oldugunu gostermek.
    //
    // Siralama updatedAt'e gore geldigi icin bir saticinin EN SON
    // guncelledigi ilan secilmis olur.
    const gorulenSatici = new Set<string>();
    const cesitli = indirimliler.filter((l) => {
      if (gorulenSatici.has(l.sellerId)) return false;
      gorulenSatici.add(l.sellerId);
      return true;
    });

    return cesitli
      .slice(0, limit)
      .map((l) => ({ ...l, slug: buildListingSlug(l) }));
  }

  async getSimilarListings(id: string) {
    const listing = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');

    const include = {
      images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
      seller: { select: { id: true, displayName: true } },
      brand: true,
    };
    const limit = 8;
    const results: any[] = [];
    const seen = new Set<string>([id]);

    const tiers = [
      listing.brandId ? { categoryId: listing.categoryId, brandId: listing.brandId } : null,
      listing.city ? { categoryId: listing.categoryId, city: listing.city } : null,
      { categoryId: listing.categoryId },
    ].filter((w): w is NonNullable<typeof w> => !!w);

    for (const filter of tiers) {
      if (results.length >= limit) break;
      const batch = await this.prisma.listing.findMany({
        where: { ...filter, status: 'ACTIVE', deletedAt: null, isTest: false, id: { notIn: [...seen] } },
        orderBy: { createdAt: 'desc' },
        take: limit - results.length,
        include,
      });
      for (const item of batch) {
        seen.add(item.id);
        results.push(item);
      }
    }

    return results;
  }

  async adminUpdateListing(id: string, dto: UpdateListingDto) {
    const listing = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');
    return this.prisma.listing.update({
      where: { id },
      data: { ...(dto.categoryId && { categoryId: dto.categoryId }) },
    });
  }

  /** Vitrine eklenebilir ilan: yayinda, silinmemis, test degil. */
  private static readonly VITRIN_UYGUN_DURUM = 'ACTIVE';

  /**
   * Cift gonderim koruması.
   *
   * Sure uzatma MATEMATIKSEL olarak birikimli: iki istek iki kez uzatir ve
   * bu "dogru" sonuctur. Ama cift tiklama ya da aglin tekrar denemesi de
   * ayni iki istegi uretiyor; kullanici 3 gun basip 6 gun aliyor ve bunu
   * gosteren hicbir sey yok. Istemcide dugme kilitleniyor, ama istemci
   * kontrolu tek basina yeterli degil.
   *
   * Cozum: ayni ilan + ayni gun sayisi icin kisa bir pencerede gelen
   * ikinci istek YOK SAYILIYOR (mevcut durum donuyor, hata degil - cunku
   * kullanicinin niyeti zaten gerceklesmis durumda).
   *
   * SINIR: bellekte tutuluyor, yani surec yeniden baslarsa sifirlanir ve
   * cok ornekli bir kurulumda ornekler arasi paylasilmaz. Mevcut kurulum
   * tek Docker ornegi oldugu icin yeterli; olceklenirse Redis'e tasinmali.
   */
  private static readonly CIFT_GONDERIM_PENCERE_MS = 8_000;
  private readonly sonVitrinIstegi = new Map<string, number>();

  private ciftGonderimMi(listingId: string, days: number): boolean {
    const anahtar = `${listingId}:${days}`;
    const simdi = Date.now();
    const son = this.sonVitrinIstegi.get(anahtar);
    if (son && simdi - son < ListingsService.CIFT_GONDERIM_PENCERE_MS) return true;
    this.sonVitrinIstegi.set(anahtar, simdi);
    // Harita sinirsiz buyumesin: eski kayitlari temizle.
    if (this.sonVitrinIstegi.size > 500) {
      for (const [k, t] of this.sonVitrinIstegi) {
        if (simdi - t > ListingsService.CIFT_GONDERIM_PENCERE_MS) this.sonVitrinIstegi.delete(k);
      }
    }
    return false;
  }

  /**
   * Ilani vitrine ekler, suresini uzatir ya da vitrinden cikarir.
   *
   * UC KURAL buraya sonradan eklendi, cunku yoklugu sessiz hatalar
   * uretiyordu:
   *
   * 1. UYGUNLUK SUNUCUDA DOGRULANIYOR. Onceden yalnizca "ilan var mi"
   *    bakiliyordu; SOLD, PENDING_REVIEW, REJECTED ya da TEST bir ilan
   *    vitrine alinabiliyordu. Vitrin sorgusu status=ACTIVE filtreledigi
   *    icin ilan sitede gorunmuyor ama slot dolu sayiliyordu - panelde
   *    "7 ilan vitrinde" yazarken sitede 5 tane cikiyordu.
   *
   * 2. SURE UZATMA MEVCUT BITISTEN BASLIYOR. Onceden her istek
   *    `bugun + gun` yaziyordu; 30 gunluk bir ilana yanlislikla "3 gun"
   *    basildiginda sure UZAMIYOR, 27 gun KISALIYORDU ve bunu gosteren
   *    hicbir sey yoktu. Artik yeni bitis her zaman
   *    max(simdi, mevcutBitis) + gun; yani islem suresi asla kisaltmiyor.
   *
   * 3. BILDIRIM YALNIZCA ILK EKLEMEDE. Cift tiklama ya da tekrarlanan
   *    istek saticiya iki push gonderiyordu. Uzatma zaten saticiyi
   *    ilgilendiren yeni bir olay degil.
   */
  async adminSetFeatured(id: string, dto: SetFeaturedDto, adminId?: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, title: true, sellerId: true, status: true, isTest: true,
        isFeatured: true, featuredUntil: true, createdAt: true,
      },
    });
    if (!listing) throw new NotFoundException('İlan bulunamadı');

    if (!dto.isFeatured) {
      // Cikarma her durumda serbest: satilmis ya da test olarak
      // isaretlenmis bir ilanin bayragini temizleyebilmemiz gerekiyor.
      const guncel = await this.prisma.listing.update({
        where: { id },
        // Vitrinden cikarilan ilanin sirasi da temizleniyor: geri
        // eklendiginde eski sirasinin kendiliginden geri gelmesi,
        // yoneticinin kurdugu dizilisi sessizce bozardi.
        data: { isFeatured: false, featuredUntil: null, featuredOrder: null },
      });
      if (listing.isFeatured) {
        this.audit.log({
          actorId: adminId ?? 'system',
          action: 'listing.featured.remove',
          entity: 'Listing',
          entityId: id,
        });
      }
      return guncel;
    }

    if (listing.isTest) {
      throw new BadRequestException(
        'Test olarak işaretlenmiş ilan vitrine eklenemez. Önce test işaretini kaldırın.',
      );
    }
    if (listing.status !== ListingsService.VITRIN_UYGUN_DURUM) {
      throw new BadRequestException(
        `Yalnızca yayındaki (aktif) ilanlar vitrine eklenebilir. Bu ilanın durumu: ${listing.status}`,
      );
    }

    const days = dto.days ?? 7;

    if (this.ciftGonderimMi(id, days)) {
      // Ayni islem saniyeler icinde tekrar geldi: sureyi bir daha
      // uzatmiyoruz. Hata DEGIL - istenen sonuc zaten gerceklesmis.
      return { ...listing, mukerrerIstekYokSayildi: true } as any;
    }

    // Mevcut bitis gelecekteyse oradan devam; gecmisteyse ya da yoksa
    // bugunden. Boylece islem hicbir kosulda sureyi kisaltmiyor.
    const simdi = new Date();
    const mevcutBitis = listing.featuredUntil;
    const taban =
      listing.isFeatured && mevcutBitis && mevcutBitis.getTime() > simdi.getTime()
        ? new Date(mevcutBitis)
        : simdi;
    const until = new Date(taban);
    until.setDate(until.getDate() + days);

    const ilkEkleme = !(listing.isFeatured && mevcutBitis && mevcutBitis.getTime() > simdi.getTime());

    const updated = await this.prisma.listing.update({
      where: { id },
      // `sira` HIC gonderilmediyse mevcut deger korunuyor; yalnizca
      // acikca gonderildiginde (sayi ya da null) degisiyor.
      data: {
        isFeatured: true,
        featuredUntil: until,
        ...(dto.sira !== undefined ? { featuredOrder: dto.sira } : {}),
      },
    });

    this.audit.log({
      actorId: adminId ?? 'system',
      action: ilkEkleme ? 'listing.featured.add' : 'listing.featured.extend',
      entity: 'Listing',
      entityId: id,
      // Kisisel veri yok: yalnizca sure bilgisi.
      meta: { days, until: until.toISOString() },
    });

    if (ilkEkleme) {
      const listingSlug = buildListingSlug(listing as any);
      const body = `"${listing.title}" ilanın ${days} gün boyunca vitrinde öne çıkacak.`;
      this.prisma.notification.create({
        data: {
          userId: listing.sellerId,
          type: 'listing.featured',
          title: 'İlanın öne çıkarıldı! ⭐',
          body,
          payload: { listingId: id, listingSlug },
        },
      }).catch(() => null);
      this.webPush.sendToUser(listing.sellerId, {
        title: 'İlanın öne çıkarıldı! ⭐',
        body,
        url: `/ilan/${listingSlug}`,
      }, 'listingStatus').catch(() => null);
      this.fcm.sendToUser(listing.sellerId, {
        title: 'İlanın öne çıkarıldı! ⭐',
        body,
        data: { type: 'listing', listingId: id },
      }, 'listingStatus').catch(() => null);
    }

    return updated;
  }

  /** Sitedeki vitrin seridinin gosterdigi ilan sayisi — ana sayfa ile ayni kosul. */
  private vitrinSitedeKosulu() {
    return {
      isFeatured: true,
      featuredUntil: { gt: new Date() },
      status: ListingStatus.ACTIVE,
      deletedAt: null,
      isTest: false,
    };
  }

  /**
   * Vitrin yonetim ekraninin verisi.
   *
   * Public /listings?isFeatured=true ile ayni sey DEGIL ve olmamali:
   * orada yalnizca sitede GORUNEN ilanlar var. Panelin gormesi gereken
   * sey ise bayragi acik olan HER ilan - cunku satilmis, pasife alinmis
   * ya da suresi dolmus bir ilan sitede gorunmuyor ama bayragi acik
   * kaldigi icin kimse farketmeden "vitrinde" sayiliyor. Bu kayitlar
   * ayri bir "dikkat" listesi olarak donuyor.
   *
   * Siralama: sitedeki serit createdAt DESC ile donuyor (otomatik
   * donen karusel, sabit sira yok). Panelde ise bitis tarihine gore
   * siralıyoruz - "hangisi once bitiyor" sorusu gunluk isin ta kendisi.
   */
  /**
   * Vitrin sirasini topluca kaydeder.
   *
   * Sure ve sira bilerek AYRI: sirayi degistirmek icin "vitrine ekle"
   * ucunu cagirmak, her surukleme isleminde ilanin vitrin suresini de
   * uzatirdi. Burada yalnizca `featuredOrder` yaziliyor; tarihe
   * dokunulmuyor.
   *
   * Yalnizca bayragi ACIK ilanlar siralanabiliyor. Aksi halde vitrinde
   * olmayan bir ilana sira verilir, sonra vitrine eklendiginde kimsenin
   * beklemedigi bir yerde belirirdi.
   */
  async vitrinSirasiniKaydet(sira: { id: string; sira: number }[], adminId?: string) {
    const idler = sira.map((x) => x.id);
    const uygun = await this.prisma.listing.findMany({
      where: { id: { in: idler }, isFeatured: true, deletedAt: null },
      select: { id: true },
    });
    const uygunIdler = new Set(uygun.map((u) => u.id));
    const yazilacak = sira.filter((x) => uygunIdler.has(x.id));

    await this.prisma.$transaction(
      yazilacak.map((x) =>
        this.prisma.listing.update({ where: { id: x.id }, data: { featuredOrder: x.sira } }),
      ),
    );

    this.audit.log({
      actorId: adminId ?? 'system',
      action: 'listing.featured.reorder',
      entity: 'Listing',
      entityId: yazilacak.map((x) => x.id).join(','),
      meta: { adet: yazilacak.length, atlanan: idler.length - yazilacak.length },
    });

    return { kaydedilen: yazilacak.length, atlanan: idler.length - yazilacak.length };
  }

  async vitrinOzeti() {
    const simdi = new Date();
    const [hepsi, sitedeAdet] = await Promise.all([
      this.prisma.listing.findMany({
        where: { isFeatured: true, deletedAt: null },
        // Elle sira verilmisse panel de o dizilisi gosteriyor; aksi
        // halde "hangisi once bitiyor" sorusu one geciyor.
        orderBy: [
          { featuredOrder: { sort: 'asc', nulls: 'last' } },
          { featuredUntil: 'asc' },
        ],
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          seller: { select: { id: true, displayName: true } },
          category: { select: { id: true, name: true, slug: true, parentId: true, parent: { select: { slug: true } } } },
        },
      }),
      this.prisma.listing.count({ where: this.vitrinSitedeKosulu() }),
    ]);

    const sorunNedeni = (l: (typeof hepsi)[number]): string | null => {
      if (!l.featuredUntil || l.featuredUntil.getTime() <= simdi.getTime()) return 'sure_doldu';
      if (l.isTest) return 'test_ilani';
      if (l.status !== ListingStatus.ACTIVE) return 'yayinda_degil';
      return null;
    };

    const items = hepsi.map((l) => ({
      ...l,
      slug: buildListingSlug(l),
      sitedeGorunuyor: sorunNedeni(l) === null,
      sorunNedeni: sorunNedeni(l),
    }));

    // Yakinda bitecek esigi 3 GUN. Sabit ve raporda aciklanmis olmasi
    // gerekiyor; "yakinda" tanimsiz bir sayi uretirdi.
    const yakindaBitenEsikGun = 3;
    const esik = new Date(simdi.getTime() + yakindaBitenEsikGun * 86_400_000);

    return {
      items,
      ozet: {
        sitedeGorunen: sitedeAdet,
        bayragiAcik: items.length,
        yakindaBiten: items.filter(
          (l) => l.sitedeGorunuyor && l.featuredUntil && l.featuredUntil <= esik,
        ).length,
        yakindaBitenEsikGun,
        dikkatGerektiren: items.filter((l) => !l.sitedeGorunuyor).length,
        // Vitrin gosterimi ve tiklamasi icin olcum KURULMADI. Sifir
        // donmek yanlis olur: olculmedigini soylemek zorundayiz.
        gosterim: null as number | null,
        tiklama: null as number | null,
        tiklamaOrani: null as number | null,
        olcumNotu:
          'Vitrin gösterimi ve vitrin tıklaması için ayrı bir ölçüm kurulmadı. ' +
          'İlanın toplam detay görüntülenmesi vitrin gösterimi değildir; yerleşim ' +
          'bazlı ayrım olmadan CTR hesaplanamaz.',
        siralamaNotu:
          'Sitedeki vitrin şeridi otomatik dönen bir karuseldir ve ilanları en yeni ' +
          'ilandan başlayarak gösterir (en fazla 12 ilan). Elle sabit sıra için veri ' +
          'modelinde sıra alanı yok.',
      },
    };
  }

  /**
   * Vitrine eklenebilecek ilanlari arar.
   *
   * Public arama ucu yerine ayri bir admin ucu olmasinin nedeni: public
   * uc test ilanlarini ve yayinda olmayanlari hic dondurmuyor, dolayisiyla
   * "ilan neden bulunamiyor" sorusu panelden cevaplanamiyordu. Burada
   * yayinda olmayan ilan da donuyor ama `uygun: false` ile - panel neden
   * eklenemedigini soyleyebiliyor.
   *
   * Arama: baslik, satici adi, marka adi ve ilan ID'si. ID aramasi
   * onemli; ilani sitede gorup panele gelen kullanici adresi yapistirip
   * dogrudan bulabiliyor.
   */
  async vitrinAdaylari(search?: string, limit = 20) {
    const q = (search ?? '').trim();
    if (q.length < 2) return { items: [], meta: { total: 0, limit } };

    // Yapistirilan adresten CUID cikar: ".../ilan/kask-xyz-cmv6l48x8001097aa32lp4eo1"
    const cuid = q.match(/c[a-z0-9]{24}/)?.[0];

    const where: any = {
      deletedAt: null,
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { seller: { displayName: { contains: q, mode: 'insensitive' } } },
        { brand: { name: { contains: q, mode: 'insensitive' } } },
        ...(cuid ? [{ id: cuid }] : []),
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 50),
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          seller: { select: { id: true, displayName: true } },
          brand: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, slug: true, parentId: true, parent: { select: { slug: true } } } },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    const simdi = new Date();
    return {
      items: items.map((l) => ({
        ...l,
        slug: buildListingSlug(l),
        vitrindeMi: l.isFeatured && !!l.featuredUntil && l.featuredUntil > simdi,
        uygun: l.status === ListingStatus.ACTIVE && !l.isTest,
        uygunsuzlukNedeni: l.isTest
          ? 'test_ilani'
          : l.status !== ListingStatus.ACTIVE
            ? 'yayinda_degil'
            : null,
      })),
      meta: { total, limit },
    };
  }

  async updateListing(id: string, sellerId: string, dto: UpdateListingDto) {
    const listing = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId !== sellerId) throw new ForbiddenException();
    if (['SOLD', 'REJECTED'].includes(listing.status)) {
      throw new BadRequestException('Cannot edit listing with status: ' + listing.status);
    }

    const { imageUrls, imageCrops, ...rest } = dto;
    if (imageUrls !== undefined) gorselleriDogrula(imageUrls);

    const categoryId = rest.categoryId ?? listing.categoryId;
    const brandId = rest.brandId !== undefined ? (rest.brandId || null) : listing.brandId;

    const [category, brand] = await Promise.all([
      categoryId ? this.prisma.category.findUnique({ where: { id: categoryId } }) : null,
      brandId ? this.prisma.brand.findUnique({ where: { id: brandId } }) : null,
    ]);

    const tags = buildAutoTags({
      brandName: brand?.name,
      categoryName: category?.name,
      city: rest.city ?? listing.city,
      sizeLabel: rest.sizeLabel ?? listing.sizeLabel,
      condition: rest.condition ?? listing.condition,
      title: rest.title ?? listing.title,
    });

    // ── Yayindaki ilan: icerik ile fiyat ayri degerlendiriliyor ──────
    //
    // Onceden ACTIVE bir ilanda HERHANGI bir degisiklik ilani
    // PENDING_REVIEW'a dusuruyor ve aramadan kaldiriyordu. Incelenmemis
    // icerik yayina sizmiyordu (dogru) ama fiyatini indiren satici da
    // ilanini yayindan indirmis oluyordu.
    //
    // Artik: icerik degisirse ONAYLI surum yayinda kaliyor, yeni surum
    // ListingPendingEdit'te bekliyor. Arama, detay sayfasi ve Story karti
    // her zaman Listing satirini okudugu icin incelenmemis icerik hicbir
    // kanalda gorunmuyor.
    if (listing.status === 'ACTIVE') {
      const mevcutSatirlar = await this.prisma.listingImage.findMany({
        where: { listingId: id },
        orderBy: { sortOrder: 'asc' },
        select: { url: true, crop: true },
      });
      const mevcutGorseller = mevcutSatirlar.map((g) => g.url);
      const mevcutKadrajlar = Object.fromEntries(
        mevcutSatirlar.filter((g) => g.crop).map((g) => [g.url, g.crop]),
      );

      const incelemelik = degisenIncelemeAlanlari(
        dto as Record<string, unknown>,
        listing as unknown as Record<string, unknown>,
        mevcutGorseller,
        mevcutKadrajlar,
      );

      if (incelemelik.length > 0) {
        return this.bekleyenDuzenlemeOlustur(id, sellerId, dto, incelemelik, listing, tags);
      }
      // Yalnizca serbest alanlar degismis: dogrudan uygula, ilan yayinda
      // kalsin.
      return this.serbestAlanlariUygula(id, sellerId, dto, listing);
    }

    return this.prisma.$transaction(async (tx) => {
      if (imageUrls !== undefined) {
        const kadrajlar = kadrajHaritasiniCoz(imageCrops, imageUrls);
        await tx.listingImage.deleteMany({ where: { listingId: id } });
        await tx.listingImage.createMany({
          data: imageUrls.map((url, i) => ({
            listingId: id, url, sortOrder: i,
            crop: kadrajlar[url] ?? undefined,
          })),
        });
      }

      // ARCHIVED → düzenlenince tekrar moderasyona gönder.
      // ACTIVE buraya gelmiyor; yukarida ayri ele aliniyor.
      const newStatus = listing.status === 'ARCHIVED' ? 'PENDING_REVIEW' : listing.status;

      const updated = await tx.listing.update({
        where: { id },
        data: {
          ...rest,
          brandId: rest.brandId === '' ? null : rest.brandId,
          city: rest.city === '' ? null : rest.city,
          sizeLabel: rest.sizeLabel === '' ? null : bedenNormalle(rest.sizeLabel),
          status: newStatus as any,
          tags,
        },
        include: { images: { orderBy: { sortOrder: 'asc' } }, category: true, brand: true, seller: true },
      });

      // Fiyat düştüyse favorileyen kullanıcılara bildirim
      if (rest.price !== undefined && Number(rest.price) < Number(listing.price)) {
        this.notifyFavorites(id, listing.title, 'price_drop', {
          oldPrice: Number(listing.price),
          newPrice: Number(rest.price),
        }).catch(() => null);
      }

      this.audit.log({ actorId: sellerId, action: 'listing.update', entity: 'Listing', entityId: id });

      return updated;
    });
  }

  /**
   * Yayindaki ilanda yalnizca serbest alanlar (fiyat, il, ilce) degisti:
   * dogrudan uygula, ilan yayinda kalsin, arama indeksini tazele.
   */
  private async serbestAlanlariUygula(
    id: string,
    sellerId: string,
    dto: UpdateListingDto,
    listing: { title: string; price: unknown },
  ) {
    const veri: Record<string, unknown> = {};
    for (const alan of SERBEST_ALANLAR) {
      const deger = (dto as Record<string, unknown>)[alan];
      if (deger === undefined) continue;
      veri[alan] = deger === '' ? null : deger;
    }

    const updated = await this.prisma.listing.update({
      where: { id },
      data: veri,
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        category: { include: { parent: { select: { slug: true, name: true } } } },
        brand: true,
        seller: true,
      },
    });

    this.search.indexListing(this.toSearchDoc(updated)).catch(() => null);

    if (dto.price !== undefined && Number(dto.price) < Number(listing.price)) {
      this.notifyFavorites(id, listing.title, 'price_drop', {
        oldPrice: Number(listing.price),
        newPrice: Number(dto.price),
      }).catch(() => null);
    }

    // Denetim kaydinda yalnizca HANGI alanlarin degistigi var; degerler
    // yok. Fiyat kisisel veri degil ama denetim kaydi da bir fiyat
    // gecmisi deposu degil.
    this.audit.log({
      actorId: sellerId,
      action: 'listing.update.direct',
      entity: 'Listing',
      entityId: id,
      meta: { alanlar: Object.keys(veri) },
    });

    return { ...updated, bekleyenDuzenleme: null };
  }

  /**
   * Yayindaki ilanda icerik degisti: onayli surum yayinda kalir, yeni
   * surum incelemeyi bekler.
   *
   * Bekleyen bir duzenleme zaten varsa UZERINE YAZILIYOR - satici
   * duzenlemesini birkac kez revize edebilir, her seferinde kuyrukta yeni
   * bir kayit birikmemeli.
   */
  private async bekleyenDuzenlemeOlustur(
    id: string,
    sellerId: string,
    dto: UpdateListingDto,
    degisenAlanlar: readonly string[],
    listing: { title: string },
    tags: string[],
  ) {
    const d = dto as Record<string, unknown>;
    // Kadraj degisikligi de gorselleri tasiyor: onay aninda
    // ListingImage satirlari yeniden yazilacagi icin adresler de
    // elimizde olmali, yoksa kadraj uygulanacak satir bulunamaz.
    const gorsellerDegisti =
      degisenAlanlar.includes('imageUrls') || degisenAlanlar.includes('imageCrops');

    /**
     * YALNIZCA kadraj degistiyse `imageUrls` istekte hic gelmiyor.
     * Bos dizi yazmak, onay aninda ilanin TUM fotograflarini silerdi.
     * Bu yuzden mevcut adresleri okuyup oldugu gibi tasiyoruz.
     */
    const gorselAdresleri =
      (d.imageUrls as string[] | undefined) ??
      (gorsellerDegisti
        ? (
            await this.prisma.listingImage.findMany({
              where: { listingId: id },
              orderBy: { sortOrder: 'asc' },
              select: { url: true },
            })
          ).map((g) => g.url)
        : []);

    const veri = {
      title: (d.title as string) ?? null,
      description: (d.description as string) ?? null,
      categoryId: (d.categoryId as string) || null,
      brandId: (d.brandId as string) || null,
      condition: (d.condition as any) ?? null,
      gender: (d.gender as any) ?? null,
      sizeLabel: d.sizeLabel ? bedenNormalle(d.sizeLabel as string) : null,
      imageUrls: gorsellerDegisti ? gorselAdresleri : [],
      imagesChanged: gorsellerDegisti,
      /**
       * Kadraj da INCELENMEMIS icerik.
       *
       * Kadraj degisikligi gorunuru degistirir: kullanici kadraji
       * oynatarak kartta bambaska bir sey gosterebilir. Bu yuzden
       * onaylanana kadar Listing satirina gecmiyor, burada bekliyor.
       * Arama, detay ve Story karti her zaman Listing satirini
       * okudugu icin incelenmemis kadraj hicbir kanalda gorunmuyor.
       */
      imageCrops: gorsellerDegisti
        ? (kadrajHaritasiniCoz(d.imageCrops, gorselAdresleri) as any)
        : undefined,
    };

    await this.prisma.listingPendingEdit.upsert({
      where: { listingId: id },
      create: { listingId: id, ...veri },
      update: veri,
    });

    // Serbest alanlar (fiyat, konum) ayni istekte gelmis olabilir; onlar
    // beklemeden uygulanmali, yoksa fiyat degisikligi icerik incelemesine
    // takilmis olurdu.
    const serbest: Record<string, unknown> = {};
    for (const alan of SERBEST_ALANLAR) {
      const deger = d[alan];
      if (deger !== undefined) serbest[alan] = deger === '' ? null : deger;
    }
    if (Object.keys(serbest).length) {
      await this.prisma.listing.update({ where: { id }, data: serbest });
    }

    this.bekleyenDuzenlemeyiModeratorlereBildir(id, listing.title).catch(() => null);

    this.audit.log({
      actorId: sellerId,
      action: 'listing.edit.pending',
      entity: 'Listing',
      entityId: id,
      meta: { alanlar: [...degisenAlanlar] },
    });

    const guncel = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        category: { include: { parent: { select: { slug: true, name: true } } } },
        brand: true,
        seller: true,
        bekleyenDuzenleme: true,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: sellerId,
        type: 'listing.edit.pending',
        title: 'Değişikliklerin incelemede',
        body: `"${listing.title}" ilanındaki değişiklikler inceleniyor. Onaylanana kadar ilanının önceki hali yayında kalmaya devam ediyor.`,
        payload: { listingId: id },
      },
    }).catch(() => null);

    return guncel;
  }

  /** Bekleyen duzenleme kuyruguna dustugunu moderatorlere haber verir. */
  private async bekleyenDuzenlemeyiModeratorlereBildir(listingId: string, baslik: string) {
    const moderatorler = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'] }, deletedAt: null },
      select: { id: true },
    });
    if (!moderatorler.length) return;
    await this.prisma.notification.createMany({
      data: moderatorler.map((m) => ({
        userId: m.id,
        type: 'moderation.edit.pending',
        title: 'İlan düzenlemesi incelemede',
        body: `"${baslik}" ilanında içerik değişikliği var.`,
        payload: { listingId },
      })),
    });
  }

  // ── Bekleyen duzenleme: moderator tarafi ──────────────────────────

  /** Inceleme bekleyen icerik duzenlemeleri. */
  async bekleyenDuzenlemeler() {
    const satirlar = await this.prisma.listingPendingEdit.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        listing: {
          select: {
            id: true, title: true, description: true, status: true, isTest: true,
            categoryId: true, brandId: true, condition: true, gender: true, sizeLabel: true,
            images: { orderBy: { sortOrder: 'asc' }, select: { url: true } },
            seller: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    // Onayli surum ile bekleyen surumu YAN YANA donuyoruz: moderator neyin
    // degistigini gormeden karar veremez.
    return satirlar.map((b) => ({
      id: b.id,
      listingId: b.listingId,
      olusturuldu: b.createdAt,
      guncellendi: b.updatedAt,
      satici: b.listing.seller,
      testIlani: b.listing.isTest,
      yayindaki: {
        title: b.listing.title,
        description: b.listing.description,
        categoryId: b.listing.categoryId,
        brandId: b.listing.brandId,
        condition: b.listing.condition,
        gender: b.listing.gender,
        sizeLabel: b.listing.sizeLabel,
        imageUrls: b.listing.images.map((g) => g.url),
      },
      bekleyen: {
        title: b.title,
        description: b.description,
        categoryId: b.categoryId,
        brandId: b.brandId,
        condition: b.condition,
        gender: b.gender,
        sizeLabel: b.sizeLabel,
        imageUrls: b.imagesChanged ? b.imageUrls : null,
      },
    }));
  }

  /**
   * Bekleyen duzenlemeyi onaylar: icerik yayindaki ilana isleniyor.
   *
   * beklenenSurum, moderatorun GORDUGU surumun zaman damgasi. Satici
   * moderator inceleme yaparken duzenlemesini revize etmis olabilir;
   * damga tutmazsa islem reddediliyor, yoksa moderator gormedigi bir
   * icerigi onaylamis olurdu.
   */
  async bekleyenDuzenlemeyiOnayla(listingId: string, adminId: string, beklenenSurum?: string) {
    const bekleyen = await this.prisma.listingPendingEdit.findUnique({
      where: { listingId },
      include: { listing: { select: { id: true, sellerId: true, title: true, status: true } } },
    });
    if (!bekleyen) throw new NotFoundException('Bekleyen düzenleme bulunamadı');

    if (beklenenSurum && new Date(beklenenSurum).getTime() !== bekleyen.updatedAt.getTime()) {
      throw new ConflictException(
        'Bu düzenleme siz incelerken güncellendi. Sayfayı yenileyip yeni halini inceleyin.',
      );
    }

    const veri: Record<string, unknown> = {};
    for (const alan of ['title', 'description', 'categoryId', 'brandId', 'condition', 'gender', 'sizeLabel'] as const) {
      const deger = bekleyen[alan];
      if (deger !== null && deger !== undefined) veri[alan] = deger;
    }

    const guncel = await this.prisma.$transaction(async (tx) => {
      if (bekleyen.imagesChanged) {
        const kadrajlar = kadrajHaritasiniCoz(bekleyen.imageCrops, bekleyen.imageUrls);
        await tx.listingImage.deleteMany({ where: { listingId } });
        await tx.listingImage.createMany({
          data: bekleyen.imageUrls.map((url, i) => ({
            listingId, url, sortOrder: i,
            crop: kadrajlar[url] ?? undefined,
          })),
        });
      }
      await tx.listing.update({ where: { id: listingId }, data: veri });
      await tx.listingPendingEdit.delete({ where: { listingId } });
      return tx.listing.findUnique({
        where: { id: listingId },
        include: {
          images: { orderBy: { sortOrder: 'asc' } },
          category: { include: { parent: { select: { slug: true, name: true } } } },
          brand: true,
          seller: { select: { id: true, displayName: true } },
        },
      });
    });

    // Etiketler icerikten uretiliyor; icerik degistiyse tazelenmeli.
    if (guncel) {
      const tags = buildAutoTags({
        brandName: guncel.brand?.name,
        categoryName: guncel.category?.name,
        city: guncel.city,
        sizeLabel: guncel.sizeLabel,
        condition: guncel.condition,
        title: guncel.title,
      });
      await this.prisma.listing.update({ where: { id: listingId }, data: { tags } });
      // Test ilani arama indeksine girmiyor.
      if (guncel.status === 'ACTIVE' && !guncel.isTest) {
        this.search.indexListing(this.toSearchDoc({ ...guncel, tags })).catch(() => null);
      }
    }

    this.audit.log({
      actorId: adminId,
      action: 'listing.edit.approve',
      entity: 'Listing',
      entityId: listingId,
      meta: { alanlar: Object.keys(veri), gorsellerDegisti: bekleyen.imagesChanged },
    });

    await this.prisma.notification.create({
      data: {
        userId: bekleyen.listing.sellerId,
        type: 'listing.edit.approved',
        title: 'Değişikliklerin yayında',
        body: `"${bekleyen.listing.title}" ilanındaki değişiklikler onaylandı ve yayına alındı.`,
        payload: { listingId },
      },
    }).catch(() => null);

    return guncel;
  }

  /**
   * Bekleyen duzenlemeyi reddeder: yayindaki onayli surum oldugu gibi
   * kaliyor, yalnizca bekleyen icerik siliniyor. Ilan yayindan
   * INMIYOR - reddedilen bir degisiklik, onaylanmis ilani cezalandirmamali.
   */
  async bekleyenDuzenlemeyiReddet(listingId: string, adminId: string, nedenKodu?: string) {
    const bekleyen = await this.prisma.listingPendingEdit.findUnique({
      where: { listingId },
      include: { listing: { select: { sellerId: true, title: true } } },
    });
    if (!bekleyen) throw new NotFoundException('Bekleyen düzenleme bulunamadı');

    await this.prisma.listingPendingEdit.delete({ where: { listingId } });

    this.audit.log({
      actorId: adminId,
      action: 'listing.edit.reject',
      entity: 'Listing',
      entityId: listingId,
      meta: { nedenKodu: nedenKodu ?? null },
    });

    await this.prisma.notification.create({
      data: {
        userId: bekleyen.listing.sellerId,
        type: 'listing.edit.rejected',
        title: 'Değişikliklerin onaylanmadı',
        body: `"${bekleyen.listing.title}" ilanındaki değişiklikler onaylanmadı. İlanın önceki hali yayında kalmaya devam ediyor.`,
        payload: { listingId },
      },
    }).catch(() => null);

    return { reddedildi: true };
  }

  // ── Test isareti (yalnizca SUPER_ADMIN) ───────────────────────────

  /**
   * Ilani test olarak isaretler ya da isareti kaldirir.
   *
   * Isaret hicbir erisim ya da moderasyon kontrolunu devre disi
   * birakmiyor: test ilani da onaydan geciyor, sahiplik kurallari aynen
   * isliyor. Yaptigi tek sey genel listelerden ve raporlardan cikarmak.
   *
   * Basligi "test" iceren ilan OTOMATIK isaretlenmiyor: gercek bir
   * "Test surusu yapilmis kask" ilanini yanlislikla gizlerdi. Isaret
   * her zaman acik bir yonetici karari.
   */
  async testIsaretiAyarla(listingId: string, isTest: boolean, adminId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true, status: true, isTest: true },
    });
    if (!listing) throw new NotFoundException('İlan bulunamadı');
    if (listing.isTest === isTest) return { listingId, isTest, degisiklikYok: true };

    await this.prisma.listing.update({ where: { id: listingId }, data: { isTest } });

    // Arama indeksi isaretle birlikte degisiyor: test yapilan ilan
    // indeksten cikmali, isaret kalkan yayindaki ilan geri girmeli.
    if (isTest) {
      this.search.removeListing(listingId).catch(() => null);
    } else if (listing.status === 'ACTIVE') {
      const tam = await this.prisma.listing.findUnique({
        where: { id: listingId },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          category: { include: { parent: { select: { slug: true, name: true } } } },
          brand: true,
          seller: { select: { id: true, displayName: true } },
        },
      });
      if (tam) this.search.indexListing(this.toSearchDoc(tam)).catch(() => null);
    }

    this.audit.log({
      actorId: adminId,
      action: isTest ? 'listing.test.mark' : 'listing.test.unmark',
      entity: 'Listing',
      entityId: listingId,
    });
    return { listingId, isTest };
  }

  /**
   * Hesabi test hesabi olarak isaretler.
   *
   * Hesabin MEVCUT ilanlari da isaretleniyor: aksi halde isaretten once
   * verilmis test ilanlari genel listelerde kalmaya devam ederdi.
   * Isaret kaldirilirsa ilanlar OTOMATIK geri alinmiyor - hangi ilanin
   * gercekten test oldugunu yalnizca yonetici bilir, topluca geri almak
   * gercek bir ilani yanlislikla yayina sokabilir.
   */
  async testHesabiAyarla(userId: string, isTest: boolean, adminId: string) {
    const kullanici = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isTestAccount: true },
    });
    if (!kullanici) throw new NotFoundException('Kullanıcı bulunamadı');

    const sonuc = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isTestAccount: isTest } });
      if (!isTest) return { ilan: 0 };
      const { count } = await tx.listing.updateMany({
        where: { sellerId: userId, deletedAt: null, isTest: false },
        data: { isTest: true },
      });
      return { ilan: count };
    });

    if (isTest) {
      const ilanlar = await this.prisma.listing.findMany({
        where: { sellerId: userId, deletedAt: null },
        select: { id: true },
      });
      for (const l of ilanlar) this.search.removeListing(l.id).catch(() => null);
    }

    this.audit.log({
      actorId: adminId,
      action: isTest ? 'user.test.mark' : 'user.test.unmark',
      entity: 'User',
      entityId: userId,
      meta: { etkilenenIlan: sonuc.ilan },
    });
    return { userId, isTestAccount: isTest, isaretlenenIlan: sonuc.ilan };
  }

  /** Yonetici raporu: test olarak isaretlenmis kayitlar. */
  async testKayitlari() {
    const [hesaplar, ilanlar] = await Promise.all([
      this.prisma.user.findMany({
        where: { isTestAccount: true, deletedAt: null },
        select: { id: true, displayName: true, role: true, createdAt: true,
                  _count: { select: { listings: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.listing.findMany({
        where: { isTest: true, deletedAt: null },
        select: { id: true, title: true, status: true, createdAt: true, publishedAt: true,
                  seller: { select: { id: true, displayName: true, isTestAccount: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    return { hesaplar, ilanlar };
  }

  async toggleListingStatus(id: string, sellerId: string) {
    const listing = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId !== sellerId) throw new ForbiddenException();

    if (!['ACTIVE', 'ARCHIVED'].includes(listing.status)) {
      throw new BadRequestException('Yalnızca aktif veya arşivlenmiş ilanlar değiştirilebilir');
    }

    const newStatus = listing.status === 'ACTIVE' ? ListingStatus.ARCHIVED : ListingStatus.ACTIVE;

    const updated = await this.prisma.listing.update({
      where: { id },
      data: { status: newStatus },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: true,
        brand: true,
        seller: { select: { id: true, displayName: true } },
      },
    });

    if (newStatus === ListingStatus.ACTIVE) {
      this.search.indexListing(this.toSearchDoc(updated)).catch(() => null);
    } else {
      this.search.removeListing(id).catch(() => null);
    }

    this.audit.log({ actorId: sellerId, action: 'listing.status_change', entity: 'Listing', entityId: id, meta: { from: listing.status, to: newStatus } });

    return updated;
  }

  async deleteListing(id: string, sellerId: string) {
    const listing = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId !== sellerId) throw new ForbiddenException();
    if (['PAID_ESCROW', 'SHIPPED', 'DELIVERED'].includes(listing.status as string)) {
      throw new BadRequestException('Cannot delete listing with an active order');
    }

    await this.prisma.listing.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });

    this.search.removeListing(id).catch(() => null);
    this.audit.log({ actorId: sellerId, action: 'listing.delete', entity: 'Listing', entityId: id, meta: { title: listing.title } });

    return { success: true };
  }

  async getMyListings(sellerId: string, status?: ListingStatus) {
    const listings = await this.prisma.listing.findMany({
      where: { sellerId, deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: { include: { parent: { select: { slug: true, name: true } } } },
        // Satici hangi ilanlarinda degisiklik bekledigini listede gormeli;
        // tek tek acip bakmasi gerekmesin.
        bekleyenDuzenleme: { select: { createdAt: true, updatedAt: true } },
      },
    });
    return listings.map(l => ({
      ...l,
      slug: buildListingSlug(l),
      degisiklikIncelemede: !!l.bekleyenDuzenleme,
    }));
  }

  async toggleFavorite(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: ListingStatus.ACTIVE, deletedAt: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const existing = await this.prisma.favorite.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });

    if (existing) {
      await this.prisma.$transaction([
        this.prisma.favorite.delete({ where: { userId_listingId: { userId, listingId } } }),
        this.prisma.listing.update({ where: { id: listingId }, data: { favoriteCount: { decrement: 1 } } }),
      ]);
      return { favorited: false };
    }

    const [, guncel] = await this.prisma.$transaction([
      this.prisma.favorite.create({ data: { userId, listingId } }),
      this.prisma.listing.update({ where: { id: listingId }, data: { favoriteCount: { increment: 1 } } }),
    ]);

    // Satıcıya haber ver: ilanı ilgi görüyor.
    //
    // Kendi ilanını favorileyen satıcıya mail atmıyoruz - kendi
    // hareketinin bildirimini almak saçma olurdu.
    if (listing.sellerId !== userId) {
      this.saticiyaFavoriBildir(listing.sellerId, listingId, listing.title, guncel.favoriteCount).catch(() => null);
    }

    return { favorited: true };
  }

  /**
   * İlan favorilendiğinde satıcıya bildirim + mail.
   *
   * Favoriyi KİMİN eklediği bilinçli olarak yazılmıyor: alıcının hangi
   * ilanla ilgilendiği onun bilgisi, satıcıya isim vermek gereksiz bir
   * ifşa olurdu. Satıcıya giden tek sayı toplam favori adedi.
   */
  private async saticiyaFavoriBildir(
    sellerId: string,
    listingId: string,
    listingTitle: string,
    toplamFavori: number,
  ) {
    const [satici, ilan] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: sellerId, deletedAt: null, status: 'ACTIVE', emailVerifiedAt: { not: null } },
        select: { email: true, displayName: true, notificationPrefs: true },
      }),
      this.prisma.listing.findFirst({
        where: { id: listingId },
        include: { category: { include: { parent: { select: { slug: true, name: true } } } } },
      }),
    ]);

    await this.prisma.notification.create({
      data: {
        userId: sellerId,
        type: 'listing.favorited',
        title: '⭐ İlanın favorilere eklendi',
        body: `"${listingTitle}" ilanın ${toplamFavori} kez favorilendi.`,
        payload: { listingId, favoriteCount: toplamFavori },
      },
    });

    if (!satici) return;
    const prefs = (satici.notificationPrefs as any) ?? {};
    if (prefs.listingStatus === false) return;

    const slugUrl = ilan ? buildListingSlug(ilan) : listingId;
    this.mail
      .sendListingFavoritedEmail(satici.email, satici.displayName, listingTitle, toplamFavori, slugUrl)
      .catch(() => null);
  }

  async getMyFavorites(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          include: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
            seller: { select: { id: true, displayName: true, avatarUrl: true } },
            category: { include: { parent: { select: { slug: true, name: true } } } },
          },
        },
      },
    });

    return favorites.map((f) => ({ ...f.listing, slug: buildListingSlug(f.listing) }));
  }

  // Admin/moderatör tarafından çağrılır
  async changeStatus(id: string, status: ListingStatus) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, deletedAt: null },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: true,
        brand: true,
        seller: { select: { id: true, displayName: true } },
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        status,
        publishedAt: status === ListingStatus.ACTIVE && !listing.publishedAt ? new Date() : listing.publishedAt,
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: true,
        brand: true,
        seller: { select: { id: true, displayName: true } },
      },
    });

    if (status === ListingStatus.ACTIVE) {
      this.search.indexListing(this.toSearchDoc(updated)).catch(() => null);
    } else {
      this.search.removeListing(id).catch(() => null);
    }

    if (status === ListingStatus.SOLD) {
      this.notifyFavorites(id, listing.title, 'listing_sold', {}).catch(() => null);
    }

    return updated;
  }

  private async notifyFavorites(
    listingId: string,
    listingTitle: string,
    type: 'price_drop' | 'listing_sold',
    meta: Record<string, any>,
    listingSlug?: string,
  ) {
    const [favorites, listingForSlug] = await Promise.all([
      this.prisma.favorite.findMany({ where: { listingId }, select: { userId: true } }),
      listingSlug ? Promise.resolve(null) : this.prisma.listing.findFirst({
        where: { id: listingId },
        include: { category: { include: { parent: { select: { slug: true, name: true } } } } },
      }),
    ]);
    const slugUrl = listingSlug ?? (listingForSlug ? buildListingSlug(listingForSlug) : listingId);
    if (favorites.length === 0) return;

    const notifications = favorites.map(f => ({
      userId: f.userId,
      type: `favorite.${type}`,
      title: type === 'price_drop'
        ? '💰 Fiyat düştü!'
        : '🔴 Favori ilan satıldı',
      body: type === 'price_drop'
        ? `"${listingTitle}" ilanında fiyat ${meta.oldPrice.toFixed(0)} ₺ → ${meta.newPrice.toFixed(0)} ₺ oldu.`
        : `"${listingTitle}" ilanı satılmış. Benzer ilanları keşfet!`,
      payload: { listingId, listingSlug: listingSlug ?? listingId, ...meta },
    }));

    await this.prisma.notification.createMany({ data: notifications });

    // Web Push — aynı kullanıcılara push bildirimi
    const userIds = favorites.map(f => f.userId);
    const pushPayload = type === 'price_drop'
      ? { title: 'Fiyat düştü!', body: `"${listingTitle}" ${meta.oldPrice.toFixed(0)} ₺ → ${meta.newPrice.toFixed(0)} ₺`, url: `/ilan/${slugUrl}` }
      : { title: 'Favori ilan satıldı', body: `"${listingTitle}" artık mevcut değil.`, url: '/' };
    this.webPush.sendToMany(userIds, pushPayload, type === 'price_drop' ? 'priceDrops' : 'listingStatus').catch(() => null);
    this.fcm.sendToMany(
      userIds,
      { title: pushPayload.title, body: pushPayload.body, data: { type: 'listing', listingId } },
      type === 'price_drop' ? 'priceDrops' : 'listingStatus',
    ).catch(() => null);

    // Fiyat düşüşünde ayrıca mail. Bildirim ve push yalnızca uygulamayı/siteyi
    // açan kullanıcıya ulaşıyor; oysa favorilediği ürünün ucuzlaması tam da
    // geri getirmesi gereken haber. Satıldı bildiriminde mail atmıyoruz -
    // yapılacak bir şey yok, sadece rahatsız ederdi.
    if (type === 'price_drop') {
      const alicilar = await this.prisma.user.findMany({
        where: { id: { in: userIds }, deletedAt: null, status: 'ACTIVE', emailVerifiedAt: { not: null } },
        select: { email: true, displayName: true, notificationPrefs: true },
      });
      for (const u of alicilar) {
        // Push ile aynı tercihe bağlı: kullanıcı fiyat düşüşü bildirimini
        // kapattıysa mail de gitmemeli, yoksa kapatma anlamsız olur.
        const prefs = (u.notificationPrefs as any) ?? {};
        if (prefs.priceDrops === false) continue;
        this.mail
          .sendFavoritePriceDropEmail(u.email, u.displayName, listingTitle, meta.oldPrice, meta.newPrice, slugUrl)
          .catch(() => null);
      }
    }
  }

  async reindexAll() {
    const listings = await this.prisma.listing.findMany({
      // Test ilanlari arama indeksine hic girmiyor.
      where: { status: ListingStatus.ACTIVE, deletedAt: null, isTest: false },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: true,
        brand: true,
        seller: { select: { id: true, displayName: true } },
      },
    });

    await this.search.reindexAll(listings.map((l) => this.toSearchDoc(l)));
    return { indexed: listings.length };
  }

  /**
   * Alıcı adayları: ilanla ilgili teklif veren veya mesajlaşan kullanıcılar.
   * Satıcı "satıldı" işaretlerken buradan alıcıyı seçer; seçim yorum hakkını açar.
   */
  async getBuyerCandidates(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, sellerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const [offers, conversations] = await Promise.all([
      this.prisma.offer.findMany({
        where: { listingId },
        select: { buyerId: true, status: true, buyer: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.conversationParticipant.findMany({
        where: {
          conversation: { listingId },
          userId: { not: userId },
        },
        select: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      }),
    ]);

    const seen = new Map<string, { id: string; displayName: string; avatarUrl: string | null; source: string }>();
    for (const o of offers) {
      if (!o.buyer) continue;
      seen.set(o.buyer.id, {
        ...o.buyer,
        source: o.status === 'ACCEPTED' ? 'accepted_offer' : 'offer',
      });
    }
    for (const c of conversations) {
      if (!c.user || seen.has(c.user.id)) continue;
      seen.set(c.user.id, { ...c.user, source: 'message' });
    }

    // Kabul edilmiş teklif sahibi en üstte
    return [...seen.values()].sort((a, b) =>
      (a.source === 'accepted_offer' ? -1 : 0) - (b.source === 'accepted_offer' ? -1 : 0),
    );
  }

  async markSold(userId: string, listingId: string, buyerId?: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, sellerId: userId, deletedAt: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (!['ACTIVE', 'RESERVED'].includes(listing.status)) {
      throw new BadRequestException('Only active or reserved listings can be marked as sold');
    }

    if (buyerId) {
      if (buyerId === userId) {
        throw new BadRequestException('Seller cannot be the buyer');
      }
      const buyer = await this.prisma.user.findFirst({
        where: { id: buyerId, deletedAt: null },
        select: { id: true },
      });
      if (!buyer) throw new BadRequestException('Buyer not found');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.listing.update({
        where: { id: listingId },
        data: {
          status: ListingStatus.SOLD,
          reservedUntil: null,
          soldToUserId: buyerId ?? null,
          soldAt: new Date(),
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { salesCount: { increment: 1 } },
      }),
    ]);

    await this.search.removeListing(listingId).catch(() => null);
    await this.notifyFavorites(listingId, listing.title, 'listing_sold', {});

    // Satıcıya tebrik bildirimi
    await this.prisma.notification.create({
      data: {
        userId,
        type: 'listing.sold',
        title: 'Tebrikler, ilanınız satıldı! 🎉',
        body: `"${listing.title}" ilanınızı başarıyla sattınız.`,
        payload: { listingId, listingSlug: buildListingSlug({ ...listing, category: null as any }) },
      },
    }).catch(() => null);

    // Alıcı kaydedildiyse her iki tarafa da değerlendirme daveti gider —
    // yorum akışını besleyen asıl mekanizma bu.
    if (buyerId) {
      const slug = buildListingSlug({ ...listing, category: null as any });
      await this.prisma.notification.createMany({
        data: [
          {
            // Satış şu an yalnızca satıcının beyanı. Alıcıdan onay istiyoruz;
            // onaylanan alışverişler profilde beyandan ayrı gösteriliyor.
            userId: buyerId,
            type: 'sale.confirm_request',
            title: 'Bu alışverişi onaylıyor musun?',
            body: `"${listing.title}" ilanının satıcısı sana sattığını belirtti. Doğruysa onayla.`,
            payload: { listingId, listingSlug: slug },
          },
          {
            userId: buyerId,
            type: 'review.invite',
            title: 'Alışverişiniz nasıl geçti?',
            body: `"${listing.title}" için satıcıyı değerlendirin, diğer alıcılara yardımcı olun.`,
            payload: { listingId, listingSlug: slug, role: 'buyer' },
          },
          {
            userId,
            type: 'review.invite',
            title: 'Alıcıyı değerlendirin',
            body: `"${listing.title}" alıcısı hakkındaki deneyiminizi paylaşın.`,
            payload: { listingId, listingSlug: slug, role: 'seller' },
          },
        ],
      }).catch(() => null);

      // Mail de gönder: değerlendirme daveti yalnızca uygulama içi bildirim
      // olarak duruyordu ve kimse görmüyordu - ratingAvg/ratingCount alanları
      // var ama onları dolduracak bir akış fiilen yoktu. İkinci el alışverişte
      // karar verdiren tek şey karşı tarafın geçmişi, o yüzden bu döngünün
      // kapanması güven puanının varlık sebebi.
      this.degerlendirmeDavetiMaili(buyerId, userId, listingId, listing.title, slug).catch(() => null);
    }

    this.audit.log({ actorId: userId, action: 'listing.status_change', entity: 'Listing', entityId: listingId, meta: { from: listing.status, to: 'SOLD', buyerId: buyerId ?? null } });

    return updated;
  }

  /** Satış kapandığında iki tarafa da değerlendirme daveti maili. */
  private async degerlendirmeDavetiMaili(
    buyerId: string,
    sellerId: string,
    listingId: string,
    listingTitle: string,
    slug: string,
  ) {
    const taraflar = await this.prisma.user.findMany({
      where: {
        id: { in: [buyerId, sellerId] },
        deletedAt: null,
        status: 'ACTIVE',
        emailVerifiedAt: { not: null },
      },
      select: { id: true, email: true, displayName: true },
    });
    for (const t of taraflar) {
      this.mail
        .sendReviewInviteEmail(t.email, t.displayName, listingTitle, t.id === buyerId ? 'buyer' : 'seller', slug)
        .catch(() => null);
    }
  }

  async reserveListing(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, sellerId: userId, deletedAt: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'ACTIVE') {
      throw new BadRequestException('Only active listings can be reserved');
    }

    const reservedUntil = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: 'RESERVED' as any, reservedUntil },
    });
    this.audit.log({ actorId: userId, action: 'listing.status_change', entity: 'Listing', entityId: listingId, meta: { from: listing.status, to: 'RESERVED' } });
    return updated;
  }

  async unreserveListing(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, sellerId: userId, deletedAt: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'RESERVED') {
      throw new BadRequestException('Listing is not reserved');
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: ListingStatus.ACTIVE, reservedUntil: null },
    });
    this.audit.log({ actorId: userId, action: 'listing.status_change', entity: 'Listing', entityId: listingId, meta: { from: 'RESERVED', to: 'ACTIVE' } });
    return updated;
  }

  async reportListing(reporterId: string, listingId: string, reason: string, description?: string) {
    const listing = await this.prisma.listing.findFirst({ where: { id: listingId, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');

    const existing = await this.prisma.report.findFirst({
      where: { reporterId, listingId, status: { in: ['OPEN', 'REVIEWED'] } },
    });
    if (existing) return { alreadyReported: true };

    // Şikayet eden kişi satıcıyla bu ilan üzerinden yazışmışsa şikayeti o
    // konuşmaya bağla — moderatör Şikayetler ekranından doğrudan yazışmaya
    // geçebilsin. Dolandırıcılık şikayetlerinin kanıtı genelde orada.
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        listingId,
        AND: [
          { participants: { some: { userId: reporterId } } },
          { participants: { some: { userId: listing.sellerId } } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType: 'LISTING',
        listingId,
        conversationId: conversation?.id ?? null,
        reason: description ? `${reason}: ${description}` : reason,
        status: 'OPEN',
      },
    });
    this.audit.log({ actorId: reporterId, action: 'report.submit', entity: 'Report', entityId: report.id, meta: { listingId, reason, conversationId: conversation?.id ?? null } });

    // Bildirimi beklemiyoruz: şikâyetin kaydı asıl iş, bildirim
    // gönderilemezse kullanıcıya hata dönmemeli.
    this.notifyModeratorsOfReport(report.id, listingId, listing.title, reason).catch(() => null);

    return { id: report.id, alreadyReported: false };
  }

  async getPriceGuide(categoryId: string, brandId?: string) {
    const where: any = {
      categoryId,
      deletedAt: null,
      status: { in: ['ACTIVE', 'SOLD'] },
      // Test ilani piyasa fiyatini bozar: "1 TL test kask" ortalamayi
      // asagi, "999.999 TL" yukari ceker ve satici yanlis fiyat belirler.
      isTest: false,
    };
    if (brandId) where.brandId = brandId;

    const listings = await this.prisma.listing.findMany({
      where,
      select: { price: true, status: true },
    });

    if (listings.length === 0) return null;

    const prices = listings.map(l => Number(l.price)).sort((a, b) => a - b);
    const soldPrices = listings.filter(l => l.status === 'SOLD').map(l => Number(l.price)).sort((a, b) => a - b);
    const activePrices = listings.filter(l => l.status === 'ACTIVE').map(l => Number(l.price));

    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    const median = (arr: number[]) => {
      if (!arr.length) return null;
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    };

    return {
      totalCount: listings.length,
      activeCount: activePrices.length,
      soldCount: soldPrices.length,
      all: {
        min: prices[0],
        max: prices[prices.length - 1],
        avg: avg(prices),
        median: median(prices),
      },
      active: activePrices.length ? {
        min: Math.min(...activePrices),
        max: Math.max(...activePrices),
        avg: avg(activePrices),
      } : null,
      sold: soldPrices.length ? {
        min: soldPrices[0],
        max: soldPrices[soldPrices.length - 1],
        avg: avg(soldPrices),
        median: median(soldPrices),
      } : null,
    };
  }
}
