package mcp

import (
	"encoding/json"
	"errors"
	bolt "go.etcd.io/bbolt"
	"quiccie/internal/store"
	"strings"
	"unicode/utf8"
)

type SpaceInfo = store.SpaceInfo

func (r Registry) SpaceList() []SpaceInfo { return store.SpaceCatalog(r.Catalog, r.Spaces) }
func (r Registry) HasSpace(id string) bool {
	for _, s := range r.SpaceList() {
		if s.ID == id {
			return true
		}
	}
	return false
}
func (r Registry) SpacePrefix(id string) string {
	for _, s := range r.SpaceList() {
		if s.ID == id {
			return s.Prefix
		}
	}
	return ""
}
func (r Registry) Shared(id string) string {
	for _, s := range r.SpaceList() {
		if s.ID == id {
			return s.Shared
		}
	}
	return ""
}
func (r Registry) PathSpace(path string) string { return store.PathSpace(path, r.SpaceList()).ID }
func (r Registry) Validate() error {
	ids, prefixes, shared := map[string]bool{}, map[string]bool{}, map[string]bool{}
	for _, s := range r.SpaceList() {
		if !scopePattern.MatchString(s.ID) || !scopePattern.MatchString(s.Shared) || s.Name == "" || ids[s.ID] || prefixes[s.Prefix] || shared[s.Shared] {
			return errors.New("Invalid or duplicate space catalog entry")
		}
		if s.Prefix != "" {
			if !strings.HasSuffix(s.Prefix, "/") {
				return errors.New("Space prefixes must end with a slash")
			}
			if err := store.ValidPath(s.Prefix + "note.md"); err != nil {
				return err
			}
		}
		ids[s.ID] = true
		prefixes[s.Prefix] = true
		shared[s.Shared] = true
	}
	if !ids["personal"] || r.SpacePrefix("personal") != "" || r.Shared("personal") != "global" {
		return errors.New("The personal space must use the empty prefix and global shared project")
	}
	for id := range r.Projects {
		if !r.HasSpace(r.Space(id)) {
			return errors.New("A project uses an unknown space. Add its space_catalog entry before use")
		}
		for _, s := range r.SpaceList() {
			if id == s.Shared && r.Space(id) != s.ID {
				return errors.New("Shared project belongs to another space")
			}
		}
	}
	return nil
}
func (s *Service) CreateSpace(id, name string) (SpaceInfo, error) {
	id = strings.TrimSpace(id)
	name = strings.TrimSpace(name)
	if len(id) > 48 || !scopePattern.MatchString(id) || id == "personal" || id == "work" || id == "global" {
		return SpaceInfo{}, errors.New("Use a new space ID with lowercase letters, digits, and hyphens")
	}
	if name == "" || len(name) > 80 || !utf8.ValidString(name) || strings.ContainsAny(name, "\r\n\t\x00") {
		return SpaceInfo{}, errors.New("Use a space name of 1 to 80 UTF-8 bytes")
	}
	info := SpaceInfo{id, name, "Spaces/" + id + "/", "space-" + id}
	err := s.DB.DB.Update(func(tx *bolt.Tx) error {
		settings := tx.Bucket([]byte("settings"))
		var r Registry
		if e := json.Unmarshal(settings.Get([]byte("registry")), &r); e != nil {
			return e
		}
		if err := r.Validate(); err != nil {
			return err
		}
		if r.HasSpace(id) {
			if r.Spaces[id] == name {
				return nil
			}
			return errors.New("This space ID already exists")
		}
		for _, sp := range r.SpaceList() {
			if strings.EqualFold(sp.Name, name) {
				return errors.New("This space name already exists")
			}
		}
		for key, p := range r.Projects {
			if key == info.Shared {
				return errors.New("This space ID conflicts with a project")
			}
			for _, a := range p.Aliases {
				if a == info.Shared {
					return errors.New("This space ID conflicts with a project alias")
				}
			}
		}
		for _, bucket := range []string{"notes", "attachments"} {
			k, _ := tx.Bucket([]byte(bucket)).Cursor().Seek([]byte(info.Prefix))
			if k != nil && strings.HasPrefix(string(k), info.Prefix) {
				return errors.New("This space folder already has data. Choose another ID")
			}
		}
		if r.Spaces == nil {
			r.Spaces = map[string]string{}
		}
		r.Spaces[id] = name
		r.Projects[info.Shared] = Project{Aliases: []string{info.Shared}, Repositories: []string{}, Space: id}
		b, e := json.Marshal(r)
		if e != nil {
			return e
		}
		return settings.Put([]byte("registry"), b)
	})
	return info, err
}
