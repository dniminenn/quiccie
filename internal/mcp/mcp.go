package mcp

import (
	"bufio"
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"path"
	"quiccie/internal/store"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

//go:embed legacy-mcp.json
var Contract []byte

type Project struct {
	Aliases      []string `json:"aliases"`
	Repositories []string `json:"repositories"`
	Space        string   `json:"space,omitempty"`
}
type Registry struct {
	Catalog  []SpaceInfo        `json:"space_catalog,omitempty"`
	Version  int                `json:"version"`
	Spaces   map[string]string  `json:"spaces,omitempty"`
	Projects map[string]Project `json:"projects"`
}
type Service struct {
	DB     *store.Store
	Search *store.Search
}
type Request struct {
	Version string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}
type Result map[string]any

func (s *Service) Registry() (Registry, error) {
	b, e := s.DB.Value("settings", "registry")
	var r Registry
	if e != nil {
		return r, e
	}
	e = json.Unmarshal(b, &r)
	if e == nil {
		e = r.Validate()
	}
	return r, e
}
func (r Registry) Canonical(p string) (string, error) {
	var e error
	p, e = spelling(p)
	if e != nil {
		return "", e
	}
	selected := ""
	for k, v := range r.Projects {
		match := p == k
		for _, alias := range v.Aliases {
			if p == alias {
				match = true
			}
		}
		if match {
			if selected != "" && selected != k {
				return "", errors.New("Ambiguous scope. Use a canonical project ID.")
			}
			selected = k
		}
	}
	if selected != "" {
		return selected, nil
	}

	return "", errors.New("Unknown or ambiguous scope. Use memory_scope with an explicit project or repository.")
}
func (r Registry) Space(p string) string {
	if space := r.Projects[p].Space; space != "" {
		return space
	}
	return "personal"
}
func (r Registry) Root(p string) string {
	space := r.Space(p)
	base := r.SpacePrefix(space) + "Agent Memory/"
	if p == r.Shared(space) {
		return base + "global"
	}
	return base + "projects/" + p
}

func (r Registry) Scopes(p string) []string {
	shared := r.Shared(r.Space(p))
	if p == shared {
		return []string{shared}
	}
	return []string{shared, p}
}

var blocked = map[string]bool{"config.json": true, "config.yaml": true, "config.yml": true, "settings.json": true, "credentials.json": true, "credentials.yaml": true, "credentials.yml": true, "secrets.json": true, "secrets.yaml": true, "secrets.yml": true, "setup-uri.txt": true, "desktop.ini": true}
var blockedParts = map[string]bool{"agent memory": true, "config": true, "configuration": true, "node_modules": true, "desktop": true, "couchdb": true}

func Validate(p string, ordinary bool) error {
	if e := store.ValidPath(p); e != nil {
		return errors.New("Absolute, hidden, URI and parent-traversal paths are not available.")
	}
	for _, part := range strings.Split(p, "/") {
		part = strings.ToLower(part)
		if blocked[part] {
			return errors.New("Configuration and credential files are not available.")
		}
		if ordinary && blockedParts[part] {
			return errors.New("Configuration and Agent Memory are not ordinary notes.")
		}
	}
	ext := strings.ToLower(path.Ext(p))
	valid := ext == ".md"
	if ordinary {
		valid = strings.Contains("|.md|.markdown|.mdown|.txt|.canvas|.base|.json|.yaml|.yml|.csv|.tsv|.org|.rst|", "|"+ext+"|")
	}
	if !valid {
		return errors.New("Use a supported textual note format; memory files must end in .md.")
	}
	return nil
}
func str(a map[string]any, k string) string { v, _ := a[k].(string); return v }
func number(a map[string]any, k string, d int) int {
	if v, ok := a[k].(float64); ok {
		return int(v)
	}
	return d
}
func Bound(text string, n int) string {
	if len(text) <= n {
		return text
	}
	b := text[:n]
	for !utf8.ValidString(b) {
		b = b[:len(b)-1]
	}
	return b
}

var checksumPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

func Page(text, checksum string, budget, offset int, expected *string) (Result, error) {
	if budget < 1 || budget > 4000 {
		return nil, errors.New("Budget must be between 1 and 4000.")
	}
	runes := []rune(text)
	if offset < 0 || offset > len(runes) {
		return nil, errors.New("Use the next_offset returned by the preceding read.")
	}
	if offset > 0 && expected == nil {
		return nil, errors.New("Continuation requires the checksum from the preceding read.")
	}
	if expected != nil && *expected != checksum {
		return nil, errors.New("Revision changed between reads. Restart from offset 0.")
	}
	rest := string(runes[offset:])
	content := Bound(rest, budget)
	cut := len(content) < len(rest)
	if cut && content == "" {
		return nil, errors.New("The next UTF-8 character needs a larger budget; use at least 4.")
	}
	var next any
	if cut {
		next = offset + utf8.RuneCountInString(content)
	}
	return Result{"checksum": checksum, "content": content, "truncated": cut, "offset": offset, "next_offset": next}, nil
}
func (s *Service) Call(name string, a map[string]any) (any, error) {
	var contract struct {
		Tools struct {
			Result struct {
				Tools []struct {
					Name  string         `json:"name"`
					Input map[string]any `json:"inputSchema"`
				}
			}
		}
	}
	json.Unmarshal(Contract, &contract)
	known := false
	for _, t := range contract.Tools.Result.Tools {
		if t.Name == name {
			known = true
			props, _ := t.Input["properties"].(map[string]any)
			for k, v := range a {
				p, ok := props[k]
				if !ok {
					return nil, fmt.Errorf("Unknown argument: %s", k)
				}
				spec := p.(map[string]any)
				if !validArgument(spec, v) {
					return nil, fmt.Errorf("Invalid argument type: %s", k)
				}
			}

			if req, ok := t.Input["required"].([]any); ok {
				for _, k := range req {
					if _, ok := a[k.(string)]; !ok {
						return nil, fmt.Errorf("Missing required argument: %s", k)
					}
				}
			}
		}
	}
	if !known {
		return nil, errors.New("Unknown tool")
	}
	r, e := s.Registry()
	if e != nil {
		return nil, e
	}
	if name == "spaces_list" {
		return Result{"spaces": r.SpaceList()}, nil
	}
	if name == "notes_search_space" {
		space := str(a, "space")
		q := strings.TrimSpace(str(a, "query"))
		limit := number(a, "limit", 5)
		if !r.HasSpace(space) || q == "" || len(q) > 512 || strings.ContainsRune(q, 0) || limit < 1 || limit > 10 {
			return nil, errors.New("Supply a registered space, a query of 1 to 512 bytes, and a limit of 1 to 10")
		}
		result, err := s.findScopes(r, []string{space}, q, limit, true)
		if err == nil {
			result["space"] = space
		}
		return result, err
	}
	if name == "memory_scope" {
		return s.Scope(r, a)
	}
	if name == "memory_search_space" {
		return s.SearchSpace(r, str(a, "space"), str(a, "query"), number(a, "limit", 5))
	}
	ordinary := strings.HasPrefix(name, "notes_")
	selected := ""
	prefix := ""
	if !ordinary {
		selected, e = r.Canonical(str(a, "project"))
		if e != nil {
			return nil, e
		}
		prefix = r.Root(selected) + "/"
	}
	var expected *string
	if v, ok := a["expected_checksum"]; ok && v != nil {
		x, ok := v.(string)
		if !ok || !checksumPattern.MatchString(x) {
			return nil, errors.New("expected_checksum must be the full checksum returned by the latest read.")
		}
		expected = &x
	}
	if strings.HasSuffix(name, "search") {
		q := strings.TrimSpace(str(a, "query"))
		limit := number(a, "limit", 5)
		if q == "" || len(q) > 512 || strings.ContainsRune(q, 0) {
			return nil, errors.New("Use a nonempty query of at most 512 UTF-8 bytes.")
		}
		if limit < 1 || limit > 10 {
			return nil, errors.New("Budget must be between 1 and 10.")
		}
		return s.Find(r, selected, q, limit, ordinary)
	}
	p := str(a, "path")
	if e = Validate(p, ordinary); e != nil {
		return nil, e
	}
	if strings.HasSuffix(name, "read") {
		n, e := s.DB.Get(prefix + p)
		if e != nil || n.Deleted {
			return nil, errors.New("The requested note is unavailable. No outside path was accessed.")
		}
		content := n.Content
		section := str(a, "section")
		if v, ok := a["section"]; ok && v != nil {
			if strings.TrimSpace(section) == "" || len(section) > 256 {
				return nil, errors.New("Use a nonempty heading selector of at most 256 bytes.")
			}
			content = Section(content, section)
		}
		result, e := Page(content, n.Checksum, number(a, "max_tokens", 1000), number(a, "offset", 0), expected)
		if e != nil {
			return nil, e
		}
		result["path"] = p
		if !ordinary {
			result["project"] = selected
			result["section"] = a["section"]
		}
		return result, nil
	}
	if name == "memory_delete" {
		return s.memoryDelete(selected, prefix+p, p, expected)
	}
	content := str(a, "content")
	old, oldErr := s.DB.Get(prefix + p)
	if oldErr == nil && !old.Deleted {
		if expected == nil {
			if ordinary {
				return nil, errors.New("An existing file requires the checksum from its latest read.")
			}
			return nil, errors.New("An existing note requires the checksum from its latest memory_read.")
		}
		if *expected != old.Checksum {
			if ordinary {
				return nil, errors.New("Revision conflict. Read the file again before changing it.")
			}
			return nil, errors.New("Revision conflict. Read the current memory before changing it.")
		}
	} else if expected != nil {
		return nil, errors.New("Revision conflict. The file no longer exists.")
	}
	if !ordinary {
		content, e = MemoryContent(selected, p, content, old.Content)
		if e != nil {
			return nil, e
		}
	}
	// A tombstone can be replaced only while its revision is still current.
	if oldErr == nil && old.Deleted {
		expected = &old.Checksum
	}
	n, e := s.DB.Put(store.Write{Path: prefix + p, Content: content, Expected: expected})
	if e != nil {
		return nil, e
	}
	action := "created"
	if oldErr == nil && !old.Deleted {
		action = "updated"
	}
	result := Result{"path": p, "checksum": n.Checksum, "action": action}
	if !ordinary {
		result["project"] = selected
	}
	return result, nil
}
func Section(content, section string) string {
	lines := strings.SplitAfter(content, "\n")
	start, level := -1, 0
	fence := byte(0)
	fenceLength := 0
	for i, line := range lines {
		trim := strings.TrimSpace(line)
		if len(trim) > 0 && (trim[0] == '`' || trim[0] == '~') {
			count := 0
			for count < len(trim) && trim[count] == trim[0] {
				count++
			}
			if count >= 3 {
				if fence == 0 {
					fence = trim[0]
					fenceLength = count
					continue
				}
				if fence == trim[0] && count >= fenceLength && strings.TrimSpace(trim[count:]) == "" {
					fence = 0
					continue
				}
			}
		}
		if fence != 0 || strings.HasPrefix(line, "    ") || strings.HasPrefix(line, "\t") {
			continue
		}
		l := len(trim) - len(strings.TrimLeft(trim, "#"))
		if l < 1 || l > 6 || (l < len(trim) && trim[l] != ' ' && trim[l] != '\t') {
			continue
		}
		heading := strings.TrimSpace(trim[l:])
		withoutHashes := strings.TrimRight(heading, "#")
		if withoutHashes != heading && (withoutHashes == "" || strings.HasSuffix(withoutHashes, " ") || strings.HasSuffix(withoutHashes, "\t")) {
			heading = strings.TrimSpace(withoutHashes)
		}
		if start < 0 && strings.EqualFold(heading, strings.TrimLeft(section, "# ")) {
			start = i
			level = l
		} else if start >= 0 && l <= level {
			return strings.Join(lines[start:i], "")
		}
	}
	if start >= 0 {
		return strings.Join(lines[start:], "")
	}
	return ""
}
func validArgument(spec map[string]any, v any) bool {
	if alternatives, ok := spec["anyOf"].([]any); ok {
		for _, alt := range alternatives {
			if validArgument(alt.(map[string]any), v) {
				return true
			}
		}
		return false
	}
	switch spec["type"] {
	case "null":
		return v == nil
	case "string":
		_, ok := v.(string)
		return ok
	case "integer":
		f, ok := v.(float64)
		return ok && !math.IsNaN(f) && !math.IsInf(f, 0) && f >= -9007199254740991 && f <= 9007199254740991 && math.Trunc(f) == f
	}
	return false
}
func (s *Service) Find(r Registry, selected, q string, limit int, ordinary bool) (Result, error) {
	if ordinary {
		return s.findScopes(r, nil, q, limit, true)
	}
	return s.findScopes(r, r.Scopes(selected), q, limit, ordinary)
}
func (s *Service) findScopes(r Registry, scopes []string, q string, limit int, ordinary bool) (Result, error) {
	notes, e := s.DB.List()
	if !ordinary && s.Search != nil {
		notes, e = s.Search.QueryScoped(s.DB, q, scopes, limit*3)
	}
	if e != nil {
		return nil, e
	}
	hits := []Result{}
	terms := strings.Fields(strings.ToLower(q))
	for _, n := range notes {
		p := n.Path
		scope := ""
		if ordinary {
			if len(scopes) > 0 && r.PathSpace(p) != scopes[0] {
				continue
			}
			if Validate(p, true) != nil {
				continue
			}
		} else {
			for _, candidate := range scopes {
				prefix := r.Root(candidate) + "/"
				if strings.HasPrefix(p, prefix) {
					p = strings.TrimPrefix(p, prefix)
					scope = candidate
					break
				}
			}
			if scope == "" || Validate(p, false) != nil {
				continue
			}
		}
		lower := strings.ToLower(p + "\n" + n.Content)
		matched := true
		for _, term := range terms {
			if !strings.Contains(lower, term) {
				matched = false
				break
			}
		}
		if !matched && (ordinary || s.Search == nil) {
			continue
		}
		content := strings.Join(strings.Fields(n.Content), " ")
		pos := strings.Index(strings.ToLower(content), terms[0])
		if pos > 80 {
			content = content[pos-80:]
		}
		hit := Result{"path": p, "snippet": Bound(content, 240)}
		if !ordinary {
			hit["project"] = scope
			hit["title"] = Bound(strings.TrimSuffix(path.Base(p), path.Ext(p)), 120)
		}
		hits = append(hits, hit)
	}
	if ordinary {
		sort.SliceStable(hits, func(i, j int) bool {
			rank := func(h Result) int {
				n := 0
				for _, t := range terms {
					if strings.Contains(strings.ToLower(h["path"].(string)), t) {
						n++
					}
				}
				return n
			}
			a, b := rank(hits[i]), rank(hits[j])
			if a != b {
				return a > b
			}
			return hits[i]["path"].(string) < hits[j]["path"].(string)
		})
	}
	if len(hits) > limit {
		hits = hits[:limit]
	}
	if ordinary {
		return Result{"results": hits, "scan_limited": false}, nil
	}
	return Result{"results": hits, "search_scopes": scopes}, nil
}
func (s *Service) Scope(r Registry, a map[string]any) (any, error) {
	p := str(a, "project")
	space := str(a, "space")
	if space != "" && !r.HasSpace(space) {
		return nil, errors.New("Choose a registered space. Use spaces_list to find its ID.")
	}
	resolved, selectedByRepo, resolveError := s.ResolveRegistry(a)
	if resolveError != nil {
		return nil, resolveError
	}
	r = resolved
	if selectedByRepo != "" {
		p = selectedByRepo
	}
	if p == "" {
		out := []Result{}
		keys := []string{}
		for k := range r.Projects {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			if space == "" || r.Space(k) == space {
				out = append(out, Result{"project": k, "space": r.Space(k), "aliases": r.Projects[k].Aliases})
			}
		}
		return Result{"projects": out}, nil
	}
	selected, e := r.Canonical(p)
	if e != nil {
		return nil, e
	}
	if space != "" && r.Space(selected) != space {
		return nil, errors.New("This project belongs to another memory space. An administrator must move it.")
	}
	guidance := "Focus on this project and its shared memory in space " + r.Space(selected) + ". Do not search another space without explicit context."

	return Result{"project": selected, "space": r.Space(selected), "search_scopes": r.Scopes(selected), "vault_folder": r.Root(selected), "guidance": guidance}, nil
}
func (s *Service) RPC(data []byte) []byte {
	var req Request
	if e := json.Unmarshal(data, &req); e != nil {
		return []byte(`{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}`)
	}
	var id any
	validID := len(req.ID) == 0
	if len(req.ID) > 0 && json.Unmarshal(req.ID, &id) == nil {
		switch id.(type) {
		case nil, string, float64:
			validID = true
		}
	}
	if req.Version != "2.0" || req.Method == "" || !validID {
		return []byte(`{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid Request"}}`)
	}
	if len(req.ID) == 0 {
		return nil
	}
	reply := Result{"jsonrpc": "2.0", "id": req.ID}
	var result any
	switch req.Method {
	case "initialize":
		var c map[string]map[string]any
		json.Unmarshal(Contract, &c)
		result = c["initialize"]["result"]
	case "tools/list":
		var c map[string]map[string]any
		json.Unmarshal(Contract, &c)
		result = c["tools"]["result"]
	case "resources/list":
		result = Result{"resources": []any{}}
	case "resources/templates/list":
		result = Result{"resourceTemplates": []any{}}
	case "prompts/list":
		result = Result{"prompts": []any{}}
	case "logging/setLevel", "ping":
		result = Result{}
	case "tools/call":
		var p struct {
			Name      string         `json:"name"`
			Arguments map[string]any `json:"arguments"`
		}
		if json.Unmarshal(req.Params, &p) != nil {
			reply["error"] = Result{"code": -32602, "message": "Invalid params"}
			break
		}
		v, e := s.Call(p.Name, p.Arguments)
		if e != nil {
			result = Result{"content": []Result{{"type": "text", "text": e.Error()}}, "isError": true}
		} else {
			b, _ := json.Marshal(v)
			result = Result{"content": []Result{{"type": "text", "text": string(b)}}, "structuredContent": v, "isError": false}
		}
	default:
		reply["error"] = Result{"code": -32601, "message": "Method not found"}
	}
	if result != nil {
		reply["result"] = result
	}
	b, _ := json.Marshal(reply)
	return b
}
func (s *Service) Stdio(in io.Reader, out io.Writer) error {
	scan := bufio.NewScanner(in)
	scan.Buffer(make([]byte, 4096), 8*1024*1024)
	for scan.Scan() {
		if b := s.RPC(scan.Bytes()); len(b) > 0 {
			if _, e := fmt.Fprintln(out, string(b)); e != nil {
				return e
			}
		}
	}
	return scan.Err()
}
func (s *Service) HTTP(w http.ResponseWriter, r *http.Request) {
	if origin := r.Header.Get("Origin"); origin != "" {
		http.Error(w, "Browser origins cannot use the private MCP service.", 403)
		return
	}
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		http.Error(w, "Use application/json.", 415)
		return
	}
	if r.Method != "POST" {
		w.WriteHeader(405)
		return
	}
	body, e := io.ReadAll(io.LimitReader(r.Body, 8*1024*1024+1))
	if e != nil || len(body) > 8*1024*1024 {
		http.Error(w, "request too large", 413)
		return
	}
	b := s.RPC(bytes.TrimSpace(body))
	if len(b) == 0 {
		w.WriteHeader(202)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}
