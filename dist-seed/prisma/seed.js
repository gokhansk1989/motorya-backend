"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding database...');
    // Şifreler hash'leme
    const hashedPassword = await bcrypt.hash('password123', 10);
    // ============ KATEGORİLER ============
    const categories = await Promise.all([
        prisma.category.upsert({ where: { slug: 'kask' }, update: {}, create: { name: 'Kask', slug: 'kask', iconKey: 'helmet', sortOrder: 1 } }),
        prisma.category.upsert({ where: { slug: 'mont' }, update: {}, create: { name: 'Mont', slug: 'mont', iconKey: 'jacket', sortOrder: 2 } }),
        prisma.category.upsert({ where: { slug: 'eldiven' }, update: {}, create: { name: 'Eldiven', slug: 'eldiven', iconKey: 'gloves', sortOrder: 3 } }),
        prisma.category.upsert({ where: { slug: 'bot' }, update: {}, create: { name: 'Bot', slug: 'bot', iconKey: 'boot', sortOrder: 4 } }),
        prisma.category.upsert({ where: { slug: 'koruyucu' }, update: {}, create: { name: 'Koruyucu', slug: 'koruyucu', iconKey: 'shield', sortOrder: 5 } }),
        prisma.category.upsert({ where: { slug: 'aksesuar' }, update: {}, create: { name: 'Aksesuar', slug: 'aksesuar', iconKey: 'gear', sortOrder: 6 } }),
        prisma.category.upsert({ where: { slug: 'yagmurluk' }, update: {}, create: { name: 'Yağmurluk', slug: 'yagmurluk', iconKey: 'rain', sortOrder: 7 } }),
    ]);
    // ============ MARKALAR ============
    const brands = await Promise.all([
        prisma.brand.upsert({ where: { slug: 'shoei' }, update: {}, create: { name: 'Shoei', slug: 'shoei' } }),
        prisma.brand.upsert({ where: { slug: 'agv' }, update: {}, create: { name: 'AGV', slug: 'agv' } }),
        prisma.brand.upsert({ where: { slug: 'arai' }, update: {}, create: { name: 'Arai', slug: 'arai' } }),
        prisma.brand.upsert({ where: { slug: 'alpinestars' }, update: {}, create: { name: 'Alpinestars', slug: 'alpinestars' } }),
        prisma.brand.upsert({ where: { slug: 'dainese' }, update: {}, create: { name: 'Dainese', slug: 'dainese' } }),
        prisma.brand.upsert({ where: { slug: 'held' }, update: {}, create: { name: 'Held', slug: 'held' } }),
        prisma.brand.upsert({ where: { slug: 'rev-it' }, update: {}, create: { name: "Rev'it", slug: 'rev-it' } }),
        prisma.brand.upsert({ where: { slug: 'nolan' }, update: {}, create: { name: 'Nolan', slug: 'nolan' } }),
        prisma.brand.upsert({ where: { slug: 'ls2' }, update: {}, create: { name: 'LS2', slug: 'ls2' } }),
        prisma.brand.upsert({ where: { slug: 'hjc' }, update: {}, create: { name: 'HJC', slug: 'hjc' } }),
    ]);
    // ============ KULLANICILAR ============
    const adminPassword = await bcrypt.hash('admin123!', 10);
    const users = await Promise.all([
        // Admin kullanıcısı
        prisma.user.upsert({
            where: { email: 'admin@vites.app' },
            update: {},
            create: {
                email: 'admin@vites.app',
                displayName: 'Vites Admin',
                passwordHash: adminPassword,
                role: 'SUPER_ADMIN',
                status: 'ACTIVE',
                emailVerifiedAt: new Date(),
            },
        }),
        prisma.user.upsert({
            where: { email: 'ahmet@example.com' },
            update: {},
            create: {
                email: 'ahmet@example.com',
                displayName: 'Ahmet Yılmaz',
                passwordHash: hashedPassword,
                status: 'ACTIVE',
                city: 'İstanbul',
                phoneVerifiedAt: new Date(),
                emailVerifiedAt: new Date(),
                identityVerifiedAt: new Date(),
                ratingAvg: 4.9,
                ratingCount: 47,
                salesCount: 132,
                isFounder: true,
            },
        }),
        prisma.user.upsert({
            where: { email: 'selin@example.com' },
            update: {},
            create: {
                email: 'selin@example.com',
                displayName: 'Selin Korkmaz',
                passwordHash: hashedPassword,
                status: 'ACTIVE',
                city: 'İzmir',
                phoneVerifiedAt: new Date(),
                emailVerifiedAt: new Date(),
                ratingAvg: 4.8,
                ratingCount: 24,
                salesCount: 48,
                isFounder: true,
            },
        }),
        prisma.user.upsert({
            where: { email: 'burak@example.com' },
            update: {},
            create: {
                email: 'burak@example.com',
                displayName: 'Burak Tan',
                passwordHash: hashedPassword,
                status: 'ACTIVE',
                city: 'Ankara',
                phoneVerifiedAt: new Date(),
                emailVerifiedAt: new Date(),
                ratingAvg: 5.0,
                ratingCount: 8,
                salesCount: 12,
            },
        }),
    ]);
    // ============ İLANLAR ============
    await Promise.all([
        prisma.listing.upsert({
            where: {
                id: 'listing-1',
            },
            update: {},
            create: {
                id: 'listing-1',
                title: 'Shoei GT-Air II Tam Yüz Kask — Mat Siyah',
                description: 'Yaklaşık 8 ay kullanıldı, hiç düşürülmedi. Pinlock vizör dahil, orijinal kutu ve fatura mevcut. Beden uymadığı için satıyorum.',
                condition: 'LIKE_NEW',
                sizeLabel: 'M (57-58)',
                price: 7250,
                originalPrice: 10900,
                city: 'İstanbul',
                status: 'ACTIVE',
                sellerId: users[1].id,
                categoryId: categories[0].id,
                brandId: brands[0].id,
                publishedAt: new Date(),
            },
        }),
        prisma.listing.upsert({
            where: { id: 'listing-2' },
            update: {},
            create: {
                id: 'listing-2',
                title: 'Alpinestars T-GP Plus R V3 Deri Mont',
                description: 'Track-use deri mont, perfekt durumdadır. Sürücü değişti, yeni aldı.',
                condition: 'GOOD',
                sizeLabel: '52',
                price: 4900,
                city: 'İzmir',
                status: 'ACTIVE',
                sellerId: users[2].id,
                categoryId: categories[1].id,
                brandId: brands[3].id,
                publishedAt: new Date(),
            },
        }),
        prisma.listing.upsert({
            where: { id: 'listing-3' },
            update: {},
            create: {
                id: 'listing-3',
                title: 'Dainese Carbon 4 Long Eldiven',
                description: 'Sıfır, etiket açılmadı. Hatalı siparişti, döndürdüm ama biraz geç kaldı.',
                condition: 'NEW',
                sizeLabel: 'L',
                price: 2150,
                city: 'Ankara',
                status: 'ACTIVE',
                sellerId: users[3].id,
                categoryId: categories[2].id,
                publishedAt: new Date(),
            },
        }),
    ]);
    // ============ ÜYELIK PLANLARI ============
    const plans = await Promise.all([
        prisma.plan.upsert({
            where: { slug: 'driver' },
            update: {},
            create: {
                name: 'Sürücü',
                slug: 'driver',
                priceMonthly: 0,
                commissionRate: 0.08,
                maxActiveListings: 5,
                featuredCredits: 0,
                isActive: true,
                sortOrder: 1,
            },
        }),
        prisma.plan.upsert({
            where: { slug: 'driver-plus' },
            update: {},
            create: {
                name: 'Sürücü+',
                slug: 'driver-plus',
                priceMonthly: 149,
                commissionRate: 0.04,
                maxActiveListings: null, // sınırsız
                featuredCredits: 3,
                isActive: true,
                sortOrder: 2,
            },
        }),
        prisma.plan.upsert({
            where: { slug: 'shop' },
            update: {},
            create: {
                name: 'Mağaza',
                slug: 'shop',
                priceMonthly: 499,
                commissionRate: 0.025,
                maxActiveListings: null,
                featuredCredits: 10,
                isActive: true,
                sortOrder: 3,
            },
        }),
    ]);
    // ============ SUBSKRİPSİYONLAR ============
    await Promise.all([
        prisma.subscription.upsert({
            where: { userId: users[1].id },
            update: {},
            create: { userId: users[1].id, planId: plans[1].id, status: 'ACTIVE', founderDiscount: true },
        }),
        prisma.subscription.upsert({
            where: { userId: users[2].id },
            update: {},
            create: { userId: users[2].id, planId: plans[0].id, status: 'ACTIVE' },
        }),
        prisma.subscription.upsert({
            where: { userId: users[3].id },
            update: {},
            create: { userId: users[3].id, planId: plans[0].id, status: 'ACTIVE' },
        }),
    ]);
    // ============ PLATFORM AYARLARI ============
    await prisma.platformSetting.upsert({
        where: { key: 'launch_mode' },
        update: { value: true },
        create: {
            key: 'launch_mode',
            value: true, // lansman dönemi: komisyonsuz
        },
    });
    await prisma.platformSetting.upsert({
        where: { key: 'commission_enabled' },
        update: { value: false },
        create: {
            key: 'commission_enabled',
            value: false, // lansmanda kapalı
        },
    });
    console.log('✅ Seeding completed!');
    console.log('\n🔐 Test hesapları:');
    console.log('  - Email: admin@vites.app     / Şifre: admin123!   (SUPER_ADMIN)');
    console.log('  - Email: ahmet@example.com   / Şifre: password123');
    console.log('  - Email: selin@example.com   / Şifre: password123');
    console.log('  - Email: burak@example.com   / Şifre: password123');
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (e) => {
    console.error('❌ Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
});
//# sourceMappingURL=seed.js.map