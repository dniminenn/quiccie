package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"quiccie/internal/store"
	"testing"
)

func TestAuthenticationAndRequestProtection(t *testing.T) {
	db, e := store.Open(filepath.Join(t.TempDir(), "db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	search, e := store.NewSearch()
	if e != nil {
		t.Fatal(e)
	}
	defer search.Close()
	app := (&Server{DB: db, Search: search, PasswordHash: HashPassword("test-password"), Web: t.TempDir()}).Handler()
	request := func(method, path, content string, cookie *http.Cookie, protected bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, bytes.NewBufferString(content))
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
	if w := request("GET", "/api/notes", "", nil, false); w.Code != 401 {
		t.Fatal(w.Code)
	}
	w := request("POST", "/api/login", `{"username":"owner","password":"test-password"}`, nil, false)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly {
		t.Fatal(cookies)
	}
	cookie := cookies[0]
	payload := `{"path":"A.md","content":"hello","operation_id":"test"}`
	if w = request("PUT", "/api/notes", payload, cookie, false); w.Code != 403 {
		t.Fatal(w.Code)
	}
	if w = request("PUT", "/api/notes", payload, cookie, true); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var first store.Note
	json.Unmarshal(w.Body.Bytes(), &first)
	if w = request("PUT", "/api/notes", payload, cookie, true); w.Code != 200 {
		t.Fatal(w.Code)
	}
	var duplicate store.Note
	json.Unmarshal(w.Body.Bytes(), &duplicate)
	if first.Sequence != duplicate.Sequence {
		t.Fatal("retry created duplicate revision")
	}
	r := httptest.NewRequest("POST", "http://example.com/api/login", bytes.NewBufferString(`{}`))
	r.Header.Set("Origin", "https://attacker.example")
	w = httptest.NewRecorder()
	app.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal(w.Code)
	}
	if w = request("POST", "/api/logout", `{}`, cookie, true); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w = request("GET", "/api/notes", "", cookie, false); w.Code != 401 {
		t.Fatal(w.Code)
	}
}

func TestBearerLogoutWithCookieAndAttachmentConflict(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := &Server{DB: db, Web: t.TempDir()}
	handler := s.Handler()
	data, _ := json.Marshal(Session{Expires: 4102444800})
	for _, token := range []string{"bearer", "cookie"} {
		if err = db.Set("sessions", store.Hash([]byte(token)), data); err != nil {
			t.Fatal(err)
		}
	}
	request := func(method, path, content string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, bytes.NewBufferString(content))
		r.Header.Set("Authorization", "Bearer bearer")
		r.AddCookie(&http.Cookie{Name: "quiccie_session", Value: "cookie"})
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	if w := request("POST", "/api/attachment?path=Files/test.txt", "first"); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w := request("POST", "/api/attachment?path=Files/test.txt", "second"); w.Code != 409 {
		t.Fatal(w.Code)
	}
	if w := request("POST", "/api/logout", "{}"); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w := request("GET", "/api/me", ""); w.Code != 401 {
		t.Fatal("bearer remained valid", w.Code)
	}
	if _, err = db.Value("sessions", store.Hash([]byte("cookie"))); err != nil {
		t.Fatal("wrong session removed")
	}
}
