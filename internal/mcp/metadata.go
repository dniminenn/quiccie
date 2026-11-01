package mcp

import (
	"bytes"
	"errors"
	"gopkg.in/yaml.v3"
	"path"
	"strings"
)

func parseMetadata(text string) (*yaml.Node, string, bool, error) {
	m := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
	if !strings.HasPrefix(text, "---\n") && !strings.HasPrefix(text, "---\r\n") {
		return m, text, false, nil
	}
	lines := strings.SplitAfter(text, "\n")
	end := -1
	for i := 1; i < len(lines); i++ {
		if strings.TrimSuffix(strings.TrimSuffix(lines[i], "\n"), "\r") == "---" {
			end = i
			break
		}
	}
	if end < 0 {
		return nil, "", true, errors.New("The memory frontmatter is not valid YAML.")
	}
	var document yaml.Node
	if e := yaml.Unmarshal([]byte(strings.Join(lines[1:end], "")), &document); e != nil {
		return nil, "", true, errors.New("The memory frontmatter is not valid YAML.")
	}
	if len(document.Content) > 0 {
		m = document.Content[0]
	}
	if m.Kind != yaml.MappingNode {
		return nil, "", true, errors.New("The memory frontmatter must be a YAML mapping.")
	}
	var decoded any
	if e := m.Decode(&decoded); e != nil {
		return nil, "", true, errors.New("The memory properties contain invalid or duplicate values.")
	}
	return m, strings.Join(lines[end+1:], ""), true, nil
}
func field(m *yaml.Node, key string) *yaml.Node {
	for i := 0; i < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			return m.Content[i+1]
		}
	}
	return nil
}
func setField(m *yaml.Node, key string, value *yaml.Node) {
	for i := 0; i < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			m.Content[i+1] = value
			return
		}
	}
	m.Content = append(m.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: key}, value)
}
func scalar(value string) *yaml.Node {
	return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: value}
}

// Copy aliases as values before merging separate documents. This prevents dangling
// aliases and anchor name collisions. Limit expansion before allocating a large tree.
func metadataValues(n *yaml.Node, active map[*yaml.Node]bool, budget *int) (*yaml.Node, error) {
	*budget--
	if *budget < 0 || active[n] {
		return nil, errors.New("The memory properties contain too many aliases or a cycle.")
	}
	active[n] = true
	defer delete(active, n)
	if n.Kind == yaml.AliasNode {
		return metadataValues(n.Alias, active, budget)
	}
	copy := *n
	copy.Anchor = ""
	copy.Content = nil
	for _, child := range n.Content {
		value, err := metadataValues(child, active, budget)
		if err != nil {
			return nil, err
		}
		copy.Content = append(copy.Content, value)
	}
	return &copy, nil
}
func MemoryContent(project, p, content, old string) (string, error) {
	input, body, hasFront, e := parseMetadata(content)
	if e != nil {
		return "", e
	}
	previous, _, _, e := parseMetadata(old)
	if e != nil {
		return "", errors.New("The existing memory properties are invalid. Repair the source before updating this memory.")
	}
	budget := 100000
	input, e = metadataValues(input, map[*yaml.Node]bool{}, &budget)
	if e != nil {
		return "", e
	}
	previous, e = metadataValues(previous, map[*yaml.Node]bool{}, &budget)
	if e != nil {
		return "", e
	}
	result := previous
	for i := 0; i < len(input.Content); i += 2 {
		key := input.Content[i]
		if key.Kind != yaml.ScalarNode || key.Tag != "!!str" {
			return "", errors.New("Property names must be text.")
		}
		setField(result, key.Value, input.Content[i+1])
	}
	defaults := []struct{ key, value string }{
		{"title", strings.TrimSuffix(path.Base(p), path.Ext(p))},
		{"type", "note"},
		{"permalink", project + "/" + strings.ReplaceAll(strings.ToLower(strings.TrimSuffix(p, path.Ext(p))), " ", "-")},
	}
	for _, item := range defaults {
		v := field(result, item.key)
		if v == nil {
			setField(result, item.key, scalar(item.value))
			continue
		}
		if v.Kind != yaml.ScalarNode || v.Tag != "!!str" || strings.TrimSpace(v.Value) == "" {
			return "", errors.New("Memory title, type, and permalink must be non-empty text.")
		}
	}
	var buffer bytes.Buffer
	enc := yaml.NewEncoder(&buffer)
	enc.SetIndent(2)
	if e = enc.Encode(result); e != nil {
		return "", e
	}
	enc.Close()
	// Keep the supplied body exactly. New plain-text notes get one separator line.
	separator := ""
	if !hasFront {
		separator = "\n"
	}
	output := "---\n" + buffer.String() + "---\n" + separator + body
	if _, _, _, e = parseMetadata(output); e != nil {
		return "", e
	}
	return output, nil
}
