#!/usr/bin/env python3
"""Build the signed Android package. Keep the key outside Git."""
import os,pathlib,secrets,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
private=ROOT/'.private';private.mkdir(mode=0o700,exist_ok=True)
key=private/'quiccie-release.jks';password=private/'signing-password'
if not password.exists():
 fd=os.open(password,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as f:f.write(secrets.token_urlsafe(48))
env={**os.environ,'QUICCIE_SIGNING_STORE':str(key),'QUICCIE_SIGNING_PASSWORD':password.read_text().strip()}
if not key.exists():
 subprocess.run(['keytool','-genkeypair','-keystore',str(key),'-storepass:env','QUICCIE_SIGNING_PASSWORD','-keypass:env','QUICCIE_SIGNING_PASSWORD','-alias','quiccie','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Quiccie Release','-noprompt'],env=env,check=True)
 key.chmod(0o600)
subprocess.run([str(ROOT/'android/gradlew'),'-p',str(ROOT/'android'),'assembleRelease'],env=env,check=True)
print('Signed APK: android/app/build/outputs/apk/release/app-release.apk')
