package mcp

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestMemoryCorpusProperties(t *testing.T) {
	file := os.Getenv("QUICCIE_AUDIT_CORPUS")
	if file == "" {
		t.Skip("Set QUICCIE_AUDIT_CORPUS to a private corpus snapshot.")
	}
	data, e := os.ReadFile(file)
	if e != nil {
		t.Fatal(e)
	}
	var notes []struct{ Path, Content string }
	if e = json.Unmarshal(data, &notes); e != nil {
		t.Fatal(e)
	}
	for _, note := range notes {
		before, body, hasFront, e := parseMetadata(note.Content)
		if e != nil {
			t.Fatal(note.Path, e)
		}
		got, e := MemoryContent("audit", note.Path, note.Content, note.Content)
		if e != nil {
			t.Fatal(note.Path, e)
		}
		after, newBody, _, e := parseMetadata(got)
		if e != nil {
			t.Fatal(note.Path, e)
		}
		if !hasFront {
			body = "\n" + body
		}
		if body != newBody {
			t.Fatal(note.Path, "body changed")
		}
		for i := 0; i < len(before.Content); i += 2 {
			key := before.Content[i].Value
			var want, actual any
			before.Content[i+1].Decode(&want)
			v := field(after, key)
			if v == nil {
				t.Fatal(note.Path, key, "lost")
			}
			v.Decode(&actual)
			if !reflect.DeepEqual(want, actual) {
				t.Fatal(note.Path, key, "changed")
			}
		}
	}
}
