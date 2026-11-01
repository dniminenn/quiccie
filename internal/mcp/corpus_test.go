package mcp

import (
	"os"
	"quiccie/internal/store"
	"strings"
	"testing"
)

// Use a consistent backup. Never open the running server database.
func TestMemoryCorpus(t *testing.T) {
	path := os.Getenv("QUICCIE_CORPUS_DB")
	if path == "" {
		t.Skip("Set QUICCIE_CORPUS_DB to a database backup")
	}
	db, e := store.Open(path)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	search, e := store.NewSearch()
	if e != nil {
		t.Fatal(e)
	}
	defer search.Close()
	s := &Service{DB: db, Search: search}
	r, e := s.Registry()
	if e != nil {
		t.Fatal(e)
	}
	notes, e := db.List()
	if e != nil {
		t.Fatal(e)
	}
	reads := 0
	for _, note := range notes {
		if !strings.HasSuffix(note.Path, ".md") {
			continue
		}
		name := "notes_read"
		args := map[string]any{"path": note.Path, "max_tokens": float64(128)}
		for project := range r.Projects {
			prefix := r.Root(project) + "/"
			if strings.HasPrefix(note.Path, prefix) {
				name = "memory_read"
				args["project"] = project
				args["path"] = strings.TrimPrefix(note.Path, prefix)
				break
			}
		}
		got, e := s.Call(name, args)
		if e != nil {
			t.Fatalf("%s: %v", note.Path, e)
		}
		read := got.(Result)
		if read["checksum"] != note.Checksum || !strings.HasPrefix(note.Content, read["content"].(string)) {
			t.Fatalf("Read differs: %s", note.Path)
		}
		reads++
	}
	queries := []string{"deployment", "memory", "network", "sync", "configuration", "release", "project", "mail"}
	hits := 0
	for _, info := range r.SpaceList() {
		space := info.ID
		for _, query := range queries {
			found, e := s.SearchSpace(r, space, query, 10)
			if e != nil {
				t.Fatal(e)
			}
			for _, scope := range found["search_scopes"].([]string) {
				if r.Space(scope) != space {
					t.Fatal("Wrong search scope")
				}
			}
			results := found["results"].([]Result)
			if len(results) > 10 {
				t.Fatal("Result budget exceeded")
			}
			for _, hit := range results {
				project := hit["project"].(string)
				if r.Space(project) != space || hit["space"] != space {
					t.Fatal("Space boundary failed")
				}
				if len(hit["snippet"].(string)) > 240 || len(hit["title"].(string)) > 120 {
					t.Fatal("Text budget exceeded")
				}
				_, e = s.Call("memory_read", map[string]any{"project": project, "path": hit["path"], "max_tokens": float64(128)})
				if e != nil {
					t.Fatal(e)
				}
				hits++
			}
		}
	}
	if hits == 0 {
		t.Fatal("No corpus search hits")
	}
	t.Logf("Checked %d note reads, %d projects, and %d bounded search hits", reads, len(r.Projects), hits)
}
