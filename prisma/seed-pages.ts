import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const pages = [
  {
    slug: 'hakkimizda',
    title: 'Hakkımızda',
    content: `## Motorya Nedir?

Motorya, Türkiye'nin motosiklet sürücülerine yönelik ilk güvenli ikinci el ekipman pazarıdır. 2024 yılında kurulan platformumuz, binlerce sürücüyü birbiriyle buluşturarak doğru ekipmana ulaşmayı kolaylaştırıyor.

## Misyonumuz

Her motosiklet sürücüsünün kaliteli ekipmana uygun fiyatla ulaşabilmesini sağlamak. İkinci el piyasasındaki güvensizliği ortadan kaldırarak alıcı ve satıcı arasında güvenilir bir köprü olmak.

## Neden Motorya?

- **Güvenli Ödeme:** Escrow sistemiyle ödemeniz ürünü teslim alana kadar güvende
- **Doğrulanmış Satıcılar:** Kimlik doğrulama ve satıcı puanlama sistemi
- **Kargo Takibi:** Sipariş sürecinde anlık bildirimler
- **Kolay İlan:** Dakikalar içinde ilan ver, binlerce alıcıya ulaş

## Ekibimiz

Motorya, motosiklet tutkunu bir ekip tarafından kurulmuştur. Her özelliğimizi bizzat sürücü olarak deneyimlediğimiz ihtiyaçlardan yola çıkarak geliştiriyoruz.

## İletişim

Sorularınız için [iletisim](/sayfa/iletisim) sayfamızı ziyaret edin.`,
    published: true,
  },
  {
    slug: 'iletisim',
    title: 'İletişim',
    content: `## Bize Ulaşın

Motorya ekibiyle iletişime geçmek için aşağıdaki kanalları kullanabilirsiniz.

## Destek

**E-posta:** destek@motorya.com.tr

Hafta içi 09:00 – 18:00 saatleri arasında en geç 24 saat içinde yanıt veriyoruz.

## Ticari İşbirlikleri

Reklam, sponsorluk ve kurumsal iş birlikleri için:

**E-posta:** iletisim@motorya.com.tr

## Teknik Sorunlar

Platform üzerindeki teknik sorunları bildirmek için destek@motorya.com.tr adresine yazabilir ya da ilan detay sayfasındaki "Sorun Bildir" butonunu kullanabilirsiniz.

## Sosyal Medya

Motorya'yı sosyal medyada takip ederek güncel kampanya ve duyurulardan haberdar olun.

- Instagram: @motorya.com.tr
- Twitter/X: @motoryatr`,
    published: true,
  },
  {
    slug: 'gizlilik-politikasi',
    title: 'Gizlilik Politikası',
    content: `## Gizlilik Politikası

Son güncelleme: Ocak 2025

Bu gizlilik politikası, Motorya platformunu kullanırken kişisel verilerinizin nasıl toplandığını, kullanıldığını ve korunduğunu açıklar.

## Toplanan Veriler

**Hesap Bilgileri:** Kayıt sırasında ad, e-posta adresi ve şifreniz (şifrelenmiş olarak) saklanır.

**İlan Bilgileri:** Oluşturduğunuz ilanlardaki içerik, fotoğraflar ve fiyat bilgileri.

**İşlem Bilgileri:** Satın alma ve satış işlemlerine ait veriler.

**Kullanım Verileri:** Platform içi gezinme ve arama geçmişi (hizmet iyileştirme amaçlı).

## Verilerin Kullanımı

Topladığımız veriler şu amaçlarla kullanılır:

- Hesap yönetimi ve kimlik doğrulama
- Sipariş ve ödeme işlemleri
- Müşteri desteği
- Platform güvenliği ve dolandırıcılık önleme
- Hizmet iyileştirme ve kişiselleştirme

## Veri Paylaşımı

Kişisel verileriniz aşağıdaki durumlar dışında üçüncü taraflarla paylaşılmaz:

- Yasal zorunluluk halleri
- Ödeme işlemcileri (yalnızca işleme gerekli minimum veri)
- Kargo firmaları (teslimat için gerekli bilgiler)

## Çerezler

Motorya, oturum yönetimi ve kullanıcı deneyimini iyileştirmek amacıyla çerez kullanır.

## Haklarınız

KVKK kapsamında kişisel verilerinize erişim, düzeltme ve silme hakkına sahipsiniz. Talepleriniz için destek@motorya.com.tr adresine yazabilirsiniz.

## İletişim

Gizlilik politikamızla ilgili sorularınız için: destek@motorya.com.tr`,
    published: true,
  },
  {
    slug: 'kullanim-kosullari',
    title: 'Kullanım Koşulları',
    content: `## Kullanım Koşulları

Son güncelleme: Ocak 2025

Motorya platformunu kullanarak aşağıdaki koşulları kabul etmiş sayılırsınız.

## Platform Kullanımı

Motorya yalnızca motosiklet ekipmanı alım satımına yönelik bir platformdur. Kullanıcılar:

- Gerçek ve doğru bilgi içeren ilanlar yayınlamakla yükümlüdür
- Başkalarının haklarını ihlal eden içerik paylaşamaz
- Platform güvenliğini tehdit edecek davranışlarda bulunamaz
- Birden fazla hesap açamaz

## Yasaklı İçerikler

Aşağıdaki içerikler kesinlikle yasaktır:

- Çalıntı veya sahte ürün ilanları
- Yanıltıcı fotoğraf veya açıklama
- Hakaret, ayrımcılık veya tehdit içeren mesajlar
- Spam ve ticari amaçlı toplu mesaj

## Satıcı Sorumlulukları

Satıcılar ilan ettiği ürünü; doğru tanımlanmış, kargo için hazır ve fotoğraflarda gösterildiği şekilde teslim etmekle yükümlüdür.

## Ödeme ve Escrow

Motorya, alıcı ve satıcı arasında güvenli ödeme köprüsü görevi görür. Ödeme, alıcı ürünü teslim alıp onaylayana kadar satıcıya aktarılmaz.

## Ücretler

Platform üzerinden gerçekleştirilen satışlardan komisyon alınabilir. Güncel komisyon oranları ayarlar sayfasında belirtilir.

## Hesap Askıya Alma

Koşulların ihlali durumunda Motorya, önceden bildirim yapmaksızın hesabı askıya alma veya kalıcı olarak kapatma hakkını saklı tutar.

## Değişiklikler

Kullanım koşulları değiştiğinde kayıtlı e-posta adresinize bildirim gönderilir.

## İletişim

Sorularınız için: destek@motorya.com.tr`,
    published: true,
  },
  {
    slug: 'cerez-politikasi',
    title: 'Çerez Politikası',
    content: `## Çerez Politikası

Son güncelleme: Ocak 2025

Bu politika, Motorya'nın çerezleri nasıl kullandığını açıklar.

## Çerez Nedir?

Çerezler, web siteleri tarafından tarayıcınıza yerleştirilen küçük metin dosyalarıdır.

## Kullandığımız Çerezler

**Zorunlu Çerezler:** Oturum yönetimi ve güvenlik için gereklidir. Bunlar olmadan platform çalışmaz.

**Analitik Çerezler:** Hangi sayfaların ziyaret edildiğini ve kullanım kalıplarını anlamak için kullanılır (Google Analytics).

**Tercih Çerezleri:** Dil, konum ve görünüm tercihlerinizi hatırlamak için kullanılır.

## Çerezleri Kontrol Etme

Tarayıcı ayarlarınızdan çerezleri devre dışı bırakabilirsiniz. Ancak zorunlu çerezleri kapatmak platform işlevselliğini etkileyebilir.

## İletişim

Çerez politikamızla ilgili sorularınız için: destek@motorya.com.tr`,
    published: true,
  },
];

async function main() {
  console.log('Seeding static pages...');
  for (const p of pages) {
    await prisma.staticPage.upsert({
      where: { slug: p.slug },
      update: { title: p.title, content: p.content, published: p.published },
      create: p,
    });
    console.log(`✓ ${p.title}`);
  }
  console.log('Done.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
