#!/usr/bin/env python3
"""Collect notices for the packages used in the release."""
import hashlib,io,json,os,pathlib,subprocess,zipfile,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/licenses';OUT.mkdir(parents=True,exist_ok=True)
entries=[];notices={};errors=[]
def include(name,data):
 if not data.strip():return
 digest=hashlib.sha256(data.encode()).hexdigest()[:16]
 notices.setdefault(digest,{'names':[],'text':data})['names'].append(name)
def files_at(directory):
 return [p for p in directory.iterdir() if p.is_file() and p.name.lower().startswith(('license','licence','copying','notice','copyright'))]
def objects(text):
 decoder=json.JSONDecoder();pos=0
 while pos<len(text):
  while pos<len(text) and text[pos].isspace():pos+=1
  if pos==len(text):break
  obj,pos=decoder.raw_decode(text,pos);yield obj
raw=subprocess.check_output(['go','list','-deps','-json','./cmd/quiccie'],cwd=ROOT,env={**os.environ,'CGO_ENABLED':'0'},text=True)
modules={}
for package in objects(raw):
 m=package.get('Module')
 if m and not m.get('Main'):modules[m['Path']]=m
for name,m in sorted(modules.items()):
 directory=pathlib.Path(m['Dir']);licenses=files_at(directory)
 if not licenses:errors.append('Missing Go license: '+name)
 for p in licenses:include(name,p.read_text(errors='replace'))
 entries.append({'ecosystem':'go','name':name,'version':m['Version']})
lock=json.loads((ROOT/'web/package-lock.json').read_text())
permissive={'MIT','ISC','Apache-2.0','BSD-2-Clause','BSD-3-Clause','0BSD','(MIT OR Apache-2.0)','PSF-2.0','(MPL-2.0 OR Apache-2.0)'}
def repository(package):
 value=package.get('repository','')
 return value.get('url','') if isinstance(value,dict) else value
for path,record in sorted(lock['packages'].items()):
 if not path:continue
 directory=ROOT/'web'/path
 if not directory.exists():
  if not record.get('optional'):errors.append('Missing npm package: '+path)
  continue
 package=json.loads((directory/'package.json').read_text());name=package['name'];license_id=package.get('license')
 role='build-or-test-tool' if record.get('dev') else 'browser-runtime-candidate'
 if name in {'daisyui','tailwindcss'}:role='css-output-contributor'
 lightning=record.get('dev') and (name=='lightningcss' or name.startswith('lightningcss-'))
 if license_id not in permissive and not (lightning and license_id=='MPL-2.0'):
  errors.append('Review npm license: '+name+' '+str(license_id))
 license_files=files_at(directory)
 source=name
 # Native tool packages can omit the notice supplied by their matching parent.
 parent='esbuild' if name.startswith('@esbuild/') else 'rollup' if name.startswith('@rollup/rollup-') else None
 if not license_files and parent and record.get('dev'):
  parent_dir=ROOT/'web/node_modules'/parent
  metadata=parent_dir/'package.json'
  if metadata.exists():
   upstream=json.loads(metadata.read_text())
   if (repository(package) and repository(package)==repository(upstream)
       and package['version']==upstream['version'] and license_id==upstream.get('license')):
    license_files=files_at(parent_dir);source=parent
 omission=None
 if not license_files:
  if (name.startswith('@napi-rs/lzma-') and record.get('dev') and license_id=='MIT'
      and repository(package)=='git+https://github.com/Brooooooklyn/lzma.git'):
   omission='Build-only native compression tool. The installed package has no notice file. Do not redistribute this tool in application releases.'
  else:errors.append('Missing npm notice: '+name)
 for p in license_files:include(name,p.read_text(errors='replace'))
 entry={'ecosystem':'npm','name':name,'version':package['version'],'license':license_id,
        'selected_license':'Apache-2.0' if license_id=='(MPL-2.0 OR Apache-2.0)' else license_id,
        'role':role,'notice_source':source if license_files else None}
 if omission:entry['notice_omission']=omission
 entries.append(entry)
artifacts=ROOT/'android/app/build/license-artifacts.tsv'
if artifacts.exists():
 cache=pathlib.Path.home()/'.gradle/caches/modules-2/files-2.1'
 for line in artifacts.read_text().splitlines():
  group,name,version,filename=line.split('\t');identifier=group+':'+name
  poms=list((cache/group/name/version).glob('*/*.pom'))
  if not poms:errors.append('Missing Android POM: '+identifier);continue
  root=ET.parse(poms[0]).getroot();ns={'m':'http://maven.apache.org/POM/4.0.0'}
  licenses=[e.text or '' for e in root.findall('.//m:licenses/m:license/m:name',ns)]
  if not licenses:errors.append('Review Android license: '+identifier)
  if any(not any(s in l.lower() for s in ('apache','bsd','mit')) for l in licenses):errors.append('Review Android license terms: '+identifier+' '+str(licenses))
  entries.append({'ecosystem':'android','name':identifier,'version':version,'licenses':licenses})
  def archive(data):
   with zipfile.ZipFile(data) as z:
    for info in z.infolist():
     base=pathlib.PurePosixPath(info.filename).name.lower()
     if base.startswith(('license','notice','copyright')):include(identifier,z.read(info).decode(errors='replace'))
     if base=='classes.jar':archive(io.BytesIO(z.read(info)))
  archive(pathlib.Path(filename))
else:errors.append('Run the Android licenseArtifacts task.')
# Apache dependencies can refer to this text without bundling a separate copy.
apache=ROOT/'web/node_modules/typescript/LICENSE.txt'
if apache.exists():include('Apache-2.0 license',apache.read_text())
text='Quiccie dependency notices\n\nOriginal Quiccie code uses 0BSD. Dependencies keep the terms below.\n\n'
for item in entries:
 text+=item['ecosystem']+' '+item['name']+' '+item['version']+' ['+item.get('role','application-dependency')+']\n'
 if item.get('notice_omission'):text+='  '+item['notice_omission']+'\n'
 if item.get('notice_source') and item['notice_source']!=item['name']:text+='  Notice source: '+item['notice_source']+' (matching version, repository, and license).\n'
for digest,item in notices.items():text+='\n'+'='*72+'\n'+', '.join(sorted(set(item['names'])))+'\n\n'+item['text']+'\n'
(OUT/'THIRD_PARTY_NOTICES.txt').write_text(text)
(OUT/'inventory.json').write_text(json.dumps(entries,indent=2)+'\n')
print(f'Collected {len(entries)} package records and {len(notices)} notice texts.')
for entry in entries:
 if entry.get('notice_omission'):print('Build-tool notice limit: '+entry['name']+'. See inventory.json.')
for error in errors:print(error)
raise SystemExit(bool(errors))
