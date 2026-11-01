package server

import (
	"net/http"
	"quiccie/internal/mcp"
)

func (s *Server) spaces(w http.ResponseWriter, r *http.Request) {
	service := &mcp.Service{DB: s.DB}
	switch r.Method {
	case "GET":
		registry, e := service.Registry()
		if e != nil {
			fail(w, 500, e)
			return
		}
		write(w, 200, registry.SpaceList())
	case "POST":
		var request struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		if !body(w, r, &request) {
			return
		}
		space, e := service.CreateSpace(request.ID, request.Name)
		if e != nil {
			fail(w, 400, e)
			return
		}
		write(w, 201, space)
	default:
		w.WriteHeader(405)
	}
}
