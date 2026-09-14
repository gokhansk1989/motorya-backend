// CORS_ORIGIN tanımlıysa o kullanılır; aşağısı sadece yerel geliştirme ve
// sunucuda değişken unutulursa alan adlarının çalışmaya devam etmesi için.
// Eski sunucunun IP'si (98.93.139.51) listeden çıkarıldı: o makine artık bizim
// değil, izin listesinde tutmanın tek etkisi gereksiz genişlikti.
export function getAllowedOrigins(): string[] {
  return (
    process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3001',
      'http://localhost:3002',
      'http://motorya.com.tr',
      'https://motorya.com.tr',
      'http://www.motorya.com.tr',
      'https://www.motorya.com.tr',
      'http://admin.motorya.com.tr',
      'https://admin.motorya.com.tr',
    ]
  );
}
