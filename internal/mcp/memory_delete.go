package mcp

import (
	"encoding/json"
	"errors"

	"quiccie/internal/store"
)

// memory_delete leaves a tombstone: the revisions stay in the history.
func init() {
	var c map[string]any
	if err := json.Unmarshal(Contract, &c); err != nil {
		panic(err)
	}
	result := c["tools"].(map[string]any)["result"].(map[string]any)
	result["tools"] = append(result["tools"].([]any), map[string]any{
		"name":        "memory_delete",
		"title":       "Memory Delete",
		"description": "Delete one agent memory note. Requires the checksum from the latest memory_read. Prior revisions stay in the history. Ordinary notes cannot be deleted with this tool.",
		"inputSchema": map[string]any{"type": "object", "additionalProperties": false, "properties": map[string]any{
			"project":           map[string]any{"type": "string"},
			"path":              map[string]any{"type": "string"},
			"expected_checksum": map[string]any{"type": "string"},
		}, "required": []string{"project", "path", "expected_checksum"}},
		"annotations": map[string]any{"readOnlyHint": false, "destructiveHint": true, "openWorldHint": false},
	})
	var err error
	Contract, err = json.Marshal(c)
	if err != nil {
		panic(err)
	}
}

func (s *Service) memoryDelete(selected, full, p string, expected *string) (Result, error) {
	if expected == nil {
		return nil, errors.New("Deletion requires the checksum from the latest memory_read.")
	}
	old, err := s.DB.Get(full)
	if err != nil || old.Deleted {
		return nil, errors.New("The requested note is unavailable. No outside path was accessed.")
	}
	if *expected != old.Checksum {
		return nil, errors.New("Revision conflict. Read the current memory before deleting it.")
	}
	if _, err := s.DB.Put(store.Write{Path: full, Expected: expected, Deleted: true}); err != nil {
		return nil, err
	}
	return Result{"path": p, "project": selected, "action": "deleted"}, nil
}
