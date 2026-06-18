import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
  {
    "name": "Kask",
    "slug": "kask",
    "subcategories": [
      {
        "name": "Kapalı Kask",
        "slug": "kapali-kask"
      },
      {
        "name": "Açık Kask",
        "slug": "acik-kask"
      },
      {
        "name": "Çene Açılır Kask (Modüler)",
        "slug": "cene-acilir-kask"
      },
      {
        "name": "Cross / Enduro Kask",
        "slug": "cross-enduro-kask"
      },
      {
        "name": "Motosiklet Kaskı (Tur/Adventure)",
        "slug": "tur-adventure-kask"
      },
      {
        "name": "Kadın Kask",
        "slug": "kadin-kask"
      },
      {
        "name": "Çocuk Kaskı",
        "slug": "cocuk-kask"
      },
      {
        "name": "Kask Aksesuarları",
        "slug": "kask-aksesuarlari"
      },
      {
        "name": "Vizör",
        "slug": "vizor"
      },
      {
        "name": "Pinlock / Buğu Önleyici",
        "slug": "pinlock-bugu-onleyici"
      },
      {
        "name": "Kask Yedek Parçaları",
        "slug": "kask-yedek-parcalari"
      }
    ]
  },
  {
    "name": "Mont",
    "slug": "mont",
    "subcategories": [
      {
        "name": "Yazlık Mont",
        "slug": "yazlik-mont"
      },
      {
        "name": "Kışlık Mont",
        "slug": "kislik-mont"
      },
      {
        "name": "3 Mevsim Mont",
        "slug": "uc-mevsim-mont"
      },
      {
        "name": "Gore-Tex Mont",
        "slug": "gore-tex-mont"
      },
      {
        "name": "Deri Mont",
        "slug": "deri-mont"
      },
      {
        "name": "Kadın Mont",
        "slug": "kadin-mont"
      },
      {
        "name": "Çocuk Mont",
        "slug": "cocuk-mont"
      },
      {
        "name": "Tulum (One-Piece Suit)",
        "slug": "tulum"
      },
      {
        "name": "Softshell / Termal Mont",
        "slug": "softshell-termal-mont"
      }
    ]
  },
  {
    "name": "Pantolon",
    "slug": "pantolon",
    "subcategories": [
      {
        "name": "Yazlık Pantolon",
        "slug": "yazlik-pantolon"
      },
      {
        "name": "Kışlık Pantolon",
        "slug": "kislik-pantolon"
      },
      {
        "name": "3 Mevsim Pantolon",
        "slug": "uc-mevsim-pantolon"
      },
      {
        "name": "Gore-Tex Pantolon",
        "slug": "gore-tex-pantolon"
      },
      {
        "name": "Deri Pantolon",
        "slug": "deri-pantolon"
      },
      {
        "name": "Kot / Kevlar Pantolon",
        "slug": "kot-kevlar-pantolon"
      },
      {
        "name": "Kadın Pantolon",
        "slug": "kadin-pantolon"
      },
      {
        "name": "Çocuk Pantolon",
        "slug": "cocuk-pantolon"
      }
    ]
  },
  {
    "name": "Eldiven",
    "slug": "eldiven",
    "subcategories": [
      {
        "name": "Yazlık Eldiven",
        "slug": "yazlik-eldiven"
      },
      {
        "name": "Kışlık Eldiven",
        "slug": "kislik-eldiven"
      },
      {
        "name": "3 Mevsim Eldiven",
        "slug": "uc-mevsim-eldiven"
      },
      {
        "name": "Gore-Tex Eldiven",
        "slug": "gore-tex-eldiven"
      },
      {
        "name": "Deri Eldiven",
        "slug": "deri-eldiven"
      },
      {
        "name": "Kadın Eldiven",
        "slug": "kadin-eldiven"
      },
      {
        "name": "Çocuk Eldiven",
        "slug": "cocuk-eldiven"
      }
    ]
  },
  {
    "name": "Bot / Çizme",
    "slug": "bot-cizme",
    "subcategories": [
      {
        "name": "Yazlık Bot",
        "slug": "yazlik-bot"
      },
      {
        "name": "Kışlık Bot",
        "slug": "kislik-bot"
      },
      {
        "name": "3 Mevsim Bot",
        "slug": "uc-mevsim-bot"
      },
      {
        "name": "Gore-Tex Bot",
        "slug": "gore-tex-bot"
      },
      {
        "name": "Deri Bot",
        "slug": "deri-bot"
      },
      {
        "name": "Motosiklet Ayakkabısı",
        "slug": "motosiklet-ayakkabisi"
      },
      {
        "name": "Kadın Bot",
        "slug": "kadin-bot"
      },
      {
        "name": "Çocuk Bot",
        "slug": "cocuk-bot"
      },
      {
        "name": "Bot Aksesuarları",
        "slug": "bot-aksesuarlari"
      }
    ]
  },
  {
    "name": "Koruma Ekipmanları",
    "slug": "koruma-ekipmanlari",
    "subcategories": [
      {
        "name": "Tam Vücut Koruma",
        "slug": "tam-vucut-koruma"
      },
      {
        "name": "Sırt Koruyucu",
        "slug": "sirt-koruyucu"
      },
      {
        "name": "Göğüs Koruyucu",
        "slug": "gogus-koruyucu"
      },
      {
        "name": "Omuz / Dirsek Koruyucu",
        "slug": "omuz-dirsek-koruyucu"
      },
      {
        "name": "Diz / Bacak Koruyucu",
        "slug": "diz-bacak-koruyucu"
      },
      {
        "name": "Bel / Kalça Koruyucu",
        "slug": "bel-kalca-koruyucu"
      },
      {
        "name": "Boyun Koruyucu",
        "slug": "boyun-koruyucu"
      },
      {
        "name": "Hava Yastığı Sistemi (Airbag)",
        "slug": "airbag-sistemi"
      },
      {
        "name": "Çocuk Koruma",
        "slug": "cocuk-koruma"
      }
    ]
  },
  {
    "name": "MX / Off-Road",
    "slug": "mx-off-road",
    "subcategories": [
      {
        "name": "Motocross Ekipmanı",
        "slug": "motocross-ekipman"
      },
      {
        "name": "Enduro Ekipmanı",
        "slug": "enduro-ekipman"
      },
      {
        "name": "Adventure Ekipmanı",
        "slug": "adventure-ekipman"
      },
      {
        "name": "MX Gözlük",
        "slug": "mx-gozluk"
      },
      {
        "name": "MX Jersey",
        "slug": "mx-jersey"
      },
      {
        "name": "MX Çocuk Ekipmanı",
        "slug": "mx-cocuk-ekipman"
      },
      {
        "name": "MX Koruma",
        "slug": "mx-koruma"
      }
    ]
  },
  {
    "name": "Interkom / İletişim",
    "slug": "interkom-iletisim",
    "subcategories": [
      {
        "name": "Bluetooth İnterkom",
        "slug": "bluetooth-interkom"
      },
      {
        "name": "İnterkom Aksesuarları",
        "slug": "interkom-aksesuarlari"
      },
      {
        "name": "Aksiyon Kamera / Dashcam",
        "slug": "aksiyon-kamera"
      },
      {
        "name": "GPS / Navigasyon",
        "slug": "gps-navigasyon"
      }
    ]
  },
  {
    "name": "Casual Giyim",
    "slug": "casual-giyim",
    "subcategories": [
      {
        "name": "Sweatshirt / Kapüşonlu",
        "slug": "sweatshirt-kapusonlu"
      },
      {
        "name": "T-Shirt",
        "slug": "t-shirt"
      },
      {
        "name": "Şort / Bermuda",
        "slug": "sort-bermuda"
      },
      {
        "name": "Şapka / Bere",
        "slug": "sapka-bere"
      },
      {
        "name": "Çorap",
        "slug": "corap"
      },
      {
        "name": "Kemer",
        "slug": "kemer"
      },
      {
        "name": "Günlük Ayakkabı",
        "slug": "gunluk-ayakkabi"
      },
      {
        "name": "Günlük Ceket",
        "slug": "gunluk-ceket"
      }
    ]
  },
  {
    "name": "Sürücü Aksesuarları",
    "slug": "surucu-aksesuarlari",
    "subcategories": [
      {
        "name": "Yağmurluk Üst",
        "slug": "yagmurluk-ust"
      },
      {
        "name": "Yağmurluk Alt",
        "slug": "yagmurluk-alt"
      },
      {
        "name": "Yağmurluk Tulum",
        "slug": "yagmurluk-tulum"
      },
      {
        "name": "Termal İç Giyim",
        "slug": "termal-ic-giyim"
      },
      {
        "name": "Boyunluk / Buff",
        "slug": "boyunluk-buff"
      },
      {
        "name": "Balaklava / Maske",
        "slug": "balaklava-maske"
      },
      {
        "name": "Sürücü Yeleği",
        "slug": "surucu-yelegi"
      },
      {
        "name": "Reflektif Ürün",
        "slug": "reflektif-urun"
      },
      {
        "name": "Kulak Tıkacı",
        "slug": "kulak-tikaci"
      },
      {
        "name": "Sürücü Çantası",
        "slug": "surucu-cantasi"
      },
      {
        "name": "Sırt Çantası",
        "slug": "sirt-cantasi"
      }
    ]
  },
  {
    "name": "Motosiklet Çantaları",
    "slug": "motosiklet-cantalar",
    "subcategories": [
      {
        "name": "Arka Çanta (Top Case)",
        "slug": "arka-canta-top-case"
      },
      {
        "name": "Yan Çanta (Side Case)",
        "slug": "yan-canta-side-case"
      },
      {
        "name": "Depo Çantası (Tank Bag)",
        "slug": "depo-cantasi-tank-bag"
      },
      {
        "name": "Gidon Çantası",
        "slug": "gidon-cantasi"
      },
      {
        "name": "Sele Arkası Çanta",
        "slug": "sele-arkasi-canta"
      },
      {
        "name": "Seyahat Çantası",
        "slug": "seyahat-cantasi"
      },
      {
        "name": "Çanta Taşıyıcı / Rack",
        "slug": "canta-tasiyici-rack"
      },
      {
        "name": "Çanta Aksesuarları",
        "slug": "canta-aksesuarlari"
      }
    ]
  },
  {
    "name": "Motosiklet Aksesuarları",
    "slug": "motosiklet-aksesuarlari",
    "subcategories": [
      {
        "name": "Telefon Tutucu",
        "slug": "telefon-tutucu"
      },
      {
        "name": "Kilit ve Alarm",
        "slug": "kilit-alarm"
      },
      {
        "name": "Motosiklet Brandası",
        "slug": "motosiklet-brandasi"
      },
      {
        "name": "Rüzgar Siperliği",
        "slug": "ruzgar-siperligi"
      },
      {
        "name": "Koruma Demiri (Crash Bar)",
        "slug": "koruma-demiri"
      },
      {
        "name": "Karter Koruma",
        "slug": "karter-koruma"
      },
      {
        "name": "El Koruma / Handguard",
        "slug": "el-koruma-handguard"
      },
      {
        "name": "Radyatör Koruma",
        "slug": "radyator-koruma"
      },
      {
        "name": "Tank Pad / Sticker",
        "slug": "tank-pad-sticker"
      },
      {
        "name": "Sele Minderi",
        "slug": "sele-minderi"
      },
      {
        "name": "Ayakçık / Footpeg",
        "slug": "ayakcik-footpeg"
      },
      {
        "name": "Ayna ve Aksesuarları",
        "slug": "ayna-aksesuarlari"
      },
      {
        "name": "Yan Ayak Genişletici",
        "slug": "yan-ayak-genisletici"
      },
      {
        "name": "Bagaj Kayışı / Straps",
        "slug": "bagaj-kayisi"
      },
      {
        "name": "Far Koruma / Sis Lambası",
        "slug": "far-koruma-sis-lambasi"
      },
      {
        "name": "Sürücü Arkalığı",
        "slug": "surucu-arkaligi"
      }
    ]
  },
  {
    "name": "Yedek Parça",
    "slug": "yedek-parca",
    "subcategories": [
      {
        "name": "Motor Grubu / Silindir",
        "slug": "motor-grubu-silindir"
      },
      {
        "name": "Fren Sistemi",
        "slug": "fren-sistemi"
      },
      {
        "name": "Zincir ve Dişli",
        "slug": "zincir-disli"
      },
      {
        "name": "Süspansiyon / Amortisör",
        "slug": "suspansiyon-amortisor"
      },
      {
        "name": "Egzoz Sistemi",
        "slug": "egzoz-sistemi"
      },
      {
        "name": "Yakıt Sistemi / Karbüratör",
        "slug": "yakit-sistemi-karburator"
      },
      {
        "name": "Hava / Yağ Filtresi",
        "slug": "hava-yag-filtresi"
      },
      {
        "name": "Elektrik / Elektronik",
        "slug": "elektrik-elektronik"
      },
      {
        "name": "Akü / Batarya",
        "slug": "aku-batarya"
      },
      {
        "name": "Aydınlatma / Far / Stop",
        "slug": "aydinlatma-far-stop"
      },
      {
        "name": "Sinyal Lambaları",
        "slug": "sinyal-lambalari"
      },
      {
        "name": "Jant",
        "slug": "jant"
      },
      {
        "name": "Lastik",
        "slug": "lastik"
      },
      {
        "name": "Grenaj / Kaporta",
        "slug": "grenaj-kaporta"
      },
      {
        "name": "Çamurluk",
        "slug": "camurluk"
      },
      {
        "name": "Gidon / Direksiyon",
        "slug": "gidon-direksiyon"
      },
      {
        "name": "Elcik / Gaz Teli",
        "slug": "elcik-gaz-teli"
      },
      {
        "name": "Varyatör / Debriyaj",
        "slug": "varyator-debriyaj"
      },
      {
        "name": "Şanzıman",
        "slug": "sanziman"
      },
      {
        "name": "Radyatör / Soğutma",
        "slug": "radyator-sogutma"
      },
      {
        "name": "Conta / Keçe",
        "slug": "conta-kece"
      },
      {
        "name": "Marş Motoru / Selonoid",
        "slug": "mars-motoru-selonoid"
      },
      {
        "name": "Sele",
        "slug": "sele"
      },
      {
        "name": "Sehpa / Ayak",
        "slug": "sehpa-ayak"
      },
      {
        "name": "Krank / Eksantrik",
        "slug": "krank-eksantrik"
      },
      {
        "name": "Kilometre / Hız Saati",
        "slug": "kilometre-hiz-saati"
      },
      {
        "name": "Su Pompası / Yağ Pompası",
        "slug": "su-yag-pompasi"
      },
      {
        "name": "Diğer Yedek Parça",
        "slug": "diger-yedek-parca"
      }
    ]
  },
  {
    "name": "Bakım Ürünleri",
    "slug": "bakim-urunleri",
    "subcategories": [
      {
        "name": "Motosiklet Yağı",
        "slug": "motosiklet-yagi"
      },
      {
        "name": "Zincir Bakım / Yağlama",
        "slug": "zincir-bakim-yaglama"
      },
      {
        "name": "Temizlik Ürünleri",
        "slug": "temizlik-urunleri"
      },
      {
        "name": "Oto Parlatıcı / Cila",
        "slug": "parlatici-cila"
      },
      {
        "name": "Akü Şarj Cihazı",
        "slug": "aku-sarj-cihazi"
      },
      {
        "name": "Soğutma Suyu / Antifriz",
        "slug": "sogutma-suyu-antifriz"
      },
      {
        "name": "Alet / Takım Çantası",
        "slug": "alet-takim-cantasi"
      },
      {
        "name": "Otomatik Zincir Yağlayıcı",
        "slug": "otomatik-zincir-yaglayici"
      }
    ]
  },
  {
    "name": "Motosiklet",
    "slug": "motosiklet",
    "subcategories": [
      {
        "name": "Scooter / Skutik",
        "slug": "scooter-skutik"
      },
      {
        "name": "Naked / Roadster",
        "slug": "naked-roadster"
      },
      {
        "name": "Sport / Supersport",
        "slug": "sport-supersport"
      },
      {
        "name": "Adventure / Enduro",
        "slug": "adventure-enduro"
      },
      {
        "name": "Touring / Sport-Touring",
        "slug": "touring-sport-touring"
      },
      {
        "name": "Cruiser / Chopper",
        "slug": "cruiser-chopper"
      },
      {
        "name": "Cafe Racer / Retro",
        "slug": "cafe-racer-retro"
      },
      {
        "name": "Cross / Motocross",
        "slug": "cross-motocross"
      },
      {
        "name": "Elektrikli Motosiklet",
        "slug": "elektrikli-motosiklet"
      },
      {
        "name": "125cc ve Altı",
        "slug": "125cc-ve-alti"
      },
      {
        "name": "Maxi Scooter",
        "slug": "maxi-scooter"
      }
    ]
  },
  {
    "name": "ATV / Quad",
    "slug": "atv-quad",
    "subcategories": [
      {
        "name": "ATV Yedek Parça",
        "slug": "atv-yedek-parca"
      },
      {
        "name": "ATV Aksesuar",
        "slug": "atv-aksesuar"
      },
      {
        "name": "ATV Giyim",
        "slug": "atv-giyim"
      }
    ]
  }
];

const BRANDS = [
  {
    "name": "Shoei",
    "slug": "shoei",
    "category": "helmet"
  },
  {
    "name": "Arai",
    "slug": "arai",
    "category": "helmet"
  },
  {
    "name": "AGV",
    "slug": "agv",
    "category": "helmet"
  },
  {
    "name": "HJC",
    "slug": "hjc",
    "category": "helmet"
  },
  {
    "name": "Nolan",
    "slug": "nolan",
    "category": "helmet"
  },
  {
    "name": "Schuberth",
    "slug": "schuberth",
    "category": "helmet"
  },
  {
    "name": "Shark",
    "slug": "shark",
    "category": "helmet"
  },
  {
    "name": "LS2",
    "slug": "ls2",
    "category": "helmet"
  },
  {
    "name": "Caberg",
    "slug": "caberg",
    "category": "helmet"
  },
  {
    "name": "Scorpion",
    "slug": "scorpion",
    "category": "helmet"
  },
  {
    "name": "Bell",
    "slug": "bell",
    "category": "helmet"
  },
  {
    "name": "Airoh",
    "slug": "airoh",
    "category": "helmet"
  },
  {
    "name": "Suomy",
    "slug": "suomy",
    "category": "helmet"
  },
  {
    "name": "KYT",
    "slug": "kyt",
    "category": "helmet"
  },
  {
    "name": "X-Lite",
    "slug": "x-lite",
    "category": "helmet"
  },
  {
    "name": "Nexx",
    "slug": "nexx",
    "category": "helmet"
  },
  {
    "name": "Grex",
    "slug": "grex",
    "category": "helmet"
  },
  {
    "name": "Zeus",
    "slug": "zeus",
    "category": "helmet"
  },
  {
    "name": "Axxis",
    "slug": "axxis",
    "category": "helmet"
  },
  {
    "name": "Just1",
    "slug": "just1",
    "category": "helmet"
  },
  {
    "name": "Torc",
    "slug": "torc",
    "category": "helmet"
  },
  {
    "name": "Icon",
    "slug": "icon",
    "category": "helmet"
  },
  {
    "name": "Blauer HT",
    "slug": "blauer-ht",
    "category": "helmet"
  },
  {
    "name": "Momo Design",
    "slug": "momo-design",
    "category": "helmet"
  },
  {
    "name": "Auvray",
    "slug": "auvray",
    "category": "helmet"
  },
  {
    "name": "Fazer Helmets",
    "slug": "fazer-helmets",
    "category": "helmet"
  },
  {
    "name": "Alpinestars",
    "slug": "alpinestars",
    "category": "clothing"
  },
  {
    "name": "Dainese",
    "slug": "dainese",
    "category": "clothing"
  },
  {
    "name": "Rev'it",
    "slug": "revit",
    "category": "clothing"
  },
  {
    "name": "Spidi",
    "slug": "spidi",
    "category": "clothing"
  },
  {
    "name": "Held",
    "slug": "held",
    "category": "clothing"
  },
  {
    "name": "Rukka",
    "slug": "rukka",
    "category": "clothing"
  },
  {
    "name": "Klim",
    "slug": "klim",
    "category": "clothing"
  },
  {
    "name": "Richa",
    "slug": "richa",
    "category": "clothing"
  },
  {
    "name": "Modeka",
    "slug": "modeka",
    "category": "clothing"
  },
  {
    "name": "Bering",
    "slug": "bering",
    "category": "clothing"
  },
  {
    "name": "Macna",
    "slug": "macna",
    "category": "clothing"
  },
  {
    "name": "iXS",
    "slug": "ixs",
    "category": "clothing"
  },
  {
    "name": "Forma",
    "slug": "forma",
    "category": "clothing"
  },
  {
    "name": "TCX",
    "slug": "tcx",
    "category": "clothing"
  },
  {
    "name": "Gaerne",
    "slug": "gaerne",
    "category": "clothing"
  },
  {
    "name": "Five Gloves",
    "slug": "five-gloves",
    "category": "clothing"
  },
  {
    "name": "Shima",
    "slug": "shima",
    "category": "clothing"
  },
  {
    "name": "Berik",
    "slug": "berik",
    "category": "clothing"
  },
  {
    "name": "Knox",
    "slug": "knox",
    "category": "clothing"
  },
  {
    "name": "Clover",
    "slug": "clover",
    "category": "clothing"
  },
  {
    "name": "Tucano Urbano",
    "slug": "tucano-urbano",
    "category": "clothing"
  },
  {
    "name": "Scoyco",
    "slug": "scoyco",
    "category": "clothing"
  },
  {
    "name": "John Doe",
    "slug": "john-doe",
    "category": "clothing"
  },
  {
    "name": "Rider Denim",
    "slug": "rider-denim",
    "category": "clothing"
  },
  {
    "name": "GMS",
    "slug": "gms",
    "category": "clothing"
  },
  {
    "name": "Lone Rider",
    "slug": "lone-rider",
    "category": "clothing"
  },
  {
    "name": "Prosev",
    "slug": "prosev",
    "category": "clothing"
  },
  {
    "name": "Odlo",
    "slug": "odlo",
    "category": "clothing"
  },
  {
    "name": "Forcefield",
    "slug": "forcefield",
    "category": "clothing"
  },
  {
    "name": "Sas-Tec",
    "slug": "sas-tec",
    "category": "clothing"
  },
  {
    "name": "4Riders",
    "slug": "4riders",
    "category": "clothing"
  },
  {
    "name": "Securage",
    "slug": "securage",
    "category": "clothing"
  },
  {
    "name": "Sena",
    "slug": "sena",
    "category": "parts"
  },
  {
    "name": "Cardo",
    "slug": "cardo",
    "category": "parts"
  },
  {
    "name": "Exocom",
    "slug": "exocom",
    "category": "parts"
  },
  {
    "name": "Asmax",
    "slug": "asmax",
    "category": "parts"
  },
  {
    "name": "Givi",
    "slug": "givi",
    "category": "parts"
  },
  {
    "name": "Kappa",
    "slug": "kappa",
    "category": "parts"
  },
  {
    "name": "Shad",
    "slug": "shad",
    "category": "parts"
  },
  {
    "name": "Kriega",
    "slug": "kriega",
    "category": "parts"
  },
  {
    "name": "Oxford",
    "slug": "oxford",
    "category": "parts"
  },
  {
    "name": "SP Connect",
    "slug": "sp-connect",
    "category": "parts"
  },
  {
    "name": "Puig",
    "slug": "puig",
    "category": "parts"
  },
  {
    "name": "Touratech",
    "slug": "touratech",
    "category": "parts"
  },
  {
    "name": "Wunderlich",
    "slug": "wunderlich",
    "category": "parts"
  },
  {
    "name": "Akrapovic",
    "slug": "akrapovic",
    "category": "parts"
  },
  {
    "name": "Arrow",
    "slug": "arrow",
    "category": "parts"
  },
  {
    "name": "LeoVince",
    "slug": "leovince",
    "category": "parts"
  },
  {
    "name": "Mivv",
    "slug": "mivv",
    "category": "parts"
  },
  {
    "name": "Yoshimura",
    "slug": "yoshimura",
    "category": "parts"
  },
  {
    "name": "Remus",
    "slug": "remus",
    "category": "parts"
  },
  {
    "name": "FMF Racing",
    "slug": "fmf-racing",
    "category": "parts"
  },
  {
    "name": "Two Brothers Racing",
    "slug": "two-brothers-racing",
    "category": "parts"
  },
  {
    "name": "Vance & Hines",
    "slug": "vance-hines",
    "category": "parts"
  },
  {
    "name": "SC Project",
    "slug": "sc-project",
    "category": "parts"
  },
  {
    "name": "Brembo",
    "slug": "brembo",
    "category": "parts"
  },
  {
    "name": "EBC Brakes",
    "slug": "ebc-brakes",
    "category": "parts"
  },
  {
    "name": "AFAM",
    "slug": "afam",
    "category": "parts"
  },
  {
    "name": "Pirelli",
    "slug": "pirelli",
    "category": "parts"
  },
  {
    "name": "Michelin",
    "slug": "michelin",
    "category": "parts"
  },
  {
    "name": "Bridgestone",
    "slug": "bridgestone",
    "category": "parts"
  },
  {
    "name": "Metzeler",
    "slug": "metzeler",
    "category": "parts"
  },
  {
    "name": "Dunlop",
    "slug": "dunlop",
    "category": "parts"
  },
  {
    "name": "Continental",
    "slug": "continental",
    "category": "parts"
  },
  {
    "name": "Shinko",
    "slug": "shinko",
    "category": "parts"
  },
  {
    "name": "Anlas",
    "slug": "anlas",
    "category": "parts"
  },
  {
    "name": "Heidenau",
    "slug": "heidenau",
    "category": "parts"
  },
  {
    "name": "Mitas",
    "slug": "mitas",
    "category": "parts"
  },
  {
    "name": "IRC",
    "slug": "irc",
    "category": "parts"
  },
  {
    "name": "BMC Air Filter",
    "slug": "bmc-air-filter",
    "category": "parts"
  },
  {
    "name": "Motul",
    "slug": "motul",
    "category": "parts"
  },
  {
    "name": "Ipone",
    "slug": "ipone",
    "category": "parts"
  },
  {
    "name": "Putoline",
    "slug": "putoline",
    "category": "parts"
  },
  {
    "name": "Scottoiler",
    "slug": "scottoiler",
    "category": "parts"
  },
  {
    "name": "Abus",
    "slug": "abus",
    "category": "parts"
  },
  {
    "name": "Kovix",
    "slug": "kovix",
    "category": "parts"
  },
  {
    "name": "Artago",
    "slug": "artago",
    "category": "parts"
  },
  {
    "name": "Master Lock",
    "slug": "master-lock",
    "category": "parts"
  },
  {
    "name": "Chigee",
    "slug": "chigee",
    "category": "parts"
  },
  {
    "name": "Nukrotech",
    "slug": "nukrotech",
    "category": "parts"
  },
  {
    "name": "Pinlock",
    "slug": "pinlock",
    "category": "parts"
  },
  {
    "name": "Hella",
    "slug": "hella",
    "category": "parts"
  },
  {
    "name": "Honda",
    "slug": "honda",
    "category": "motorcycle"
  },
  {
    "name": "Yamaha",
    "slug": "yamaha",
    "category": "motorcycle"
  },
  {
    "name": "Kawasaki",
    "slug": "kawasaki",
    "category": "motorcycle"
  },
  {
    "name": "Suzuki",
    "slug": "suzuki",
    "category": "motorcycle"
  },
  {
    "name": "KTM",
    "slug": "ktm",
    "category": "motorcycle"
  },
  {
    "name": "BMW Motorrad",
    "slug": "bmw-motorrad",
    "category": "motorcycle"
  },
  {
    "name": "Ducati",
    "slug": "ducati",
    "category": "motorcycle"
  },
  {
    "name": "Aprilia",
    "slug": "aprilia",
    "category": "motorcycle"
  },
  {
    "name": "Triumph",
    "slug": "triumph",
    "category": "motorcycle"
  },
  {
    "name": "Harley-Davidson",
    "slug": "harley-davidson",
    "category": "motorcycle"
  },
  {
    "name": "Husqvarna",
    "slug": "husqvarna",
    "category": "motorcycle"
  },
  {
    "name": "Kuba",
    "slug": "kuba",
    "category": "motorcycle"
  },
  {
    "name": "Mondial",
    "slug": "mondial",
    "category": "motorcycle"
  },
  {
    "name": "RKS",
    "slug": "rks",
    "category": "motorcycle"
  },
  {
    "name": "CF Moto",
    "slug": "cf-moto",
    "category": "motorcycle"
  },
  {
    "name": "Voge",
    "slug": "voge",
    "category": "motorcycle"
  },
  {
    "name": "Bajaj",
    "slug": "bajaj",
    "category": "motorcycle"
  },
  {
    "name": "TVS",
    "slug": "tvs",
    "category": "motorcycle"
  },
  {
    "name": "Kymco",
    "slug": "kymco",
    "category": "motorcycle"
  },
  {
    "name": "SYM",
    "slug": "sym",
    "category": "motorcycle"
  },
  {
    "name": "Hero",
    "slug": "hero",
    "category": "motorcycle"
  },
  {
    "name": "Arora",
    "slug": "arora",
    "category": "motorcycle"
  },
  {
    "name": "Peugeot Motosiklet",
    "slug": "peugeot-motosiklet",
    "category": "motorcycle"
  },
  {
    "name": "Piaggio",
    "slug": "piaggio",
    "category": "motorcycle"
  },
  {
    "name": "Vespa",
    "slug": "vespa",
    "category": "motorcycle"
  },
  {
    "name": "Benelli",
    "slug": "benelli",
    "category": "motorcycle"
  },
  {
    "name": "Zontes",
    "slug": "zontes",
    "category": "motorcycle"
  },
  {
    "name": "Regal Raptor",
    "slug": "regal-raptor",
    "category": "motorcycle"
  },
  {
    "name": "Brixton",
    "slug": "brixton",
    "category": "motorcycle"
  },
  {
    "name": "Lambretta",
    "slug": "lambretta",
    "category": "motorcycle"
  },
  {
    "name": "Yuki",
    "slug": "yuki",
    "category": "motorcycle"
  },
  {
    "name": "Kanuni",
    "slug": "kanuni",
    "category": "motorcycle"
  },
  {
    "name": "Gilera",
    "slug": "gilera",
    "category": "motorcycle"
  }
];

async function main() {
  console.log('Seeding categories...');
  let catCount = 0; let subCount = 0;
  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const parent = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: i },
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