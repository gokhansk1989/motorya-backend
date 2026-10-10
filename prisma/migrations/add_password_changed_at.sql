-- Sifre degisiminden sonra elde duran access token'in gecersiz sayilabilmesi
-- icin degisim zamani saklanir. Cihaz (refresh) iptali zaten yapiliyordu ama
-- imzali access token durumsuz oldugu icin suresi dolana kadar calisiyordu.
-- Yeniden kosulabilir.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
