package mcp

import (
	"encoding/json"
	"path/filepath"
	"quiccie/internal/store"
	"strings"
	"testing"
)

func testService(t *testing.T) *Service {
	t.Helper()
	db, e := store.Open(filepath.Join(t.TempDir(), "notes.db"))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { db.Close() })
	r := Registry{Version: 1, Projects: map[string]Project{"global": {Aliases: []string{"global"}, Repositories: []string{}}, "example-network": {Aliases: []string{"example-network", "example-repo"}, Repositories: []string{"git.example.com/team/example-repo"}}, "work": {Aliases: []string{"work"}, Space: "work", Repositories: []string{}}, "example-mail": {Aliases: []string{"example-mail"}, Space: "work", Repositories: []string{}}, "other": {Aliases: []string{"other"}, Repositories: []string{}}}}
	b, _ := json.Marshal(r)
	if e = db.Set("settings", "registry", b); e != nil {
		t.Fatal(e)
	}
	return &Service{DB: db}
}
func TestByteBudgetAndCharacterOffset(t *testing.T) {
	content := "a🦊é中z"
	hash := store.Hash([]byte(content))
	p, e := Page(content, hash, 5, 0, nil)
	if e != nil || p["content"] != "a🦊" || p["next_offset"] != 2 {
		t.Fatal(p, e)
	}
	p, e = Page(content, hash, 5, 2, &hash)
	if e != nil || p["content"] != "é中" || p["next_offset"] != 4 {
		t.Fatal(p, e)
	}
	if _, e = Page(content, hash, 1, 1, &hash); e == nil {
		t.Fatal("split UTF-8 character")
	}
	if _, e = Page(content, hash, 5, 2, nil); e == nil {
		t.Fatal("unchecked continuation")
	}
}
func TestScopeIsolationAndWrites(t *testing.T) {
	s := testService(t)
	for _, p := range []string{"Agent Memory/global/shared.md", "Agent Memory/projects/example-network/net.md", "Agent Memory/projects/other/private.md", "Work/Agent Memory/global/shared.md", "Work/Agent Memory/projects/example-mail/mail.md"} {
		if _, e := s.DB.Put(store.Write{Path: p, Content: "needle"}); e != nil {
			t.Fatal(e)
		}
	}
	v, e := s.Call("memory_search", map[string]any{"project": "example-mail", "query": "needle"})
	if e != nil {
		t.Fatal(e)
	}
	b, _ := json.Marshal(v)
	if strings.Contains(string(b), "example-network") || strings.Contains(string(b), "private.md") {
		t.Fatal(string(b))
	}
	if !strings.Contains(string(b), "work") {
		t.Fatal(string(b))
	}
	if _, e = s.Call("notes_read", map[string]any{"path": "Work/Agent Memory/global/shared.md"}); e == nil {
		t.Fatal("memory boundary bypass")
	}
	if _, e = s.Call("notes_read", map[string]any{"path": "../secret.md"}); e == nil {
		t.Fatal("path traversal")
	}
	v, e = s.Call("notes_write", map[string]any{"path": "Human.md", "content": "first"})
	if e != nil {
		t.Fatal(e)
	}
	checksum := v.(Result)["checksum"].(string)
	if _, e = s.Call("notes_write", map[string]any{"path": "Human.md", "content": "lost"}); e == nil {
		t.Fatal("unchecked replacement")
	}
	if _, e = s.Call("notes_write", map[string]any{"path": "Human.md", "content": "second", "expected_checksum": checksum}); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Call("notes_write", map[string]any{"path": "Human.md", "content": "stale", "expected_checksum": checksum}); e == nil {
		t.Fatal("stale checksum")
	}
}
func TestRepositoryScopeIdentity(t *testing.T) {
	s := testService(t)
	a := map[string]any{"repository": "git@GitHub.com:Example/Project.git", "space": "personal"}
	r, id, e := s.ResolveRegistry(a)
	if e != nil {
		t.Fatal(e)
	}
	_, again, e := s.ResolveRegistry(map[string]any{"repository": "https://github.com/example/project/"})
	if e != nil || id != again {
		t.Fatal(id, again, e)
	}
	if r.Space(id) != "personal" {
		t.Fatal(r)
	}
	for _, invalid := range []string{"/home/me/project", "file:///tmp/project", "https://u:password@example.com/a/b", "https://example.com/a/%2e%2e/b", "https://example.com/a/b?token=x"} {
		if _, e = RepositoryIdentity(invalid); e == nil {
			t.Fatal(invalid)
		}
	}
	if _, _, e = s.ResolveRegistry(map[string]any{"project": "global", "repository": "https://example.com/a/b"}); e == nil {
		t.Fatal("global repository binding")
	}
}
func TestToolsSchemaAndErrorShape(t *testing.T) {
	s := testService(t)
	res := s.RPC([]byte(`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}`))
	var reply map[string]any
	if e := json.Unmarshal(res, &reply); e != nil {
		t.Fatal(e)
	}
	tools := reply["result"].(map[string]any)["tools"].([]any)
	if len(tools) != 11 {
		t.Fatal(len(tools))
	}
	res = s.RPC([]byte(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"notes_read","arguments":{"path":"../secret.md"}}}`))
	json.Unmarshal(res, &reply)
	result := reply["result"].(map[string]any)
	if result["isError"] != true || result["structuredContent"] != nil {
		t.Fatal(string(res))
	}
}
func TestMemoryDelete(t *testing.T) {
	s := testService(t)
	v, e := s.Call("memory_write", map[string]any{"project": "example-network", "path": "notes/gone.md", "content": "needle delete-me\n"})
	if e != nil {
		t.Fatal(e)
	}
	checksum := v.(Result)["checksum"].(string)
	if _, e = s.DB.Put(store.Write{Path: "Agent Memory/projects/other/keep.md", Content: "needle other"}); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Call("memory_delete", map[string]any{"project": "example-network", "path": "notes/gone.md"}); e == nil {
		t.Fatal("delete without checksum")
	}
	wrong := strings.Repeat("0", 64)
	if _, e = s.Call("memory_delete", map[string]any{"project": "example-network", "path": "notes/gone.md", "expected_checksum": wrong}); e == nil {
		t.Fatal("delete with a stale checksum")
	}
	if _, e = s.Call("memory_delete", map[string]any{"project": "example-network", "path": "../other/keep.md", "expected_checksum": wrong}); e == nil {
		t.Fatal("path traversal")
	}
	other, e := s.DB.Get("Agent Memory/projects/other/keep.md")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Call("memory_delete", map[string]any{"project": "example-network", "path": "keep.md", "expected_checksum": other.Checksum}); e == nil {
		t.Fatal("deleted outside the project root")
	}
	if n, e := s.DB.Get("Agent Memory/projects/other/keep.md"); e != nil || n.Deleted {
		t.Fatal("other project changed", e)
	}
	v, e = s.Call("memory_delete", map[string]any{"project": "example-network", "path": "notes/gone.md", "expected_checksum": checksum})
	if e != nil || v.(Result)["action"] != "deleted" {
		t.Fatal(v, e)
	}
	if _, e = s.Call("memory_read", map[string]any{"project": "example-network", "path": "notes/gone.md"}); e == nil {
		t.Fatal("deleted note still readable")
	}
	v, e = s.Call("memory_search", map[string]any{"project": "example-network", "query": "delete-me"})
	if e != nil {
		t.Fatal(e)
	}
	if b, _ := json.Marshal(v); strings.Contains(string(b), "gone.md") {
		t.Fatal(string(b))
	}
	if _, e = s.Call("memory_delete", map[string]any{"project": "example-network", "path": "notes/gone.md", "expected_checksum": checksum}); e == nil {
		t.Fatal("second delete")
	}
	v, e = s.Call("memory_write", map[string]any{"project": "example-network", "path": "notes/gone.md", "content": "back\n"})
	if e != nil || v.(Result)["action"] != "created" {
		t.Fatal("write after delete", v, e)
	}
}
func TestMemoryMetadata(t *testing.T) {
	got, e := MemoryContent("example-network", "test/Sample.md", "Hello.\n", "")
	want := "---\ntitle: Sample\ntype: note\npermalink: example-network/test/sample\n---\n\nHello.\n"
	if e != nil || got != want {
		t.Fatalf("%q %v", got, e)
	}
	got, e = MemoryContent("example-network", "test/Sample.md", "---\ntags: [one, two]\n---\n\nHello.\n", "")
	if e != nil {
		t.Fatal(e)
	}
	fields, body, _, err := parseMetadata(got)
	if err != nil || body != "\nHello.\n" || len(field(fields, "tags").Content) != 2 {
		t.Fatal(got, err)
	}
	got, e = MemoryContent("example-network", "test/Sample.md", "Updated.", got)
	fields, _, _, err = parseMetadata(got)
	if e != nil || err != nil || len(field(fields, "tags").Content) != 2 {
		t.Fatal(got, e, err)
	}
}
