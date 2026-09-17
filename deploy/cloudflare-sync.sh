#!/bin/bash
# Cloudflare IP bloklarini iki yere uygular:
#   1) ufw   -> 80/443'e yalnizca Cloudflare erisebilsin. Origin dogrudan
#               vurulabildigi surece kenardaki her kural atlatilabilir.
#   2) nginx -> CF-Connecting-IP basligini gercek istemci IP'si say. Bu
#               olmadan uygulama herkesi tek IP (docker koprusu) olarak
#               goruyordu; hiz siniri kisi basina degil toplam calisiyordu.
#
# Cloudflare listeyi degistirebildigi icin haftalik cron ile kosar.
# Liste cekilemezse veya beklenenden kisa gelirse hicbir sey degistirmez:
# yarim uygulanmis bir liste siteyi tamamen kapatir.
set -euo pipefail

V4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
V6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)

[ "$(echo "$V4" | wc -l)" -ge 10 ] || { echo "IPv4 listesi kisa, iptal edildi"; exit 1; }
[ "$(echo "$V6" | wc -l)" -ge 4 ]  || { echo "IPv6 listesi kisa, iptal edildi"; exit 1; }

# --- nginx: gercek istemci IP'si ---
NGX=/etc/nginx/conf.d/cloudflare-realip.conf
{
  echo "# Otomatik uretildi: deploy/cloudflare-sync.sh - elle duzenlemeyin"
  for ip in $V4 $V6; do echo "set_real_ip_from $ip;"; done
  echo "real_ip_header CF-Connecting-IP;"
} > "$NGX.tmp"
mv "$NGX.tmp" "$NGX"
if ! nginx -t >/dev/null 2>&1; then
  echo "nginx testi basarisiz, degisiklik geri alindi"
  rm -f "$NGX"
  exit 1
fi
systemctl reload nginx
echo "nginx: gercek IP yapilandirmasi guncellendi"

echo "ufw: kurallar uygulaniyor..."

# --- ufw: 80/443 yalnizca Cloudflare'e acik ---
# Eski cloudflare kurallarini temizle. Ilk calistirmada hic kural yoktur ve
# grep 1 doner; "set -e + pipefail" altinda bu betigi sessizce oldururdu -
# nitekim ilk denemede tam olarak bu oldu. Bu yuzden basarisizligi yutuyoruz.
{ ufw status numbered | grep -i "cloudflare" | grep -oE "^\[ *[0-9]+" | grep -oE "[0-9]+" || true; } \
  | sort -rn | while read -r n; do yes | ufw delete "$n" >/dev/null 2>&1 || true; done

for ip in $V4 $V6; do
  ufw allow from "$ip" to any port 80,443 proto tcp comment "cloudflare" >/dev/null
done

# Herkese acik 80/443 kurallari varsa kaldir; kapiyi yalnizca Cloudflare acsin
yes | ufw delete allow 80/tcp  >/dev/null 2>&1 || true
yes | ufw delete allow 443/tcp >/dev/null 2>&1 || true


# Sonucu dogrula: kurallar gercekten uygulandi mi? Betik daha once sessizce
# yarida kesilmisti; "calisti sandim ama hicbir sey degismemis" durumunu
# bir daha yasamayalim.
UYGULANAN=$(ufw status | grep -ci "cloudflare" || true)
if [ "$UYGULANAN" -lt 10 ]; then
  echo "HATA: yalnizca $UYGULANAN cloudflare kurali var, beklenen 20+" >&2
  exit 1
fi

echo "[$(date -u +%FT%TZ)] Cloudflare listesi uygulandi ($(echo "$V4" | wc -l) IPv4, $(echo "$V6" | wc -l) IPv6, $UYGULANAN ufw kurali)"
