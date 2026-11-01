package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"quiccie/internal/mcp"
	"quiccie/internal/store"
	"testing"
)

func TestSpacesAndSearchBoundary(t *testing.T) {
	db, e := store.Open(filepath.Join(t.TempDir(), "db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	index, _ := store.NewSearch()
	defer index.Close()
	registry := mcp.Registry{Version: 1, Projects: map[string]mcp.Project{"global": {}, "work": {Space: "work"}}}
	raw, _ := json.Marshal(registry)
	db.Set("settings", "registry", raw)
	app := (&Server{DB: db, Search: index, PasswordHash: HashPassword("test"), Web: t.TempDir()}).Handler()
	call := func(method, path, body string, cookie *http.Cookie, protected bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		if cookie != nil {
			r.AddCookie(cookie)
		}
		if protected {
			r.Header.Set("X-Quiccie-Request", "1")
		}
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		return w
	}
	if w := call("GET", "/api/spaces", "", nil, false); w.Code != 401 {
		t.Fatal(w.Code)
	}
	login := call("POST", "/api/login", `{"username":"owner","password":"test"}`, nil, false)
	cookie := login.Result().Cookies()[0]
	if w := call("POST", "/api/spaces", `{"id":"gig","name":"Gig"}`, cookie, false); w.Code != 403 {
		t.Fatal(w.Code)
	}
	if w := call("POST", "/api/spaces", `{"id":"gig","name":"Gig"}`, cookie, true); w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	for i := 0; i < 150; i++ {
		db.Put(store.Write{Path: fmt.Sprintf("Personal/%d.md", i), Content: "boundarymarker"})
	}
	db.Put(store.Write{Path: "Spaces/gig/Plan.md", Content: "boundarymarker"})
	db.Put(store.Write{Path: "Spaces/gig/Agent Memory/global/Fact.md", Content: "boundarymarker"})
	for _, kind := range []string{"notes", "memory"} {
		w := call("GET", "/api/search?q=boundarymarker&space=gig&kind="+kind, "", cookie, false)
		var notes []store.Note
		json.Unmarshal(w.Body.Bytes(), &notes)
		if w.Code != 200 || len(notes) != 1 {
			t.Fatal(kind, w.Code, w.Body.String())
		}
	}
	if w := call("GET", "/api/search?q=boundarymarker&space=missing", "", cookie, false); w.Code != 400 {
		t.Fatal(w.Code)
	}
}
