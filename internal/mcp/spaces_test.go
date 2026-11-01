package mcp

import (
	"encoding/json"
	"path/filepath"
	"quiccie/internal/store"
	"testing"
)

func TestCustomSpaces(t *testing.T) {
	db, e := store.Open(filepath.Join(t.TempDir(), "data.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	r := Registry{Version: 1, Projects: map[string]Project{"global": {}, "example-network": {}, "work": {Space: "work"}}}
	raw, _ := json.Marshal(r)
	db.Set("settings", "registry", raw)
	index, _ := store.NewSearch()
	defer index.Close()
	s := &Service{DB: db, Search: index}
	for _, bad := range []string{"personal", "../escape", "Side gig", "work"} {
		if _, e = s.CreateSpace(bad, "Side gig"); e == nil {
			t.Fatal(bad)
		}
	}
	sp, e := s.CreateSpace("side-gig", "Side gig")
	if e != nil {
		t.Fatal(e)
	}
	if sp.Shared != "space-side-gig" {
		t.Fatal(sp)
	}
	if _, e = s.CreateSpace("side-gig", "Side gig"); e != nil {
		t.Fatal("Retry failed", e)
	}
	if _, e = s.CreateSpace("other", "Side gig"); e == nil {
		t.Fatal("Duplicate name accepted")
	}
	r, _ = s.Registry()
	if r.Root("global") != "Agent Memory/global" || r.Root("work") != "Work/Agent Memory/global" {
		t.Fatal("Legacy roots changed")
	}
	if r.Root(sp.Shared) != "Spaces/side-gig/Agent Memory/global" {
		t.Fatal("Wrong custom root")
	}
	got, e := s.Call("memory_scope", map[string]any{"space": "side-gig", "repository": "https://example.test/gigs/website"})
	if e != nil {
		t.Fatal(e)
	}
	project := got.(Result)["project"].(string)
	r, _ = s.Registry()
	if r.Scopes(project)[0] != sp.Shared {
		t.Fatal("Wrong shared scope")
	}
	for _, p := range []string{r.Root(project) + "/test.md", r.Root(sp.Shared) + "/test.md", "Agent Memory/global/test.md", "Work/Agent Memory/global/test.md", "Spaces/side-gig/Notes/test.md", "Personal.md", "Work/Work.md"} {
		if _, e = db.Put(store.Write{Path: p, Content: "scopemarker"}); e != nil {
			t.Fatal(e)
		}
	}
	broad, e := s.SearchSpace(r, "side-gig", "scopemarker", 10)
	if e != nil || len(broad["results"].([]Result)) != 2 {
		t.Fatal(broad, e)
	}
	ordinary, e := s.Call("notes_search_space", map[string]any{"space": "side-gig", "query": "scopemarker"})
	if e != nil || len(ordinary.(Result)["results"].([]Result)) != 1 {
		t.Fatal(ordinary, e)
	}
	old, e := s.Call("notes_search", map[string]any{"query": "scopemarker"})
	if e != nil || len(old.(Result)["results"].([]Result)) != 3 {
		t.Fatal("Legacy search changed", old, e)
	}
	if _, e = s.Call("memory_scope", map[string]any{"project": project, "space": "personal"}); e == nil {
		t.Fatal("Cross-space scope accepted")
	}
	if _, e = s.Call("notes_search_space", map[string]any{"space": "missing", "query": "scopemarker"}); e == nil {
		t.Fatal("Unknown space accepted")
	}
}

func TestExplicitCatalogPreservesScope(t *testing.T) {
	s := testService(t)
	s.Search, _ = store.NewSearch()
	defer s.Search.Close()
	r := Registry{Version: 1, Catalog: []SpaceInfo{{"personal", "Personal", "", "global"}, {"business", "Business", "Company records/", "company-shared"}}, Projects: map[string]Project{"global": {}, "company-shared": {Space: "business"}, "example": {Space: "business"}}}
	if err := r.Validate(); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(r)
	s.DB.Set("settings", "registry", raw)
	if r.Root("company-shared") != "Company records/Agent Memory/global" || r.PathSpace("Company records/Plan.md") != "business" {
		t.Fatal(r)
	}
	for _, path := range []string{"Company records/Plan.md", "Company records/Agent Memory/global/Fact.md", "Company records/Agent Memory/projects/example/Fact.md", "Personal.md"} {
		if _, err := s.DB.Put(store.Write{Path: path, Content: "catalogmarker"}); err != nil {
			t.Fatal(err)
		}
	}
	hits, err := s.Search.QueryInSpace(s.DB, "catalogmarker", "business", "")
	if err != nil || len(hits) != 3 {
		t.Fatal(hits, err)
	}
	scoped, err := s.Search.QueryScoped(s.DB, "catalogmarker", r.Scopes("example"), 10)
	if err != nil || len(scoped) != 2 {
		t.Fatal(scoped, err)
	}
	r.Catalog[1].ID = "renamed"
	r.Projects["company-shared"] = Project{Space: "renamed"}
	r.Projects["example"] = Project{Space: "renamed"}
	raw, _ = json.Marshal(r)
	s.DB.Set("settings", "registry", raw)
	hits, err = s.Search.QueryInSpace(s.DB, "catalogmarker", "business", "")
	if err != nil || len(hits) != 0 {
		t.Fatal("Stale catalog index", hits, err)
	}
	hits, err = s.Search.QueryInSpace(s.DB, "catalogmarker", "renamed", "")
	if err != nil || len(hits) != 3 {
		t.Fatal(hits, err)
	}
	r.Catalog = nil
	if r.Validate() == nil {
		t.Fatal("Unknown legacy space accepted")
	}
}
func TestNewRepositoryNeedsSpace(t *testing.T) {
	s := testService(t)
	if _, _, err := s.ResolveRegistry(map[string]any{"repository": "https://example.test/team/new-project"}); err == nil {
		t.Fatal("Space was inferred")
	}
}
