package mcp

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"
)

// Keep the captured seven-tool contract unchanged. Add the new read-only tool.
func init() {
	var c map[string]any
	if err := json.Unmarshal(Contract, &c); err != nil {
		panic(err)
	}
	result := c["tools"].(map[string]any)["result"].(map[string]any)
	result["tools"] = append(result["tools"].([]any), map[string]any{
		"name":        "memory_search_space",
		"description": "Search agent memory across all registered projects and shared memory in one explicit space. Use spaces_list to discover spaces. Choose from conversation or repository context; ask if unclear. Never widen to the other space after no results. Each hit includes its space and canonical project for memory_read. Use memory_search when the project is known. This does not search ordinary notes or change the scope for later calls.",
		"inputSchema": map[string]any{"type": "object", "additionalProperties": false, "properties": map[string]any{
			"space": map[string]any{"type": "string"},
			"query": map[string]any{"type": "string"},
			"limit": map[string]any{"type": "integer", "default": 5, "minimum": 1, "maximum": 10},
		}, "required": []string{"space", "query"}},
		"annotations": map[string]any{"readOnlyHint": true, "destructiveHint": false, "openWorldHint": false},
	})

	result["tools"] = append(result["tools"].([]any), map[string]any{
		"name": "spaces_list", "description": "List registered spaces and their shared memory scopes. Choose from explicit user or repository context. Ask if unclear.",
		"inputSchema": map[string]any{"type": "object", "properties": map[string]any{}, "additionalProperties": false},
		"annotations": map[string]any{"readOnlyHint": true, "destructiveHint": false},
	}, map[string]any{
		"name": "notes_search_space", "description": "Search ordinary notes in one registered space. Excludes agent memory. Use spaces_list to find the space ID. Returned paths are vault-relative for notes_read.",
		"inputSchema": map[string]any{"type": "object", "additionalProperties": false, "properties": map[string]any{"space": map[string]any{"type": "string"}, "query": map[string]any{"type": "string"}, "limit": map[string]any{"type": "integer", "default": 5, "minimum": 1, "maximum": 10}}, "required": []string{"space", "query"}},
		"annotations": map[string]any{"readOnlyHint": true, "destructiveHint": false},
	})
	var err error
	Contract, err = json.Marshal(c)
	if err != nil {
		panic(err)
	}
}

func (s *Service) SearchSpace(r Registry, space, query string, limit int) (Result, error) {
	if !r.HasSpace(space) {
		return nil, errors.New("Choose one registered space. Use spaces_list to find its ID.")
	}
	query = strings.TrimSpace(query)
	if query == "" || len(query) > 512 || strings.ContainsRune(query, 0) {
		return nil, errors.New("Use a nonempty query of at most 512 UTF-8 bytes.")
	}
	if limit < 1 || limit > 10 {
		return nil, errors.New("Budget must be between 1 and 10.")
	}
	scopes := []string{}
	for project := range r.Projects {
		if r.Space(project) == space {
			scopes = append(scopes, project)
		}
	}
	sort.Strings(scopes)
	if len(scopes) == 0 {
		return Result{"space": space, "results": []Result{}, "search_scopes": scopes}, nil
	}
	result, err := s.findScopes(r, scopes, query, limit, false)
	if err != nil {
		return nil, err
	}
	result["space"] = space
	for _, hit := range result["results"].([]Result) {
		hit["space"] = space
	}
	return result, nil
}
