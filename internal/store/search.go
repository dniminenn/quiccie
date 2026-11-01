package store

import (
	"fmt"
	"github.com/blevesearch/bleve/v2"
	"strings"
	"sync"
)

type Search struct {
	mu       sync.Mutex
	index    bleve.Index
	sequence uint64
	registry string
}

func NewSearch() (*Search, error) {
	mapping := bleve.NewIndexMapping()
	doc := bleve.NewDocumentMapping()
	field := bleve.NewTextFieldMapping()
	field.Analyzer = "keyword"
	doc.AddFieldMappingsAt("scope", field)
	doc.AddFieldMappingsAt("space", field)
	doc.AddFieldMappingsAt("kind", field)
	mapping.DefaultMapping = doc
	idx, e := bleve.NewMemOnly(mapping)
	if e != nil {
		return nil, e
	}
	return &Search{index: idx}, nil
}
func (s *Search) Close() error { return s.index.Close() }
func (s *Search) Refresh(db *Store) error {
	data, err := db.Value("settings", "registry")
	if err != nil && err != ErrMissing {
		return err
	}
	catalog, err := catalogFromRegistry(data)
	if err != nil {
		return err
	}
	if s.registry != string(data) {
		fresh, err := NewSearch()
		if err != nil {
			return err
		}
		s.index.Close()
		s.index = fresh.index
		s.sequence = 0
		s.registry = string(data)
	}

	for {
		changes, next, e := db.Changes(s.sequence, 256)
		if e != nil {
			return e
		}
		if len(changes) == 0 {
			return nil
		}
		b := s.index.NewBatch()
		for _, n := range changes {
			if n.Deleted {
				b.Delete(n.Path)
			} else if e = b.Index(n.Path, map[string]string{"path": n.Path, "content": n.Content, "scope": scopeInSpace(n.Path, PathSpace(n.Path, catalog)), "space": PathSpace(n.Path, catalog).ID, "kind": kindFromPath(n.Path)}); e != nil {
				return e
			}
		}
		if e = s.index.Batch(b); e != nil {
			return fmt.Errorf("search projection failed: %w", e)
		}
		s.sequence = next
	}
}
func (s *Search) Query(db *Store, q string) ([]Note, error) { return s.QueryInSpace(db, q, "", "") }
func (s *Search) QueryInSpace(db *Store, q, space, kind string) ([]Note, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if e := s.Refresh(db); e != nil {
		return nil, e
	}
	query := bleve.NewBooleanQuery()
	query.AddMust(bleve.NewMatchQuery(q))
	for field, value := range map[string]string{"space": space, "kind": kind} {
		if value != "" {
			term := bleve.NewTermQuery(value)
			term.SetField(field)
			query.AddMust(term)
		}
	}
	req := bleve.NewSearchRequestOptions(query, 100, 0, false)
	res, e := s.index.Search(req)
	if e != nil {
		return nil, e
	}
	out := []Note{}
	for _, h := range res.Hits {
		n, e := db.Get(h.ID)
		if e != nil {
			return nil, e
		}
		if !n.Deleted {
			out = append(out, n)
		}
	}
	return out, nil
}

func (s *Search) QueryScoped(db *Store, q string, scopes []string, limit int) ([]Note, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.Refresh(db); err != nil {
		return nil, err
	}
	textQuery := bleve.NewMatchQuery(q)
	query := bleve.NewBooleanQuery()
	query.AddMust(textQuery)
	scopeQuery := bleve.NewDisjunctionQuery()
	for _, scope := range scopes {
		term := bleve.NewTermQuery(scope)
		term.SetField("scope")
		scopeQuery.AddQuery(term)
	}
	query.AddMust(scopeQuery)
	result, err := s.index.Search(bleve.NewSearchRequestOptions(query, limit, 0, false))
	if err != nil {
		return nil, err
	}
	notes := []Note{}
	for _, hit := range result.Hits {
		note, err := db.Get(hit.ID)
		if err != nil {
			return nil, err
		}
		if !note.Deleted {
			notes = append(notes, note)
		}
	}
	return notes, nil
}
func scopeFromPath(path string) string {
	return scopeInSpace(path, PathSpace(path, SpaceCatalog(nil, nil)))
}
func spaceFromPath(path string) string { return PathSpace(path, SpaceCatalog(nil, nil)).ID }
func kindFromPath(path string) string {
	for _, part := range strings.Split(path, "/") {
		if part == "Agent Memory" {
			return "memory"
		}
	}
	return "notes"
}
