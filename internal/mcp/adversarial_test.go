package mcp

import (
	"encoding/json"
	"quiccie/internal/store"
	"strings"
	"testing"
)

func TestNullableArgumentTypes(t *testing.T) {
	s := testService(t)
	for _, args := range []map[string]any{{"project": true}, {"repository": []any{}}, {"space": 42.0}} {
		if _, err := s.Call("memory_scope", args); err == nil {
			t.Errorf("accepted invalid argument: %v", args)
		}
	}
}
func TestAmbiguousAlias(t *testing.T) {
	r := Registry{Projects: map[string]Project{"one": {Aliases: []string{"same"}}, "two": {Aliases: []string{"same"}}}}
	if _, err := r.Canonical("same"); err == nil {
		t.Fatal("ambiguous alias accepted")
	}
}
func TestSearchFallbackDoesNotReturnUnrelatedNotes(t *testing.T) {
	s := testService(t)
	_, err := s.DB.Put(store.Write{Path: "Agent Memory/projects/example-network/one.md", Content: "apple"})
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.Call("memory_search", map[string]any{"project": "example-network", "query": "absentneedle"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.(Result)["results"].([]Result)) != 0 {
		t.Fatal("unrelated note returned")
	}
}
func TestSectionIgnoresCodeAndHandlesClosingHashes(t *testing.T) {
	content := "# Start\ntext\n```sh\n# Stop\n```\n## Child\nchild\n# End\nend\n"
	want := strings.Split(content, "# End")[0]
	if got := Section(content, "Start"); got != want {
		t.Fatalf("section cut inside code: %q", got)
	}
	if got := Section("## Name ##\nbody\n", "Name"); got != "## Name ##\nbody\n" {
		t.Fatalf("closing hashes: %q", got)
	}
}
func TestRPCInvalidEnvelope(t *testing.T) {
	s := testService(t)
	for _, input := range []string{`{"id":1,"method":"ping"}`, `{"jsonrpc":"2.0","id":{},"method":"ping"}`, `null`, `[]`} {
		var result map[string]any
		if err := json.Unmarshal(s.RPC([]byte(input)), &result); err != nil {
			t.Fatal(err)
		}
		if result["error"] == nil {
			t.Errorf("invalid envelope accepted: %s", input)
		}
	}
}

func TestRecreateDeletedNote(t *testing.T) {
	s := testService(t)
	n, err := s.DB.Put(store.Write{Path: "Deleted.md", Content: "old"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.DB.Put(store.Write{Path: n.Path, Content: n.Content, Expected: &n.Checksum, Deleted: true}); err != nil {
		t.Fatal(err)
	}
	result, err := s.Call("notes_write", map[string]any{"path": n.Path, "content": "new"})
	if err != nil {
		t.Fatal(err)
	}
	if result.(Result)["action"] != "created" {
		t.Fatal(result)
	}
	history, err := s.DB.History(n.Path)
	if err != nil || len(history) != 3 {
		t.Fatal(history, err)
	}
}
