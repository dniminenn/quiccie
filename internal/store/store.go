package store

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	bolt "go.etcd.io/bbolt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

var ErrMissing = errors.New("note not found")
var ErrConflict = errors.New("revision conflict: read the current note before changing it")
var ErrOperation = errors.New("operation ID was already used for a different request")

const MaxText = 2 * 1024 * 1024

type Note struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	Checksum string `json:"checksum"`
	Sequence uint64 `json:"sequence"`
	Updated  string `json:"updated"`
	Deleted  bool   `json:"deleted"`
}
type Write struct {
	Path      string  `json:"path"`
	Content   string  `json:"content"`
	Expected  *string `json:"expected_checksum"`
	Operation string  `json:"operation_id"`
	Deleted   bool    `json:"deleted"`
}
type Receipt struct {
	Fingerprint string `json:"fingerprint"`
	Note        Note   `json:"note"`
}
type Store struct {
	DB *bolt.DB
	mu sync.Mutex
}

var buckets = []string{"notes", "revisions", "changes", "operations", "settings", "sessions", "attachments", "devices"}

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	db, err := bolt.Open(path, 0600, &bolt.Options{Timeout: time.Second})
	if err != nil {
		return nil, err
	}
	err = db.Update(func(tx *bolt.Tx) error {
		for _, b := range buckets {
			if _, e := tx.CreateBucketIfNotExists([]byte(b)); e != nil {
				return e
			}
		}
		return nil
	})
	if err != nil {
		db.Close()
		return nil, err
	}
	return &Store{DB: db}, nil
}
func (s *Store) Close() error { return s.DB.Close() }
func Hash(b []byte) string    { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func ValidPath(p string) error {
	if p == "" || len(p) > 1024 || !utf8.ValidString(p) {
		return errors.New("supply a vault-relative path")
	}
	for _, part := range strings.Split(p, "/") {
		if part == "" || strings.HasPrefix(part, ".") || strings.ContainsAny(part, "\\:\x00") {
			return errors.New("absolute, hidden and parent-traversal paths are not available")
		}
	}
	return nil
}
func decode(b []byte) (Note, error) {
	var n Note
	if b == nil {
		return n, ErrMissing
	}
	e := json.Unmarshal(b, &n)
	return n, e
}
func key(n uint64) []byte { b := make([]byte, 8); binary.BigEndian.PutUint64(b, n); return b }
func (s *Store) Get(path string) (Note, error) {
	var n Note
	e := s.DB.View(func(tx *bolt.Tx) error {
		var e error
		n, e = decode(tx.Bucket([]byte("notes")).Get([]byte(path)))
		return e
	})
	return n, e
}
func (s *Store) Put(w Write) (Note, error) {
	if e := ValidPath(w.Path); e != nil {
		return Note{}, e
	}
	if !utf8.ValidString(w.Content) || strings.ContainsRune(w.Content, 0) || len(w.Content) > MaxText {
		return Note{}, errors.New("write UTF-8 text of at most 2 MiB without NUL bytes")
	}
	if len(w.Operation) > 200 {
		return Note{}, errors.New("operation ID too long")
	}
	raw, _ := json.Marshal(w)
	fingerprint := Hash(raw)
	var result Note
	err := s.DB.Update(func(tx *bolt.Tx) error {
		operations := tx.Bucket([]byte("operations"))
		if w.Operation != "" {
			if b := operations.Get([]byte(w.Operation)); b != nil {
				var r Receipt
				if e := json.Unmarshal(b, &r); e != nil {
					return e
				}
				if r.Fingerprint != fingerprint {
					return ErrOperation
				}
				result = r.Note
				return nil
			}
		}
		notes := tx.Bucket([]byte("notes"))
		old, e := decode(notes.Get([]byte(w.Path)))
		if e != nil && !errors.Is(e, ErrMissing) {
			return e
		}
		if e == nil {
			if w.Expected == nil || *w.Expected != old.Checksum {
				return ErrConflict
			}
		} else if w.Expected != nil || w.Deleted {
			return ErrConflict
		}
		changes := tx.Bucket([]byte("changes"))
		seq, e := changes.NextSequence()
		if e != nil {
			return e
		}
		result = Note{Path: w.Path, Content: w.Content, Checksum: Hash([]byte(w.Content)), Sequence: seq, Updated: time.Now().UTC().Format(time.RFC3339Nano), Deleted: w.Deleted}
		if w.Deleted {
			result.Checksum = Hash([]byte(fmt.Sprintf("deleted:%s:%d", w.Path, seq)))
		}
		data, e := json.Marshal(result)
		if e != nil {
			return e
		}
		if e = notes.Put([]byte(w.Path), data); e != nil {
			return e
		}
		if e = tx.Bucket([]byte("revisions")).Put(append(append([]byte(w.Path), 0), key(seq)...), data); e != nil {
			return e
		}
		if e = changes.Put(key(seq), data); e != nil {
			return e
		}
		if w.Operation != "" {
			r, _ := json.Marshal(Receipt{fingerprint, result})
			if e = operations.Put([]byte(w.Operation), r); e != nil {
				return e
			}
		}
		return nil
	})
	return result, err
}
func (s *Store) List() ([]Note, error) {
	out := []Note{}
	err := s.DB.View(func(tx *bolt.Tx) error {
		return tx.Bucket([]byte("notes")).ForEach(func(k, v []byte) error {
			n, e := decode(v)
			if e != nil {
				return e
			}
			if !n.Deleted {
				out = append(out, n)
			}
			return nil
		})
	})
	return out, err
}
func (s *Store) Changes(after uint64, limit int) ([]Note, uint64, error) {
	out := []Note{}
	next := after
	if after == ^uint64(0) {
		return out, next, nil
	}
	err := s.DB.View(func(tx *bolt.Tx) error {
		c := tx.Bucket([]byte("changes")).Cursor()
		for k, v := c.Seek(key(after + 1)); k != nil && len(out) < limit; k, v = c.Next() {
			n, e := decode(v)
			if e != nil {
				return e
			}
			out = append(out, n)
			next = n.Sequence
		}
		return nil
	})
	return out, next, err
}
func (s *Store) History(path string) ([]Note, error) {
	out := []Note{}
	prefix := string(append([]byte(path), 0))
	err := s.DB.View(func(tx *bolt.Tx) error {
		c := tx.Bucket([]byte("revisions")).Cursor()
		for k, v := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, v = c.Next() {
			n, e := decode(v)
			if e != nil {
				return e
			}
			out = append(out, n)
		}
		return nil
	})
	return out, err
}
func (s *Store) Set(bucket, name string, value []byte) error {
	return s.DB.Update(func(tx *bolt.Tx) error { return tx.Bucket([]byte(bucket)).Put([]byte(name), value) })
}
func (s *Store) Value(bucket, name string) ([]byte, error) {
	var out []byte
	e := s.DB.View(func(tx *bolt.Tx) error {
		v := tx.Bucket([]byte(bucket)).Get([]byte(name))
		if v == nil {
			return ErrMissing
		}
		out = append([]byte(nil), v...)
		return nil
	})
	return out, e
}
func (s *Store) Delete(bucket, name string) error {
	return s.DB.Update(func(tx *bolt.Tx) error { return tx.Bucket([]byte(bucket)).Delete([]byte(name)) })
}
func (s *Store) Backup(w io.Writer) error {
	return s.DB.View(func(tx *bolt.Tx) error { _, e := tx.WriteTo(w); return e })
}

func (s *Store) PutAttachment(path string, data []byte) error {
	if err := ValidPath(path); err != nil {
		return err
	}
	if len(data) > 20*1024*1024 {
		return errors.New("attachment exceeds 20 MiB")
	}
	return s.DB.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("attachments"))
		if old := b.Get([]byte(path)); old != nil {
			if Hash(old) == Hash(data) {
				return nil
			}
			return ErrConflict
		}
		return b.Put([]byte(path), data)
	})
}
func (s *Store) Attachments() ([]map[string]any, error) {
	out := []map[string]any{}
	err := s.DB.View(func(tx *bolt.Tx) error {
		return tx.Bucket([]byte("attachments")).ForEach(func(k, v []byte) error {
			out = append(out, map[string]any{"path": string(k), "checksum": Hash(v), "bytes": len(v)})
			return nil
		})
	})
	return out, err
}
