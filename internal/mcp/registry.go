package mcp

import (
	"encoding/json"
	"errors"
	bolt "go.etcd.io/bbolt"
	"net/url"
	"quiccie/internal/store"
	"regexp"
	"strings"
)

var scopePattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var scpPattern = regexp.MustCompile(`^(?:[^/@:]+@)?([^/:]+):(.+)$`)
var slugPattern = regexp.MustCompile(`[^a-z0-9]+`)

func spelling(p string) (string, error) {
	p = strings.ToLower(strings.TrimSpace(p))
	if len(p) > 120 || !scopePattern.MatchString(p) {
		return "", errors.New("Use a canonical project ID or known alias, not a directory or machine path.")
	}
	return p, nil
}
func RepositoryIdentity(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 512 || strings.ContainsAny(value, " \t\r\n") {
		return "", errors.New("Supply a remote repository URL, not a machine path.")
	}
	if !strings.Contains(value, "://") {
		if m := scpPattern.FindStringSubmatch(value); m != nil {
			value = "ssh://" + m[1] + "/" + m[2]
		} else if strings.Contains(strings.Split(value, "/")[0], ".") && strings.Count(value, "/") >= 2 {
			value = "https://" + value
		} else {
			return "", errors.New("Supply an SSH or HTTPS repository identity, not a local path.")
		}
	}
	u, e := url.Parse(value)
	if e != nil {
		return "", errors.New("Invalid repository identity; credentials, query strings and fragments are not accepted.")
	}
	defaults := map[string]string{"ssh": "22", "git+ssh": "22", "https": "443", "http": "80", "git": "9418"}
	pass := false
	if u.User != nil {
		_, pass = u.User.Password()
	}
	if defaults[u.Scheme] == "" || u.Hostname() == "" || pass || u.RawQuery != "" || u.Fragment != "" {
		return "", errors.New("Invalid repository identity; credentials, query strings and fragments are not accepted.")
	}
	host := strings.ToLower(u.Hostname())
	if u.Port() != "" && u.Port() != defaults[u.Scheme] {
		host += ":" + u.Port()
	}
	p := strings.Trim(u.Path, "/")
	p = strings.TrimSuffix(p, ".git")
	parts := strings.Split(p, "/")
	if len(parts) < 2 {
		return "", errors.New("Repository identities need a host, owner and repository.")
	}
	for _, part := range parts {
		if part == "" || part == "." || part == ".." || strings.ContainsAny(part, "\\:") {
			return "", errors.New("Repository identities need a host, owner and repository.")
		}
	}
	if host == "github.com" || host == "gitlab.com" || host == "bitbucket.org" {
		p = strings.ToLower(p)
	}
	return host + "/" + p, nil
}
func (s *Service) ResolveRegistry(a map[string]any) (Registry, string, error) {
	var r Registry
	selected := ""
	e := s.DB.DB.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("settings"))
		if e := json.Unmarshal(b.Get([]byte("registry")), &r); e != nil {
			return e
		}
		if err := r.Validate(); err != nil {
			return err
		}
		space := str(a, "space")
		if space != "" && !r.HasSpace(space) {
			return errors.New("Choose a registered space. Use spaces_list to find its ID.")
		}
		identity := ""
		var e error
		if v := str(a, "repository"); v != "" {
			identity, e = RepositoryIdentity(v)
			if e != nil {
				return e
			}
		}
		p := str(a, "project")
		if p == "" && identity == "" {
			return nil
		}
		matches := []string{}
		for k, record := range r.Projects {
			for _, repo := range record.Repositories {
				if identity != "" && repo == identity {
					matches = append(matches, k)
				}
			}
		}
		if len(matches) > 1 {
			return errors.New("Ambiguous repository registry; an administrator must resolve it.")
		}
		if p != "" {
			if _, e = spelling(p); e != nil {
				return e
			}
			selected, e = r.Canonical(p)
			if e != nil && identity == "" {
				return e
			}
		}
		if len(matches) == 1 {
			if selected != "" && selected != matches[0] {
				return errors.New("Project and repository identify different scopes.")
			}
			if space != "" && r.Space(matches[0]) != space {
				return errors.New("This repository belongs to another memory space. An administrator must move it.")
			}
			selected = matches[0]
			return nil
		}
		if selected == "" {
			if identity == "" {
				return errors.New("A new scope requires a remote repository identity.")
			}
			slug := strings.Trim(slugPattern.ReplaceAllString(strings.ToLower(identity[strings.LastIndex(identity, "/")+1:]), "-"), "-")
			if len(slug) > 40 {
				slug = slug[:40]
			}
			if slug == "" {
				slug = "project"
			}
			selected = slug + "-" + store.Hash([]byte(identity))
			if space == "" {
				return errors.New("Choose a registered space before creating a project. Use spaces_list to find its ID.")
			}

			r.Projects[selected] = Project{Aliases: []string{selected}, Repositories: []string{identity}, Space: space}
		} else {
			if space != "" && r.Space(selected) != space {
				return errors.New("This project belongs to another memory space. An administrator must move it.")
			}
			if identity != "" {
				if selected == r.Shared(r.Space(selected)) {
					return errors.New("A repository cannot be bound to shared memory.")
				}
				record := r.Projects[selected]
				record.Repositories = append(record.Repositories, identity)
				r.Projects[selected] = record
			}
		}
		data, e := json.Marshal(r)
		if e != nil {
			return e
		}
		return b.Put([]byte("registry"), data)
	})
	return r, selected, e
}
