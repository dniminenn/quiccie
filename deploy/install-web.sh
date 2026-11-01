#!/bin/sh
# Install a staged web build. Keep the Quiccie and SSH processes running.
set -eu
stage=${1:?Supply the staged release directory}
web_root=/opt/quiccie/web
release_id=$(sha256sum "$stage/web/index.html" | cut -c1-16)
release="$web_root/releases/$release_id"
backup=/root/quiccie-web-before-$(date -u +%Y%m%dT%H%M%S)
mkdir -p "$web_root/assets" "$web_root/releases"
mkdir -m 700 "$backup"
cp /etc/nginx/sites-available/quiccie "$backup/nginx.conf"
readlink "$web_root/current" > "$backup/previous-target" || true
backend_pid=$(systemctl show quiccie -p MainPID --value)
# Retain old hashed assets for tabs and service workers that still use them.
for asset in "$stage"/web/assets/*; do
 target="$web_root/assets/$(basename "$asset")"
 if [ -f "$target" ]; then cmp "$asset" "$target"; else install -m 644 "$asset" "$target"; fi
done
if [ ! -d "$release" ]; then
 mkdir "$release"
 cp -a "$stage/web/." "$release/"
 chmod -R a+rX "$release"
fi
ln -s "$release" "$web_root/current.next"
mv -Tf "$web_root/current.next" "$web_root/current"
config_changed=0
if ! cmp -s "$stage/nginx.conf" /etc/nginx/sites-available/quiccie; then
 install -m 644 "$stage/nginx.conf" /etc/nginx/sites-available/quiccie
 if ! nginx -t; then
  cp "$backup/nginx.conf" /etc/nginx/sites-available/quiccie
  exit 1
 fi
 systemctl reload nginx
 config_changed=1
fi
if [ -f "$stage/quiccie.apk" ]; then
 cp /opt/quiccie/releases/quiccie.apk "$backup/quiccie.apk"
 install -m 644 "$stage/quiccie.apk" /opt/quiccie/releases/quiccie.apk.next
 mv /opt/quiccie/releases/quiccie.apk.next /opt/quiccie/releases/quiccie.apk
fi
test "$backend_pid" = "$(systemctl show quiccie -p MainPID --value)"
systemctl is-active quiccie nginx
printf 'Web release: %s; backend PID unchanged: %s; nginx config changed: %s\n' "$release_id" "$backend_pid" "$config_changed"
