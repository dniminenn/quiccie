package mcp

import (
	"strings"
	"testing"
)

func TestMemoryPropertyPreservation(t *testing.T) {
	cases := []struct{ name, content, old, key, value string }{
		{"literal list", "---\ndescription: |\n  - first\n  - second\n---\n\nBody.\n", "", "description", "- first\n- second\n"},
		{"indented delimiter", "---\ndescription: |\n  before\n  ---\n  after\n---\n    code\n", "", "description", "before\n---\nafter\n"},
		{"title", "---\ntitle: Human title\n---\nBody", "", "title", "Human title"},
		{"omitted type", "New body", "---\ntype: feedback\ntitle: Existing title\n---\nOld body", "type", "feedback"},
		{"retained alias", "---\nname: Changed\n---\nBody", "---\nname: &n Sample\nother: *n\n---\nOld", "other", "Sample"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, e := MemoryContent("p", "file.md", c.content, c.old)
			if e != nil {
				t.Fatal(e)
			}
			fields, body, _, e := parseMetadata(got)
			if e != nil {
				t.Fatal(e)
			}
			_, original, hasFront, _ := parseMetadata(c.content)
			if !hasFront {
				original = "\n" + original
			}
			if body != original {
				t.Fatalf("body changed: %q != %q", body, original)
			}
			if field(fields, c.key).Value != c.value {
				t.Fatalf("field changed: %q", got)
			}
		})
	}
}
func TestMemoryRejectsInvalidProperties(t *testing.T) {
	for _, front := range []string{"type: [feedback]", "title: false", "permalink: null", "title: A\ntitle: B", "name: &n [*n]"} {
		if _, e := MemoryContent("p", "file.md", "---\n"+front+"\n---\nBody", ""); e == nil {
			t.Fatalf("accepted %q", front)
		}
	}
}
func TestMemoryPlainBodyKeepsIndentation(t *testing.T) {
	body := "    code\n\nTail  \n"
	got, e := MemoryContent("p", "file.md", body, "")
	if e != nil {
		t.Fatal(e)
	}
	if !strings.HasSuffix(got, "---\n\n"+body) {
		t.Fatal(got)
	}
}
