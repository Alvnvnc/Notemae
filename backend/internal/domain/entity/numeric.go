package entity

import (
	"strconv"
	"strings"
)

// Score is a JSON number that reproduces the former Python backend's float
// rendering exactly. The catalog's rating/longevity/projection are NUMERIC(2,1)
// and a relationship's confidence is REAL (float4); psycopg emitted their
// shortest decimal form ("4.0", "0.9"), whereas a raw Go float64 would print
// "4" or the widened "0.8999999761581421". Marshaling through the shortest
// float32 representation — with a decimal point forced on whole numbers —
// restores byte-for-byte parity with the old responses.
//
// The underlying value stays a float64 so it scans and unmarshals like any
// number; only the JSON encoding is customized.
type Score float64

func (s Score) MarshalJSON() ([]byte, error) {
	text := strconv.FormatFloat(float64(s), 'g', -1, 32)
	if !strings.ContainsAny(text, ".eE") {
		text += ".0"
	}
	return []byte(text), nil
}
