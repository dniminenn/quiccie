package store

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestDurableCASAndRetry(t *testing.T) {
	path := filepath.Join(t.TempDir(), "db")
	s, e := Open(path)
	if e != nil {
		t.Fatal(e)
	}
	w := Write{Path: "A.md", Content: "first 🦊", Operation: "a"}
	n, e := s.Put(w)
	if e != nil {
		t.Fatal(e)
	}
	again, e := s.Put(w)
	if e != nil || again.Sequence != n.Sequence {
		t.Fatal(again, e)
	}
	w.Content = "different"
	if _, e = s.Put(w); !errors.Is(e, ErrOperation) {
		t.Fatal(e)
	}
	var wg sync.WaitGroup
	success := make(chan Note, 2)
	for _, text := range []string{"second", "third"} {
		wg.Add(1)
		go func(text string) {
			defer wg.Done()
			v, e := s.Put(Write{Path: n.Path, Content: text, Expected: &n.Checksum})
			if e == nil {
				success <- v
			} else if !errors.Is(e, ErrConflict) {
				t.Error(e)
			}
		}(text)
	}
	wg.Wait()
	close(success)
	if len(success) != 1 {
		t.Fatal("CAS lost update")
	}
	latest := <-success
	f, e := os.Create(filepath.Join(t.TempDir(), "backup"))
	if e != nil {
		t.Fatal(e)
	}
	if e = s.Backup(f); e != nil {
		t.Fatal(e)
	}
	f.Close()
	s.Close()
	s, e = Open(path)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	got, e := s.Get(n.Path)
	if e != nil || got.Checksum != latest.Checksum {
		t.Fatal(got, e)
	}
	h, e := s.History(n.Path)
	if e != nil || len(h) != 2 {
		t.Fatal(h, e)
	}
	restored, e := Open(f.Name())
	if e != nil {
		t.Fatal(e)
	}
	defer restored.Close()
	got, e = restored.Get(n.Path)
	if e != nil || got.Checksum != latest.Checksum {
		t.Fatal(got, e)
	}
}
func TestTraversal(t *testing.T) {
	for _, p := range []string{"../x", "/a", "a//b", "a/.hidden", "a\\b", "a:b", "a/../b"} {
		if ValidPath(p) == nil {
			t.Fatal(p)
		}
	}
}

func TestChangeCursorDoesNotWrap(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Put(Write{Path: "A.md", Content: "a"}); err != nil {
		t.Fatal(err)
	}
	changes, next, err := db.Changes(^uint64(0), 20)
	if err != nil || len(changes) != 0 || next != ^uint64(0) {
		t.Fatal("cursor wrapped", changes, next, err)
	}
}
