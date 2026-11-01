package main

import (
	"os"
	"path/filepath"
	"quiccie/internal/store"
	"testing"
)

func TestMerge(t *testing.T) {
	root := t.TempDir()
	src := filepath.Join(root, "src")
	base := filepath.Join(root, "base")
	os.Mkdir(src, 0700)
	os.Mkdir(base, 0700)
	db, e := store.Open(filepath.Join(root, "db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	fixtures := []struct{ path, base, source, current string }{
		{"same.md", "base", "base", "base"}, {"old-edit.md", "base", "source", "base"},
		{"new-edit.md", "base", "base", "current"}, {"both.md", "base", "source", "current"},
		{"added.md", "", "source", ""}, {"asset.png", "base", "source", "current"},
	}
	for _, f := range fixtures {
		if f.base != "" {
			os.WriteFile(filepath.Join(base, f.path), []byte(f.base), 0600)
		}
		os.WriteFile(filepath.Join(src, f.path), []byte(f.source), 0600)
		if f.current != "" {
			if filepath.Ext(f.path) == ".png" {
				db.Set("attachments", f.path, []byte(f.current))
			} else {
				db.Put(store.Write{Path: f.path, Content: f.current})
			}
		}
	}
	plan, e := merge(db, src, base, false)
	if e != nil {
		t.Fatal(e)
	}
	if plan["conflict_retained"] != 2 || plan["added"] != 1 || plan["updated"] != 1 || plan["kept_quiccie_edit"] != 1 {
		t.Fatal(plan)
	}
	n, _ := db.Get("old-edit.md")
	if n.Content != "base" {
		t.Fatal("plan changed data")
	}
	_, e = merge(db, src, base, true)
	if e != nil {
		t.Fatal(e)
	}
	for p, want := range map[string]string{"old-edit.md": "source", "new-edit.md": "current", "both.md": "current", "added.md": "source"} {
		n, e = db.Get(p)
		if e != nil || n.Content != want {
			t.Fatalf("%s: %v", p, e)
		}
	}
	notes, _ := db.List()
	if len(notes) != 6 {
		t.Fatal(len(notes))
	}
	assets, _ := db.Attachments()
	if len(assets) != 2 {
		t.Fatal(assets)
	}
	again, e := merge(db, src, base, true)
	if e != nil || again["conflict_already_retained"] != 2 {
		t.Fatal(again, e)
	}
}
