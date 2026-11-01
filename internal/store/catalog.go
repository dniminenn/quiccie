package store

import (
	"encoding/json"
	"sort"
	"strings"
)

type SpaceInfo struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Prefix string `json:"prefix"`
	Shared string `json:"shared_project"`
}

func SpaceCatalog(explicit []SpaceInfo, custom map[string]string) []SpaceInfo {
	out := append([]SpaceInfo{}, explicit...)
	if len(out) == 0 {
		out = []SpaceInfo{{"personal", "Personal", "", "global"}, {"work", "Work", "Work/", "work"}}
	}
	keys := []string{}
	for id := range custom {
		keys = append(keys, id)
	}
	sort.Strings(keys)
	for _, id := range keys {
		found := false
		for _, s := range out {
			if s.ID == id {
				found = true
			}
		}
		if !found {
			out = append(out, SpaceInfo{id, custom[id], "Spaces/" + id + "/", "space-" + id})
		}
	}
	return out
}
func PathSpace(path string, catalog []SpaceInfo) SpaceInfo {
	var best SpaceInfo
	for _, s := range catalog {
		if s.Prefix != "" && strings.HasPrefix(path, s.Prefix) && len(s.Prefix) > len(best.Prefix) {
			best = s
		}
	}
	if best.ID != "" {
		return best
	}
	if strings.HasPrefix(path, "Spaces/") {
		return SpaceInfo{}
	}
	for _, s := range catalog {
		if s.Prefix == "" {
			return s
		}
	}
	return SpaceInfo{}
}
func catalogFromRegistry(data []byte) ([]SpaceInfo, error) {
	var r struct {
		Spaces  map[string]string `json:"spaces"`
		Catalog []SpaceInfo       `json:"space_catalog"`
	}
	if len(data) > 0 {
		if err := json.Unmarshal(data, &r); err != nil {
			return nil, err
		}
	}
	return SpaceCatalog(r.Catalog, r.Spaces), nil
}
func scopeInSpace(path string, space SpaceInfo) string {
	if space.ID == "" {
		return ""
	}
	path = strings.TrimPrefix(path, space.Prefix)
	if strings.HasPrefix(path, "Agent Memory/global/") {
		return space.Shared
	}
	if strings.HasPrefix(path, "Agent Memory/projects/") {
		return strings.Split(strings.TrimPrefix(path, "Agent Memory/projects/"), "/")[0]
	}
	return ""
}
