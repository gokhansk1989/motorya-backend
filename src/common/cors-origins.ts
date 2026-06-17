export function getAllowedOrigins(): string[] {
  return (
    process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3001',
      'http://localhost:3002',
      'http://98.93.139.51',
      'http://98.93.139.51:3001',
      'http://98.93.139.51:3002',
      'http://motorya.com.tr',
      'https://motorya.com.tr',
      'http://www.motorya.com.tr',
      'https://www.motorya.com.tr',
      'http://admin.motorya.com.tr',
      'https://admin.motorya.com.tr',
    ]
  );
}
