package httpapi

import (
	"crypto/subtle"
	"log"
	"net/http"
)

// corsMiddleware answers preflight requests and reflects an allowed Origin,
// replicating the Python CORSMiddleware config: only GET/POST, only the
// Content-Type request header, no credentials.
func corsMiddleware(allowedOrigins []string, next http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		allowed[origin] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if _, ok := allowed[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			}
		}
		if r.Method == http.MethodOptions {
			// Preflight: headers above are the whole answer.
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// recoverMiddleware turns a handler panic into a 500 instead of dropping the
// connection, and logs the cause.
func recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic serving %s %s: %v", r.Method, r.URL.Path, rec)
				writeError(w, http.StatusInternalServerError, "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// requireServiceKey guards the /internal/* endpoints. It compares the
// X-Service-Key header against the shared secret in constant time, matching the
// Python secrets.compare_digest check.
func (s *Server) requireServiceKey(next http.HandlerFunc) http.HandlerFunc {
	secret := []byte(s.cfg.ServiceSharedSecret)
	return func(w http.ResponseWriter, r *http.Request) {
		key := []byte(r.Header.Get("X-Service-Key"))
		if len(key) == 0 || subtle.ConstantTimeCompare(key, secret) != 1 {
			writeError(w, http.StatusUnauthorized, "Invalid service key")
			return
		}
		next(w, r)
	}
}
