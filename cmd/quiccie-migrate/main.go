// quiccie-migrate merges an old vault into a stopped Quiccie database.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"quiccie/internal/store"
	"strings"
)

func main() {
	database := flag.String("db", "", "Stopped database or snapshot")
	vault := flag.String("vault", "", "Source vault")
	baseline := flag.String("baseline", "", "Original imported vault")
	apply := flag.Bool("apply", false, "Apply the merge; default is a plan")
	flag.Parse()
	if *database == "" || *vault == "" || *baseline == "" {
		log.Fatal("Supply db, vault, and baseline")
	}
	db, err := store.Open(*database)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	counts, err := merge(db, *vault, *baseline, *apply)
	if err != nil {
		log.Fatal(err)
	}
	json.NewEncoder(os.Stdout).Encode(counts)
}

func merge(db *store.Store, vault, baseline string, apply bool) (map[string]int, error) {
	counts := map[string]int{}
	err := filepath.WalkDir(vault, func(p string, d fs.DirEntry, e error) error {
		if e != nil {
			return e
		}
		rel, e := filepath.Rel(vault, p)
		if e != nil {
			return e
		}
		if rel == "." {
			return nil
		}
		if strings.HasPrefix(d.Name(), ".") {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlink refused: %s", rel)
		}
		if d.IsDir() {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if e = store.ValidPath(rel); e != nil {
			return e
		}
		data, e := os.ReadFile(p)
		if e != nil {
			return e
		}
		ext := strings.ToLower(filepath.Ext(rel))
		text := strings.Contains("|.md|.markdown|.txt|.canvas|.base|.json|.yaml|.yml|.csv|.tsv|.org|.rst|", "|"+ext+"|")
		old, e := db.Get(rel)
		var current []byte
		if text {
			current = []byte(old.Content)
		} else {
			current, e = db.Value("attachments", rel)
		}
		if e != nil && !errors.Is(e, store.ErrMissing) {
			return e
		}
		exists := e == nil
		if exists && store.Hash(current) == store.Hash(data) && !old.Deleted {
			counts["same"]++
			return nil
		}
		base, be := os.ReadFile(filepath.Join(baseline, filepath.FromSlash(rel)))
		if be != nil && !os.IsNotExist(be) {
			return be
		}
		if exists && be == nil && store.Hash(base) == store.Hash(data) {
			counts["kept_quiccie_edit"]++
			return nil
		}
		target := rel
		kind := "added"
		var expected *string
		if exists {
			if be == nil && store.Hash(current) == store.Hash(base) && !old.Deleted {
				kind = "updated"
				expected = &old.Checksum
			} else {
				kind = "conflict_retained"
				ext := filepath.Ext(rel)
				target = strings.TrimSuffix(rel, ext) + " (Notes migration " + store.Hash(data)[:12] + ")" + ext
				if text {
					prior, pe := db.Get(target)
					if pe == nil {
						if prior.Checksum != store.Hash(data) {
							return fmt.Errorf("conflict target differs: %s", target)
						}
						counts["conflict_already_retained"]++
						return nil
					}
				} else {
					prior, pe := db.Value("attachments", target)
					if pe == nil {
						if store.Hash(prior) != store.Hash(data) {
							return fmt.Errorf("conflict target differs: %s", target)
						}
						counts["conflict_already_retained"]++
						return nil
					}
				}
			}
		}
		counts[kind]++
		if apply {
			if text {
				_, e = db.Put(store.Write{Path: target, Content: string(data), Expected: expected})
			} else {
				e = db.Set("attachments", target, data)
			}
			return e
		}
		return nil
	})
	return counts, err
}
