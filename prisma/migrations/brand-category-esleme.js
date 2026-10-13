/**
 * Marka - kategori eslemesi (kurator listesi).
 *
 * Bu liste markayi GIZLEMEK icin degil ONCELIKLENDIRMEK icin: ilan verme
 * formunda ve arama filtresinde liste her zaman TAM donuyor, eslesenler
 * ustte "Bu kategoride yaygin" basligi altinda toplaniyor. Yanlis bir
 * esleme fazladan bir kaydirmaya mal olur, satiya markasini kaybettirmez.
 *
 * Esleme herhangi bir seviyede yapilabilir: ana kategoriye yazilan marka tum
 * alt kategorilerinde one cikar. Dainese bir kez 'mont'a, Brembo dogrudan
 * 'parca-fren' yapragina yaziliyor.
 *
 * Listede olmayan marka hicbir kategoride one cikmaz - yalnizca "Tum
 * markalar" altinda kalir. Bu kasitli: tahminle eslemektense eslemememek
 * daha dogru, cunku o kategoride ilan birikince sistem zaten ogreniyor.
 */

/** Giyilen urunlerin govdesini olusturan markalar - cogu kategoride ayni. */
const GIYIM = [
  'Alpinestars', 'Berik', 'Bering', 'Blauer HT', 'Büse', 'Clover', 'Dainese',
  'Furygan', 'Held', 'Hein Gericke', 'Icon', 'Ixon', 'IXS', 'Macna', 'Modeka',
  "Rev'it", 'Richa', 'RST', 'Rukka', 'Scoyco', 'Spidi', 'Shima', '4Riders',
];

/** Kros / off-road tarafi: kask, giyim ve koruma uretiyorlar. */
const KROS = ['Acerbis', 'Fox Racing', 'Just1', 'Thor'];

/** Motosiklet ureticileri. Yedek parca ve aksesuar her modelde var. */
const OEM = [
  'Aprilia', 'Bajaj', 'Benelli', 'BMW Motorrad', 'Brixton', 'CF Moto', 'Ducati',
  'Gilera', 'Harley-Davidson', 'Hero', 'Honda', 'Husqvarna', 'Kanuni', 'Kawasaki',
  'KTM', 'Kuba', 'Kymco', 'Lambretta', 'Mondial', 'Peugeot Motosiklet', 'Piaggio',
  'Regal Raptor', 'RKS', 'Suzuki', 'SYM', 'Triumph', 'TVS', 'Vespa', 'Voge',
  'Yamaha', 'Yuki', 'Zontes', 'Arora',
];

/** Kendi giyim/kask serisi de olan ureticiler. */
const OEM_GIYIM = [
  'BMW Motorrad', 'Honda', 'Yamaha', 'KTM', 'Ducati', 'Harley-Davidson',
  'Triumph', 'Husqvarna', 'Vespa',
];

/** kategori slug -> marka adlari */
const ESLEME = {
  kask: [
    'AGV', 'Airoh', 'Arai', 'Arora', 'Asmax', 'Axxis', 'Bell', 'Caberg', 'DMD',
    'Exocom', 'Fazer Helmets', 'GMS', 'Grex', 'HJC', 'KYT', 'LS2', 'Momo Design',
    'MT Helmets', 'Nexx', 'Nolan', 'Schuberth', 'Scorpion', 'Shark', 'Shoei',
    'Suomy', 'Torc', 'X-Lite', 'Zeus', 'Icon', 'Scoyco', ...KROS, ...OEM_GIYIM,
  ],
  // Vizor ici, iletisim seti ve kask aksesuarlari
  'kask-aksesuarlari': ['Pinlock', 'Cardo', 'Sena', 'Interphone', 'Shoei', 'Nolan', 'Schuberth'],

  mont: [...GIYIM, 'John Doe', 'KLIM', 'Rider Denim', 'Auvray', ...KROS, ...OEM_GIYIM],
  pantolon: [...GIYIM, 'John Doe', 'KLIM', 'Rider Denim', 'Auvray', ...KROS, ...OEM_GIYIM],
  eldiven: [...GIYIM, 'Five Gloves', 'Knox', 'KLIM', ...KROS, ...OEM_GIYIM],
  'bot-cizme': [
    'Alpinestars', 'Berik', 'Dainese', 'Forma', 'Gaerne', 'Icon', 'IXS', 'Modeka',
    "Rev'it", 'Richa', 'RST', 'Sidi', 'TCX', 'Scoyco', 'Shima', ...KROS,
  ],
  koruma: [
    'Alpinestars', 'Dainese', 'Forcefield', 'Knox', 'Sas-Tec', 'IXS', "Rev'it",
    'Held', 'Scoyco', ...KROS,
  ],

  canta: [
    'Givi', 'Kappa', 'Kriega', 'Shad', 'SW-Motech', 'Touratech', 'Lone Rider',
    'Oxford', 'Tucano Urbano', 'Wunderlich', ...OEM_GIYIM,
  ],

  'surucu-aksesuarlari': [
    'Alpinestars', 'Bering', 'Büse', 'Clover', 'Dainese', 'Held', 'Ixon', 'IXS',
    'Knox', 'Kriega', 'Macna', 'Modeka', 'Odlo', 'Oxford', "Rev'it", 'Richa',
    'RST', 'Rukka', 'Scoyco', 'Tucano Urbano', '4Riders',
  ],

  // Aksesuar: yaprak seviyesinde esliyoruz, ana kategori cok genis.
  'aksesuar-elektronik': ['Cardo', 'Sena', 'Interphone', 'SP Connect', 'Chigee', 'Hella'],
  'aksesuar-guvenlik': ['Abus', 'Artago', 'Kovix', 'Master Lock', 'Oxford', 'Securage', 'Nukrotech', 'Prosev'],
  'aksesuar-konfor': ['Puig', 'Givi', 'Kappa', 'SW-Motech', 'Touratech', 'Wunderlich', 'Tucano Urbano', 'Scottoiler'],
  'aksesuar-tuning': ['Puig', 'Wunderlich', 'Touratech', 'Acerbis'],
  aksesuar: [...OEM],

  // Yedek parca: yaprak seviyesinde, cunku marka gruplari cok ayrik.
  'parca-fren': ['Brembo', 'EBC Brakes'],
  'parca-egzoz': [
    'Akrapovic', 'Arrow', 'FMF Racing', 'LeoVince', 'Mivv', 'Remus', 'SC Project',
    'Two Brothers Racing', 'Vance & Hines', 'Yoshimura',
  ],
  'parca-lastik': [
    'Anlas', 'Bridgestone', 'Continental', 'Dunlop', 'Heidenau', 'IRC', 'Metzeler',
    'Michelin', 'Mitas', 'Pirelli', 'Shinko',
  ],
  'parca-aktarma': ['AFAM'],
  'parca-motor': ['BMC Air Filter'],
  'parca-elektrik': ['Hella'],
  'parca-kaporta': ['Acerbis', 'Puig', 'Wunderlich'],
  'yedek-parca': [...OEM],

  bakim: ['Motul', 'Ipone', 'Putoline', 'Scottoiler'],
};

module.exports = { ESLEME };
