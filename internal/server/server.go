package server

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path/filepath"
	"quiccie/internal/mcp"
	"quiccie/internal/store"
	ui "quiccie/web"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Server struct {
	DB           *store.Store
	Search       *store.Search
	PasswordHash string
	Username     string
	Web          string
	Secure       bool
	mu           sync.Mutex
	loginTimes   []time.Time
}
type Session struct {
	Expires int64  `json:"expires"`
	Device  string `json:"device"`
}

func (s *Server) username() string {
	if s.Username != "" {
		return s.Username
	}
	return "owner"
}
func token() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func HashPassword(password string) string {
	salt := make([]byte, 16)
	rand.Read(salt)
	hash := argon2.IDKey([]byte(password), salt, 3, 65536, 2, 32)
	return fmt.Sprintf("$argon2id$v=19$m=65536,t=3,p=2$%s$%s", base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(hash))
}
func CheckPassword(encoded, password string) bool {
	if strings.HasPrefix(encoded, "$2a$") || strings.HasPrefix(encoded, "$2b$") || strings.HasPrefix(encoded, "$2y$") {
		return bcrypt.CompareHashAndPassword([]byte(encoded), []byte(password)) == nil
	}
	p := strings.Split(encoded, "$")
	if len(p) != 6 || p[1] != "argon2id" || p[2] != "v=19" {
		return false
	}
	var memory, iterations uint32
	var parallel uint8
	if _, e := fmt.Sscanf(p[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallel); e != nil || memory < 8 || memory > 262144 || iterations < 1 || iterations > 10 || parallel < 1 || parallel > 16 {
		return false
	}
	salt, e := base64.RawStdEncoding.DecodeString(p[4])
	if e != nil {
		return false
	}
	expected, e := base64.RawStdEncoding.DecodeString(p[5])
	if e != nil || len(expected) < 16 || len(expected) > 64 {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, iterations, memory, parallel, uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}
func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, e error) {
	write(w, status, map[string]string{"error": e.Error()})
}
func body(w http.ResponseWriter, r *http.Request, out any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 4*1024*1024)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if e := d.Decode(out); e != nil {
		fail(w, 400, errors.New("invalid request body"))
		return false
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		fail(w, 400, errors.New("request must contain one JSON value"))
		return false
	}
	return true
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		write(w, 200, map[string]string{"status": "ok", "application": "quiccie"})
	})
	mux.HandleFunc("POST /api/login", s.login)
	mux.Handle("/api/", s.auth(http.HandlerFunc(s.api)))
	if s.Web != "" {
		mux.Handle("/", http.FileServer(http.Dir(s.Web)))
	} else {
		mux.Handle("/", http.FileServer(http.FS(ui.Assets())))
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			if origin := r.Header.Get("Origin"); origin != "" {
				u, e := url.Parse(origin)
				if e != nil || u.Host != r.Host {
					fail(w, 403, errors.New("cross-origin write refused"))
					return
				}
			}
		}
		mux.ServeHTTP(w, r)
	})
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	now := time.Now()
	recent := s.loginTimes[:0]
	for _, t := range s.loginTimes {
		if now.Sub(t) < time.Minute {
			recent = append(recent, t)
		}
	}
	s.loginTimes = recent
	if len(recent) >= 20 {
		s.mu.Unlock()
		fail(w, 429, errors.New("too many login attempts; retry in a minute"))
		return
	}
	s.loginTimes = append(s.loginTimes, now)
	s.mu.Unlock()
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Device   string `json:"device"`
	}
	if !body(w, r, &req) {
		return
	}
	if req.Username != s.username() || !CheckPassword(s.PasswordHash, req.Password) {
		fail(w, 401, errors.New("invalid username or password"))
		return
	}
	t := token()
	expiry := time.Now().Add(30 * 24 * time.Hour)
	data, _ := json.Marshal(Session{expiry.Unix(), req.Device})
	if e := s.DB.Set("sessions", store.Hash([]byte(t)), data); e != nil {
		fail(w, 500, errors.New("session could not be saved"))
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "quiccie_session", Value: t, Path: "/", HttpOnly: true, Secure: s.Secure, SameSite: http.SameSiteStrictMode, Expires: expiry})
	out := map[string]any{"username": s.username(), "expires": expiry.Unix()}
	if req.Device != "" {
		out["token"] = t
	}
	write(w, 200, out)
}
func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bearer := strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ")
		t := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !bearer {
			c, e := r.Cookie("quiccie_session")
			if e != nil {
				fail(w, 401, errors.New("sign in required"))
				return
			}
			t = c.Value
			if r.Method != "GET" && r.Method != "HEAD" && r.Header.Get("X-Quiccie-Request") != "1" {
				fail(w, 403, errors.New("missing request protection"))
				return
			}
		}
		b, e := s.DB.Value("sessions", store.Hash([]byte(t)))
		var sess Session
		if e != nil || json.Unmarshal(b, &sess) != nil || sess.Expires < time.Now().Unix() {
			fail(w, 401, errors.New("session expired; sign in again"))
			return
		}
		next.ServeHTTP(w, r)
	})
}
func (s *Server) api(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/api/me":
		if r.Method != "GET" {
			w.WriteHeader(405)
			return
		}
		write(w, 200, map[string]string{"username": s.username()})
	case "/api/logout":
		if r.Method != "POST" {
			w.WriteHeader(405)
			return
		}
		t := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if c, e := r.Cookie("quiccie_session"); e == nil && !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			t = c.Value
		}
		if e := s.DB.Delete("sessions", store.Hash([]byte(t))); e != nil {
			fail(w, 500, e)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "quiccie_session", Path: "/", MaxAge: -1, HttpOnly: true, Secure: s.Secure})
		write(w, 200, map[string]bool{"ok": true})
	case "/api/spaces":
		s.spaces(w, r)
	case "/api/notes":
		s.notes(w, r)
	case "/api/changes":
		if r.Method != "GET" {
			w.WriteHeader(405)
			return
		}
		after, e := strconv.ParseUint(r.URL.Query().Get("after"), 10, 64)
		if e != nil && r.URL.Query().Get("after") != "" {
			fail(w, 400, e)
			return
		}
		changes, next, e := s.DB.Changes(after, 20)
		if e != nil {
			fail(w, 500, e)
			return
		}
		write(w, 200, map[string]any{"changes": changes, "next": next, "more": len(changes) == 20})
	case "/api/search":
		if r.Method != "GET" {
			w.WriteHeader(405)
			return
		}
		q := r.URL.Query().Get("q")
		if len(q) > 512 {
			fail(w, 400, errors.New("query too long"))
			return
		}
		space, kind := r.URL.Query().Get("space"), r.URL.Query().Get("kind")
		if space != "" {
			registry, e := (&mcp.Service{DB: s.DB}).Registry()
			if e != nil || !registry.HasSpace(space) {
				fail(w, 400, errors.New("Unknown space"))
				return
			}
		}
		if kind != "" && kind != "notes" && kind != "memory" {
			fail(w, 400, errors.New("Unknown note type"))
			return
		}
		notes, e := s.Search.QueryInSpace(s.DB, q, space, kind)
		if e != nil {
			log.Printf("search: %v", e)
			fail(w, 503, errors.New("search index unavailable; notes remain saved"))
			return
		}
		write(w, 200, notes)
	case "/api/history":
		if r.Method != "GET" {
			w.WriteHeader(405)
			return
		}
		notes, e := s.DB.History(r.URL.Query().Get("path"))
		if e != nil {
			fail(w, 500, e)
			return
		}
		write(w, 200, notes)
	case "/api/backlinks":
		if r.Method != "GET" {
			w.WriteHeader(405)
			return
		}
		p := r.URL.Query().Get("path")
		name := strings.TrimSuffix(filepath.Base(p), filepath.Ext(p))
		notes, e := s.DB.List()
		if e != nil {
			fail(w, 500, e)
			return
		}
		out := []store.Note{}
		for _, n := range notes {
			if n.Path != p && (strings.Contains(n.Content, "[["+name+"]]") || strings.Contains(n.Content, "[["+name+"|") || strings.Contains(n.Content, "[["+strings.TrimSuffix(p, filepath.Ext(p))) || strings.Contains(n.Content, "]("+url.PathEscape(p)+")")) {
				out = append(out, n)
			}
		}
		write(w, 200, out)
	case "/api/attachments":
		if r.Method != "GET" {
			w.WriteHeader(405)
			return
		}
		entries, e := s.DB.Attachments()
		if e != nil {
			fail(w, 500, e)
			return
		}
		write(w, 200, entries)
	case "/api/attachment":
		s.attachment(w, r)
	case "/api/backup":
		if r.Method != "GET" {
			w.WriteHeader(405)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", `attachment; filename="quiccie-backup.db"`)
		if e := s.DB.Backup(w); e != nil {
			log.Printf("backup: %v", e)
		}
	default:
		http.NotFound(w, r)
	}
}
func (s *Server) notes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		p := r.URL.Query().Get("path")
		if p != "" {
			n, e := s.DB.Get(p)
			if e != nil || (n.Deleted && r.URL.Query().Get("include_deleted") != "1") {
				fail(w, 404, store.ErrMissing)
				return
			}
			write(w, 200, n)
			return
		}
		notes, e := s.DB.List()
		if e != nil {
			fail(w, 500, e)
			return
		}
		for i := range notes {
			notes[i].Content = ""
		}
		write(w, 200, notes)
	case "PUT":
		var req store.Write
		if !body(w, r, &req) {
			return
		}
		n, e := s.DB.Put(req)
		if e != nil {
			status := 400
			if errors.Is(e, store.ErrConflict) || errors.Is(e, store.ErrOperation) {
				status = 409
			}
			fail(w, status, e)
			return
		}
		write(w, 200, n)
	default:
		w.WriteHeader(405)
	}
}
func (s *Server) attachment(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("path")
	if e := store.ValidPath(p); e != nil {
		fail(w, 400, e)
		return
	}
	switch r.Method {
	case "GET":
		data, e := s.DB.Value("attachments", p)
		if e != nil {
			fail(w, 404, errors.New("attachment not found"))
			return
		}
		w.Header().Set("Content-Type", http.DetectContentType(data))
		w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", filepath.Base(p)))
		w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'")
		w.Write(data)
	case "POST":
		data, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 20*1024*1024))
		if e != nil {
			fail(w, 413, errors.New("attachment exceeds 20 MiB"))
			return
		}

		if e = s.DB.PutAttachment(p, data); e != nil {
			status := 500
			if errors.Is(e, store.ErrConflict) {
				status = 409
			}
			fail(w, status, e)
			return
		}
		write(w, 200, map[string]string{"path": p, "checksum": store.Hash(data)})
	default:
		w.WriteHeader(405)
	}
}
