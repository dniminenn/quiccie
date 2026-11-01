package mcp

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

func Bridge(in io.Reader, out io.Writer, endpoint string) error {
	client := &http.Client{Timeout: 60 * time.Second}
	scan := bufio.NewScanner(in)
	scan.Buffer(make([]byte, 4096), 8*1024*1024)
	for scan.Scan() {
		line := append([]byte(nil), scan.Bytes()...)
		var req Request
		if json.Unmarshal(line, &req) != nil {
			continue
		}
		request, e := http.NewRequest("POST", endpoint, bytes.NewReader(line))
		if e != nil {
			return e
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Accept", "application/json, text/event-stream")
		response, e := client.Do(request)
		var data []byte
		if e == nil {
			data, e = io.ReadAll(io.LimitReader(response.Body, 8*1024*1024))
			response.Body.Close()
			if response.StatusCode != 200 && response.StatusCode != 202 {
				e = fmt.Errorf("backend returned status %d", response.StatusCode)
			}
		}
		if len(req.ID) == 0 {
			continue
		}
		if e != nil {
			data, _ = json.Marshal(Result{"jsonrpc": "2.0", "id": req.ID, "error": Result{"code": -32603, "message": "The notes backend is unavailable. Retry this request."}})
		}
		if len(data) > 0 {
			if _, e = fmt.Fprintln(out, string(data)); e != nil {
				return e
			}
		}
	}
	return scan.Err()
}
