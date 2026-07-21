package entity

import "errors"

// ErrNotFound is returned by repositories and services when a requested record
// does not exist. The presentation layer maps it to HTTP 404. Using a sentinel
// keeps the domain free of any HTTP-status vocabulary.
var ErrNotFound = errors.New("resource not found")

// ErrNoCandidates is returned when no catalog fragrance passes the requested
// recommendation filters. The presentation layer maps it to HTTP 404.
var ErrNoCandidates = errors.New("no catalog fragrance passes the requested filters")
