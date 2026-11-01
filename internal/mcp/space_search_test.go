package mcp

import (
	"encoding/json"
	"os"
	"quiccie/internal/store"
	"testing"
)

func TestSearchSpaceIsolation(t *testing.T) {
	for _, indexed := range []bool{false, true} {
		t.Run(map[bool]string{false: "literal", true: "indexed"}[indexed], func(t *testing.T) {
			s := testService(t)
			if indexed {
				idx, err := store.NewSearch()
				if err != nil {
					t.Fatal(err)
				}
				defer idx.Close()
				s.Search = idx
			}
			paths := []string{"Agent Memory/global/item.md", "Agent Memory/projects/example-network/item.md", "Agent Memory/projects/other/item.md", "Work/Agent Memory/global/item.md", "Work/Agent Memory/projects/example-mail/item.md", "Work/Human.md", "Human.md", "Agent Memory/projects/example-mail/wrong-space.md"}
			for _, path := range paths {
				if _, err := s.DB.Put(store.Write{Path: path, Content: "spacemarker"}); err != nil {
					t.Fatal(err)
				}
			}
			for _, space := range []string{"personal", "work"} {
				got, err := s.Call("memory_search_space", map[string]any{"space": space, "query": "spacemarker", "limit": float64(10)})
				if err != nil {
					t.Fatal(err)
				}
				r := got.(Result)
				hits := r["results"].([]Result)
				want := 3
				if space == "work" {
					want = 2
				}
				if len(hits) != want {
					t.Fatalf("%s: %v", space, r)
				}
				registry, _ := s.Registry()
				for _, h := range hits {
					if h["space"] != space || registry.Space(h["project"].(string)) != space {
						t.Fatal(h)
					}
					if _, err := s.Call("memory_read", map[string]any{"project": h["project"], "path": h["path"]}); err != nil {
						t.Fatal(err)
					}
				}
			}
			got, _ := s.Call("memory_search", map[string]any{"project": "example-network", "query": "spacemarker"})
			if len(got.(Result)["results"].([]Result)) != 2 {
				t.Fatal(got)
			}
			for _, args := range []map[string]any{{"query": "x"}, {"space": "all", "query": "x"}, {"space": "unknown-space", "query": "x"}, {"space": "personal", "query": ""}, {"space": "personal", "query": "x", "limit": float64(11)}, {"space": "personal", "query": "x", "limit": 1.5}, {"space": "personal", "query": "x", "project": "example-mail"}} {
				if _, err := s.Call("memory_search_space", args); err == nil {
					t.Fatal(args)
				}
			}
			empty, err := s.Call("memory_search_space", map[string]any{"space": "work", "query": "zzznomatch"})
			if err != nil || len(empty.(Result)["results"].([]Result)) != 0 {
				t.Fatal(empty, err)
			}
		})
	}
}
func TestLegacyToolDefinitionsUnchanged(t *testing.T) {
	raw, err := os.ReadFile("legacy-mcp.json")
	if err != nil {
		t.Fatal(err)
	}
	var legacy, current map[string]any
	json.Unmarshal(raw, &legacy)
	json.Unmarshal(Contract, &current)
	extract := func(c map[string]any) []any {
		return c["tools"].(map[string]any)["result"].(map[string]any)["tools"].([]any)
	}
	for i, tool := range extract(legacy) {
		a, _ := json.Marshal(tool)
		b, _ := json.Marshal(extract(current)[i])
		if string(a) != string(b) {
			t.Fatal("Legacy tool changed")
		}
	}
}
