#!/bin/sh
# Install an authorized backend update. Keep SSH and client bridges running.
set -eu
stage=${1:?Supply the stage directory}
test -s "$stage/quiccie"
backup=/root/quiccie-backend-$(date -u +%Y%m%dT%H%M%S)
mkdir -m 700 "$backup"
cp /opt/quiccie/quiccie "$backup/quiccie"
install -m 755 "$stage/quiccie" /opt/quiccie/quiccie.next
stopped=0
success=0
rollback() {
 if [ "$success" -eq 0 ] && [ "$stopped" -eq 1 ]; then
  systemctl stop quiccie || true
  install -m 755 "$backup/quiccie" /opt/quiccie/quiccie.rollback
  mv /opt/quiccie/quiccie.rollback /opt/quiccie/quiccie
  systemctl start quiccie
 fi
}
trap rollback EXIT
stopped=1
systemctl stop quiccie
cp /var/lib/quiccie/quiccie.db "$backup/quiccie.db"
chmod 600 "$backup/quiccie.db"
mv /opt/quiccie/quiccie.next /opt/quiccie/quiccie
systemctl start quiccie
python3 - <<'CHECK'
import json,time,urllib.request
for attempt in range(30):
 try:
  with urllib.request.urlopen('http://127.0.0.1:8090/healthz',timeout=2) as response:
   result=json.load(response)
  assert result.get('application')=='quiccie' and result.get('status')=='ok'
  print('Backend health check passed.')
  break
 except Exception:
  if attempt==29:raise
  time.sleep(0.3)
CHECK
success=1
trap - EXIT
systemctl is-active quiccie nginx
printf 'Backend backup: %s\n' "$backup"
