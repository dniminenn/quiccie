import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
import json
spec=importlib.util.spec_from_file_location('installer',Path(__file__).with_name('update-agent-memory.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class InstallerTests(unittest.TestCase):
 def test_preserves_other_sections_and_is_idempotent(self):
  for heading in ['#','##']:
   old='Private instructions.\n\n'+heading+' Shared durable memory\nOld text.\n\n'+heading+' Other rules\nKeep these.\n'
   block='## Shared durable memory\n\nNew text.\n'
   new=module.replace_section(old,block)
   self.assertTrue(new.startswith('Private instructions.'))
   self.assertTrue(new.endswith(heading+' Other rules\nKeep these.\n'))
   self.assertNotIn('Old text.',new)
   self.assertEqual(module.replace_section(new,block),new)
 def test_duplicate_refusal(self):
  with self.assertRaises(ValueError):module.replace_section('## Shared durable memory\na\n## Shared durable memory\nb','## Shared durable memory\nc')
 def test_full_apply_preserves_connections_and_other_settings(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)
   for rel in module.TARGETS:
    p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('Keep this rule.\n')
   for rel in module.SETTINGS:(root/rel).write_text('{"autoMemoryEnabled":true,"unrelated":42}')
   cfg=root/'.codex/config.toml';cfg.write_text('[mcp_servers.notes-memory]\ncommand="unchanged"\n')
   cmd=['python3',str(Path(module.__file__)),'--home',folder]
   subprocess.run(cmd+['--apply'],check=True,capture_output=True)
   subprocess.run(cmd+['--check'],check=True,capture_output=True)
   self.assertIn('unchanged',cfg.read_text())
   self.assertEqual(json.loads((root/module.SETTINGS[0]).read_text())['unrelated'],42)
   self.assertTrue((root/'.claude/CLAUDE.md').read_text().startswith('Keep this rule.'))


 def test_private_context_is_separate_and_survives_missing_overlay(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)
   for rel in module.TARGETS:
    p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('# Shared durable memory\nOld rules.\n')
   context=root/'.config/quiccie/agent-context.md';context.parent.mkdir(parents=True);context.write_text('Project alias: sample-project.\n')
   cmd=['python3',str(Path(module.__file__)),'--home',folder]
   subprocess.run(cmd+['--apply'],check=True,capture_output=True)
   subprocess.run(cmd+['--check'],check=True,capture_output=True)
   for rel in module.TARGETS:
    text=(root/rel).read_text()
    self.assertEqual(text.count('Private memory context'),2)  # Policy reference and section heading.
    self.assertEqual(text.count('Project alias: sample-project.'),1)
   context.unlink()
   subprocess.run(cmd+['--apply'],check=True,capture_output=True)
   for rel in module.TARGETS:self.assertIn('Project alias: sample-project.',(root/rel).read_text())
   context.write_text('')
   subprocess.run(cmd+['--apply'],check=True,capture_output=True)
   for rel in module.TARGETS:self.assertNotIn('Project alias: sample-project.',(root/rel).read_text())
 def test_public_repository_cannot_supply_private_context(self):
  with tempfile.TemporaryDirectory() as folder:
   result=subprocess.run(['python3',str(Path(module.__file__)),'--home',folder,'--private-context',str(module.ROOT/'agent-integration/memory-instructions.md'),'--apply'],capture_output=True)
   self.assertNotEqual(result.returncode,0)
   self.assertFalse((Path(folder)/module.TARGETS[0]).exists())
 def test_private_section_duplicate_refusal(self):
  with self.assertRaises(ValueError):module.replace_section('## Private memory context\na\n## Private memory context\nb','## Private memory context\nc','Private memory context')

 def test_private_profile_file_applies_and_checks_extra_profile(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);private=root/'.config/quiccie';private.mkdir(parents=True)
   (private/'agent-profiles.json').write_text('{"claude_profiles":[".claude-work"]}')
   profile=root/'.claude-work';profile.mkdir()
   wiring=profile/'.claude.json';wiring.write_text('{"mcpServers":{"notes-memory":{"command":"keep-this"}}}')
   (profile/'CLAUDE.md').write_text('Keep the profile rule.\n')
   cmd=['python3',str(Path(module.__file__)),'--home',folder]
   subprocess.run(cmd+['--apply'],check=True,capture_output=True)
   result=subprocess.run(cmd+['--check'],check=True,capture_output=True,text=True)
   self.assertIn('3 agent instruction blocks',result.stdout)
   self.assertIn('Keep the profile rule.',(profile/'CLAUDE.md').read_text())
   self.assertFalse(json.loads((profile/'settings.json').read_text())['autoMemoryEnabled'])
   self.assertEqual(json.loads(wiring.read_text())['mcpServers']['notes-memory']['command'],'keep-this')
 def test_agy_rules_only_where_agy_config_exists(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);cmd=['python3',str(Path(module.__file__)),'--home',folder]
   subprocess.run(cmd+['--apply'],check=True,capture_output=True)
   self.assertFalse((root/'.gemini').exists())
   (root/'.gemini/config').mkdir(parents=True);(root/module.AGY_TARGET).write_text('Keep the agy rule.\n')
   subprocess.run(cmd+['--apply'],check=True,capture_output=True)
   result=subprocess.run(cmd+['--check'],check=True,capture_output=True,text=True)
   self.assertIn('3 agent instruction blocks',result.stdout)
   text=(root/module.AGY_TARGET).read_text()
   self.assertTrue(text.startswith('Keep the agy rule.'))
   self.assertEqual(text.count('Shared durable memory'),1)
 def test_profile_paths_are_bounded_and_deduplicated(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)
   self.assertEqual(module.claude_profiles(root,['.claude-work','.claude','.claude-work']),['.claude-work'])
   for value in ['/tmp/profile','../.claude-work','.claude-work/subdir',42]:
    with self.assertRaises(ValueError):module.claude_profiles(root,[value])

checker_spec=importlib.util.spec_from_file_location('checker',Path(__file__).with_name('check-agent-mcp.py'))
checker=importlib.util.module_from_spec(checker_spec);checker_spec.loader.exec_module(checker)

class ConnectionTests(unittest.TestCase):
 def fixture(self,folder,wrong=False):
  import sys
  root=Path(folder)
  (root/'marker').write_text('present')
  server=root/'server.py'
  server.write_text("""import json,os,sys,pathlib
if os.environ.get('QUICCIE_TEST_MARKER')!='present' or not pathlib.Path('marker').exists():sys.exit(2)
for line in sys.stdin:
 r=json.loads(line)
 if 'id' not in r:continue
 with open('requests.jsonl','a') as log:log.write(json.dumps({'method':r['method'],'params':r['params']})+'\\n')
 if r['method']=='initialize':out={'protocolVersion':'2024-11-05','capabilities':{},'serverInfo':{'name':'test','version':'1'}}
 elif r['method']=='tools/list':out={'tools':[{'name':name} for name in ['spaces_list','memory_search_space','notes_search_space']]}
 elif r['params']['name']=='spaces_list':out={'structuredContent':{'spaces':[{'id':'studio','name':'Studio','shared_project':'shared-studio'},{'id':'home-sandbox','name':'Home','shared_project':'shared-home'}]}}
 else:
  space=r['params']['arguments']['space'];hit='wrong-space' if os.environ.get('QUICCIE_TEST_WRONG') else space
  out={'content':[{'type':'text','text':json.dumps({'space':space,'results':[{'space':hit,'project':'sample-project'}]})}]}
 print(json.dumps({'jsonrpc':'2.0','id':r['id'],'result':out}),flush=True)
""")
  return {'command':sys.executable,'args':[str(server)],'env':{'QUICCIE_TEST_MARKER':'present',**({'QUICCIE_TEST_WRONG':'1'} if wrong else {})},'cwd':folder}
 def test_discovered_spaces_and_configured_environment(self):
  with tempfile.TemporaryDirectory() as folder:
   self.assertEqual(checker.check_connection(self.fixture(folder)),2)
   rows=[json.loads(line) for line in (Path(folder)/'requests.jsonl').read_text().splitlines()]
   calls=[r['params'] for r in rows if r['method']=='tools/call']
   self.assertEqual({c['arguments']['space'] for c in calls if c['name']=='memory_search_space'},{'studio','home-sandbox'})
   self.assertEqual({c['name'] for c in calls},{'spaces_list','memory_search_space'})
 def test_selected_space_and_unknown_space(self):
  with tempfile.TemporaryDirectory() as folder:
   config=self.fixture(folder)
   self.assertEqual(checker.check_connection(config,['studio']),1)
   with self.assertRaises(ValueError):checker.check_connection(config,['unregistered'])
 def test_result_in_another_space_is_rejected(self):
  with tempfile.TemporaryDirectory() as folder:
   with self.assertRaises(RuntimeError):checker.check_connection(self.fixture(folder,True))
 def test_missing_and_http_configs(self):
  with tempfile.TemporaryDirectory() as folder:
   self.assertIsNone(checker.read_config(Path(folder),'claude'))
  with self.assertRaises(ValueError):checker.check_connection({'url':'https://notes.example.invalid/mcp'})

 def test_agy_config_is_read(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'.gemini/config').mkdir(parents=True)
   (root/'.gemini/config/mcp_config.json').write_text('{"mcpServers":{"notes-memory":{"command":"keep-this"}}}')
   self.assertEqual(checker.read_config(root,'agy'),{'command':'keep-this'})

 def test_private_profiles_are_discovered_by_checker(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);private=root/'.config/quiccie';private.mkdir(parents=True)
   (private/'agent-profiles.json').write_text('{"claude_profiles":[".claude-work"]}')
   profile=root/'.claude-work';profile.mkdir()
   (profile/'.claude.json').write_text(json.dumps({'mcpServers':{'notes-memory':self.fixture(folder)}}))
   self.assertEqual(checker.claude_profiles(root),module.claude_profiles(root))
   result=subprocess.run(['python3',str(Path(checker.__file__)),'--home',folder],check=True,capture_output=True,text=True)
   self.assertIn('PASS: claude-work:',result.stdout)
   (profile/'.claude.json').unlink()
   result=subprocess.run(['python3',str(Path(checker.__file__)),'--home',folder],capture_output=True,text=True)
   self.assertNotEqual(result.returncode,0)
   self.assertIn('required agent',result.stderr)

if __name__=='__main__':unittest.main()
