import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const posts = [
  { slug: 'ikinci-el-kask-alirken-dikkat-edilmesi-gerekenler', title: 'İkinci El Kask Alırken Dikkat Edilmesi Gereken 7 Şey', excerpt: 'İkinci el kask satın almak bütçe dostu görünse de yanlış seçim hayatınızı tehlikeye atabilir. İşte güvenli alım için bilmeniz gerekenler.', category: 'Güvenlik', tags: ['kask', 'güvenlik', 'ikinci el'], readTime: 6, coverEmoji: '🪖', publishedAt: new Date('2026-06-01') },
  { slug: 'motosiklet-montu-secimi-rehberi', title: 'Motosiklet Montu Nasıl Seçilir? Mevsime Göre Ekipman Rehberi', excerpt: 'Yazlık, kışlık ve dört mevsim montlar arasındaki farklar, CE koruma seviyeleri ve Türkiye ikliminde doğru seçim için kapsamlı rehber.', category: 'Ekipman', tags: ['mont', 'ekipman', 'rehber'], readTime: 8, coverEmoji: '🧥', publishedAt: new Date('2026-05-28') },
  { slug: 'akrapovic-egzoz-rehberi', title: 'Akrapovic Egzoz Rehberi: Hangi Model, Hangi Motor için?', excerpt: 'Slip-on mu, full system mi? Titanium mu, karbon mu? Akrapovic egzoz seçerken bilmeniz gereken her şey.', category: 'Aksesuar', tags: ['egzoz', 'akrapovic', 'aksesuar'], readTime: 7, coverEmoji: '💨', publishedAt: new Date('2026-05-20') },
  { slug: 'motosiklet-eldiveni-secimi', title: 'Motosiklet Eldiveni Seçimi: Yazlık, Kışlık ve Yarış Eldivenleri', excerpt: 'Hangi eldivenin ne zaman kullanılacağı, knuckle koruması neden şart, ve ikinci el eldiven alımında hijyen sorununu nasıl çözersiniz?', category: 'Ekipman', tags: ['eldiven', 'ekipman'], readTime: 5, coverEmoji: '🧤', publishedAt: new Date('2026-05-15') },
  { slug: 'motosiklet-botu-rehberi', title: 'Motosiklet Botu Rehberi: Spor, Touring ve Günlük Kullanım', excerpt: 'Motosiklet botları neden normal ayakkabıdan farklıdır, bilek koruması neden kritiktir ve doğru botu nasıl seçersiniz?', category: 'Ekipman', tags: ['bot', 'ekipman', 'güvenlik'], readTime: 6, coverEmoji: '👢', publishedAt: new Date('2026-05-10') },
  { slug: 'motosiklet-koruyucu-ekipman-rehberi', title: 'Motosiklet Koruyucu Ekipman Rehberi: Sırt, Diz ve Göğüs Koruması', excerpt: 'CE Level 1 ve Level 2 koruyucular arasındaki fark, hangi bölgelere koruyucu takılmalı ve airbag yelek teknolojisi hakkında bilmeniz gerekenler.', category: 'Güvenlik', tags: ['koruyucu', 'güvenlik', 'CE'], readTime: 7, coverEmoji: '🛡️', publishedAt: new Date('2026-05-05') },
  { slug: 'motosiklet-bakim-ipuclari', title: 'Motosiklet Bakımında Tasarruf: Kendiniz Yapabileceğiniz 8 İşlem', excerpt: 'Yağ değişimi, zincir bakımı, fren kontrolü gibi temel bakım işlemlerini servise götürmeden kendiniz nasıl yaparsınız?', category: 'Bakım', tags: ['bakım', 'tamir', 'tasarruf'], readTime: 9, coverEmoji: '🔧', publishedAt: new Date('2026-04-28') },
  { slug: 'turkiyede-motosiklet-turizmi', title: "Türkiye'de Motosiklet Turizmi: Karadeniz, Ege ve Doğu Anadolu Rotaları", excerpt: "Türkiye'nin en güzel motosiklet rotaları, mevsime göre planlama önerileri ve uzun yol için ekipman hazırlığı.", category: 'Rota & Seyahat', tags: ['rota', 'seyahat', 'turizm'], readTime: 10, coverEmoji: '🗺️', publishedAt: new Date('2026-04-20') },
  { slug: 'agv-kask-modelleri-karsilastirma', title: 'AGV Kask Modelleri Karşılaştırması: K6, Pista GP-RR ve K3 Hangi Sürücü İçin?', excerpt: "AGV'nin popüler kask serilerini fiyat, güvenlik skoru, ağırlık ve kullanım senaryosu açısından karşılaştırıyoruz.", category: 'Ürün İnceleme', tags: ['agv', 'kask', 'inceleme'], readTime: 8, coverEmoji: '⭐', publishedAt: new Date('2026-04-10') },
  { slug: 'motosiklet-sigortasi-ve-ekipman-korumasi', title: 'Motosiklet Sigortası ve Ekipman Koruma: Neye Dikkat Etmeli?', excerpt: "Motosiklet zorunlu sigortası, kasko, ekipman sigortası ve kazada haklarınızı biliyor musunuz? Türkiye'deki yasal çerçeve.", category: 'Hukuk & Sigorta', tags: ['sigorta', 'hukuk', 'kasko'], readTime: 6, coverEmoji: '📋', publishedAt: new Date('2026-04-01') },
  { slug: 'motosiklet-lastigi-secimi-ve-bakimi', title: 'Motosiklet Lastiği Seçimi: Sürüş Tipine Göre Doğru Lastik', excerpt: 'Yanlış lastik seçimi fren mesafesini uzatır, virajlarda tutunmayı azaltır. Şehir, tur ve spor sürücüler için kapsamlı lastik rehberi.', category: 'Bakım & Teknik', tags: ['lastik', 'bakım', 'güvenlik'], readTime: 7, coverEmoji: '⚙️', publishedAt: new Date('2026-06-02') },
  { slug: 'shoei-vs-agv-vs-arai-kask-karsilastirmasi', title: 'Shoei, AGV ve Arai: Üç Dünya Markasının Amansız Karşılaştırması', excerpt: '10.000 TL üzeri kask almadan önce bu yazıyı okuyun. Koruma, ağırlık, ses yalıtımı ve konfor açısından üç dev marka karşı karşıya.', category: 'Ekipman Rehberi', tags: ['shoei', 'agv', 'arai', 'kask'], readTime: 9, coverEmoji: '🏆', publishedAt: new Date('2026-06-03') },
  { slug: 'kis-motosiklet-surmenin-ipuclari', title: 'Kışın Motosiklet Sürmek: 8 Temel Kural', excerpt: 'Sıfır derece, ıslak asfalt, donmuş zemin. Kış aylarında yola çıkmak isteyenler için ekipman, teknik ve zihinsel hazırlık rehberi.', category: 'Sürüş Teknikleri', tags: ['kış', 'sürüş', 'güvenlik'], readTime: 6, coverEmoji: '❄️', publishedAt: new Date('2026-06-04') },
  { slug: 'motosiklet-zinciri-bakimi-ve-yagi', title: 'Motosiklet Zinciri Bakımı: Ne Zaman, Nasıl, Hangi Yağ?', excerpt: 'Bakımsız zincir hem performansı düşürür hem de tehlikeli bir kopma riskine yol açar. Adım adım zincir temizleme, yağlama ve germe rehberi.', category: 'Bakım & Teknik', tags: ['zincir', 'bakım', 'yağ'], readTime: 5, coverEmoji: '⛓️', publishedAt: new Date('2026-06-05') },
  { slug: 'ikinci-el-motosiklet-nasil-alinir', title: 'İkinci El Motosiklet Satın Alma Rehberi: 12 Kontrol Noktası', excerpt: 'Yüz binlerce TL\'lik bir alımda nelere dikkat etmelisiniz? Galeriden mi yoksa bireysel satıcıdan mı? Kapsamlı kontrol listesi.', category: 'Satın Alma Rehberi', tags: ['ikinci el', 'motosiklet', 'satın alma'], readTime: 10, coverEmoji: '🔍', publishedAt: new Date('2026-06-06') },
  { slug: 'motosiklet-depolama-ve-kis-uykusu', title: 'Motosikletinizi Kışa Hazırlamak: Adım Adım Depolama Rehberi', excerpt: 'Yılda 3-4 ay garajda kalan motosiklet bakımsız bırakılırsa ilkbaharda sizi hayal kırıklığıyla karşılar. Doğru kış uykusu prosedürü burada.', category: 'Bakım & Teknik', tags: ['depolama', 'kış', 'bakım'], readTime: 7, coverEmoji: '🏠', publishedAt: new Date('2026-06-07') },
  { slug: 'motosiklet-suruse-baslangiç-rehberi', title: "Motosiklete Başlangıç: A'dan Z'ye Yeni Sürücü Rehberi", excerpt: "Ehliyet kursu biter, motor alırsınız — peki sonra? İlk 6 ayın en kritik 10 öğrenimi, deneyimli sürücülerin önerisiyle.", category: 'Sürüş Teknikleri', tags: ['başlangıç', 'yeni sürücü', 'rehber'], readTime: 8, coverEmoji: '🏍️', publishedAt: new Date('2026-06-08') },
  { slug: 'alpinestars-vs-dainese-koruyucu-giysi', title: 'Alpinestars mı Dainese mi? İki Devletin Kapsamlı Karşılaştırması', excerpt: 'Motor dünyasının iki büyük markası aynı segmentte yarışıyor. Pist güvenliği, günlük kullanım konforu ve fiyat/performans oranında gerçek kazanan kim?', category: 'Ekipman Rehberi', tags: ['alpinestars', 'dainese', 'karşılaştırma'], readTime: 8, coverEmoji: '⚡', publishedAt: new Date('2026-06-09') },
  { slug: 'motosiklet-fotograflari-iyi-cekmek', title: 'İlanınız İçin Çarpıcı Motosiklet Fotoğrafları Çekmek', excerpt: "Motorya'da iyi fotoğraflı ilanlar 3 kat daha fazla teklif alıyor. Profesyonel ekipman gerekmez — sadece bu 7 ipucunu uygulayın.", category: 'Satış İpuçları', tags: ['fotoğraf', 'ilan', 'ipucu'], readTime: 5, coverEmoji: '📸', publishedAt: new Date('2026-06-10') },
  { slug: 'motosiklet-ekipman-bakimi-uzun-omur', title: 'Ekipmanınızı 10 Yıl Kullanın: Doğru Bakım ve Depolama', excerpt: 'Kaliteli bir motor montu 3.000 TL, iyi bir kask 8.000 TL. Bu yatırımı doğru korursanız yıllarca sizi korumaya devam eder.', category: 'Bakım & Teknik', tags: ['bakım', 'depolama', 'ekipman'], readTime: 6, coverEmoji: '🛠️', publishedAt: new Date('2026-06-11') },
];

async function main() {
  console.log('Seeding blog posts...');
  for (const post of posts) {
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: {},
      create: {
        ...post,
        content: `# ${post.title}\n\n${post.excerpt}\n\n*Bu içerik yakında genişletilecek.*`,
        published: true,
        author: 'Motorya Editörü',
      },
    });
  }
  console.log(`✓ ${posts.length} blog yazısı eklendi`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
