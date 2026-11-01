package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"quiccie/internal/mcp"
	"quiccie/internal/server"
	"quiccie/internal/store"
	"strings"
	"syscall"
	"time"
)

func main() {
	mode := flag.String("mode", "serve", "serve, stdio, import, backup, hash-password")
	dbPath := flag.String("db", "data/quiccie.db", "database path")
	listen := flag.String("listen", "127.0.0.1:8090", "web listen address")
	mcpListen := flag.String("mcp-listen", "127.0.0.1:8767", "private MCP listen address")
	web := flag.String("web", "", "optional static asset directory; embedded assets are the default")
	vault := flag.String("vault", "", "import source directory")
	registry := flag.String("registry", "", "scope registry JSON")
	passwordFile := flag.String("password-hash-file", "", "protected Argon2id password hash file")
	username := flag.String("username", "owner", "account username")
	secure := flag.Bool("secure-cookie", false, "require HTTPS for cookies")
	flag.Parse()
	if *mode == "bridge" {
		if err := mcp.Bridge(os.Stdin, os.Stdout, "http://"+*mcpListen+"/mcp"); err != nil {
			log.Fatal(err)
		}
		return
	}
	if *mode == "hash-password" {
		b, e := io.ReadAll(io.LimitReader(os.Stdin, 4096))
		if e != nil {
			log.Fatal(e)
		}
		fmt.Println(server.HashPassword(strings.TrimSuffix(string(b), "\n")))
		return
	}
	db, e := store.Open(*dbPath)
	if e != nil {
		log.Fatal(e)
	}
	defer db.Close()
	if *registry != "" {
		data, e := os.ReadFile(*registry)
		if e != nil {
			log.Fatal(e)
		}
		var r mcp.Registry
		if e = json.Unmarshal(data, &r); e != nil || r.Version != 1 || len(r.Projects) == 0 {
			log.Fatal("invalid registry")
		}
		if e = r.Validate(); e != nil {
			log.Fatal(e)
		}
		if e = db.Set("settings", "registry", data); e != nil {
			log.Fatal(e)
		}
	} else if _, e = db.Value("settings", "registry"); e != nil {
		r := mcp.Registry{Version: 1, Projects: map[string]mcp.Project{"global": {Aliases: []string{"global"}, Repositories: []string{}}, "work": {Aliases: []string{"work"}, Repositories: []string{}, Space: "work"}}}
		b, _ := json.Marshal(r)
		if e = db.Set("settings", "registry", b); e != nil {
			log.Fatal(e)
		}
	}
	if *mode == "backup" {
		if e = db.Backup(os.Stdout); e != nil {
			log.Fatal(e)
		}
		return
	}
	if *mode == "import" {
		if *vault == "" {
			log.Fatal("-vault required")
		}
		count := 0
		e = filepath.WalkDir(*vault, func(p string, d fs.DirEntry, e error) error {
			if e != nil {
				return e
			}
			rel, e := filepath.Rel(*vault, p)
			if e != nil {
				return e
			}
			if rel == "." {
				return nil
			}
			if strings.HasPrefix(d.Name(), ".") {
				if d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
			if d.Type()&os.ModeSymlink != 0 {
				return fmt.Errorf("symlink refused: %s", rel)
			}
			if d.IsDir() {
				return nil
			}
			data, e := os.ReadFile(p)
			if e != nil {
				return e
			}
			rel = filepath.ToSlash(rel)
			if e = store.ValidPath(rel); e != nil {
				return e
			}
			ext := strings.ToLower(filepath.Ext(rel))
			if strings.Contains("|.md|.markdown|.txt|.canvas|.base|.json|.yaml|.yml|.csv|.tsv|.org|.rst|", "|"+ext+"|") {
				old, err := db.Get(rel)
				if err == nil {
					if old.Checksum != store.Hash(data) {
						return fmt.Errorf("mirror differs from existing note: %s", rel)
					}
				} else {
					if _, e = db.Put(store.Write{Path: rel, Content: string(data)}); e != nil {
						return e
					}
				}
			} else {
				if e = db.Set("attachments", rel, data); e != nil {
					return e
				}
			}
			count++
			return nil
		})
		if e != nil {
			log.Fatal(e)
		}
		fmt.Printf("Imported %d files without changing source\n", count)
		return
	}
	search, e := store.NewSearch()
	if e != nil {
		log.Fatal(e)
	}
	defer search.Close()
	service := &mcp.Service{DB: db, Search: search}
	if *mode == "stdio" {
		if e = service.Stdio(os.Stdin, os.Stdout); e != nil {
			log.Fatal(e)
		}
		return
	}
	if *mode != "serve" {
		log.Fatal("unknown mode")
	}
	if *passwordFile == "" {
		log.Fatal("-password-hash-file is required")
	}
	hash, e := os.ReadFile(*passwordFile)
	if e != nil {
		log.Fatal(e)
	}
	app := &server.Server{DB: db, Search: search, PasswordHash: strings.TrimSpace(string(hash)), Username: *username, Web: *web, Secure: *secure}
	mainHTTP := &http.Server{Addr: *listen, Handler: app.Handler(), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second, MaxHeaderBytes: 16384}
	mcpHTTP := &http.Server{Addr: *mcpListen, Handler: http.HandlerFunc(service.HTTP), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second, MaxHeaderBytes: 16384}
	go func() {
		log.Printf("Quiccie web listening on %s", *listen)
		if e := mainHTTP.ListenAndServe(); e != nil && e != http.ErrServerClosed {
			log.Fatal(e)
		}
	}()
	go func() {
		log.Printf("Quiccie private MCP listening on %s", *mcpListen)
		if e := mcpHTTP.ListenAndServe(); e != nil && e != http.ErrServerClosed {
			log.Fatal(e)
		}
	}()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	<-signals
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	mainHTTP.Shutdown(ctx)
	mcpHTTP.Shutdown(ctx)
}
