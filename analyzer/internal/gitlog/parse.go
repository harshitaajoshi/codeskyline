// Package gitlog streams commits out of `git log` without ever holding the
// whole history in memory.
//
// The log is requested with -z, --raw and --numstat together. With -z the
// output is unambiguous even for paths containing newlines or "=>":
//
//	\x1e<hash>\x1f<name>\x1f<email>\x1f<unix>\x1f<subject>\x1f<body>\0[\n]
//	:<oldmode> <newmode> <oldsha> <newsha> <status>\0<path>\0          (raw, A/M/D/T)
//	:<oldmode> <newmode> <oldsha> <newsha> R<score>\0<old>\0<new>\0     (raw, rename/copy)
//	<added>\t<deleted>\t<path>\0                                        (numstat)
//	<added>\t<deleted>\t\0<old>\0<new>\0                                (numstat, rename/copy)
//
// Binary files report "-\t-" in numstat. Raw entries give the change status,
// numstat entries give the line deltas; the parser joins them by path.
package gitlog

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
)

const (
	recordSep = 0x1e // starts every commit header
	fieldSep  = 0x1f // separates header fields
)

// Change is one file touched by a commit.
type Change struct {
	Status  byte   // A, M, D, R, C, T
	Score   int    // rename/copy similarity, 0..100
	OldPath string // set for R and C
	Path    string
	Added   int
	Deleted int
	Binary  bool
}

// Commit is one first-parent commit with its file changes.
type Commit struct {
	Hash    string
	Author  string
	Email   string
	Time    int64
	Subject string
	Body    string
	Changes []Change
}

// Parser reads commits from a -z git log stream.
type Parser struct {
	r *bufio.Reader
}

// NewParser wraps the raw stdout of git log.
func NewParser(r io.Reader) *Parser {
	return &Parser{r: bufio.NewReaderSize(r, 1<<20)}
}

// Next returns the next commit, or io.EOF when the stream is exhausted.
func (p *Parser) Next() (*Commit, error) {
	b, err := p.r.ReadByte()
	if err != nil {
		return nil, err // io.EOF at a clean boundary
	}
	if b != recordSep {
		return nil, fmt.Errorf("gitlog: expected record separator, got %q", b)
	}
	hdr, err := p.readToken()
	if err != nil {
		return nil, fmt.Errorf("gitlog: truncated header: %w", err)
	}
	fields := strings.SplitN(hdr, string(rune(fieldSep)), 6)
	if len(fields) < 5 {
		return nil, fmt.Errorf("gitlog: malformed header %q", hdr)
	}
	ts, err := strconv.ParseInt(fields[3], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("gitlog: bad timestamp %q: %w", fields[3], err)
	}
	c := &Commit{Hash: fields[0], Author: fields[1], Email: fields[2], Time: ts, Subject: fields[4]}
	if len(fields) == 6 {
		c.Body = strings.TrimRight(fields[5], "\n")
	}
	// git emits "\0\n" after the header when diff entries follow.
	if nb, _ := p.r.Peek(1); len(nb) == 1 && nb[0] == '\n' {
		_, _ = p.r.ReadByte()
	}

	// Indices, not pointers: c.Changes is appended to as we go.
	byPath := map[string]int{}
	for {
		nb, err := p.r.Peek(1)
		if err == io.EOF || (err == nil && nb[0] == recordSep) {
			break
		}
		if err != nil {
			return nil, err
		}
		if nb[0] == ':' {
			if err := p.readRaw(c, byPath); err != nil {
				return nil, err
			}
			continue
		}
		if err := p.readNumstat(c, byPath); err != nil {
			return nil, err
		}
	}
	return c, nil
}

func (p *Parser) readToken() (string, error) {
	s, err := p.r.ReadString(0)
	if err != nil {
		if errors.Is(err, io.EOF) && s != "" {
			return s, nil // tolerate a missing final NUL
		}
		return "", err
	}
	return s[:len(s)-1], nil
}

func (p *Parser) readRaw(c *Commit, byPath map[string]int) error {
	line, err := p.readToken()
	if err != nil {
		return fmt.Errorf("gitlog: truncated raw entry: %w", err)
	}
	// ":100644 100644 abc123 def456 R050"
	f := strings.Fields(line)
	if len(f) != 5 {
		return fmt.Errorf("gitlog: malformed raw entry %q", line)
	}
	st := f[4]
	ch := Change{Status: st[0]}
	if len(st) > 1 {
		ch.Score, _ = strconv.Atoi(st[1:])
	}
	switch ch.Status {
	case 'R', 'C':
		if ch.OldPath, err = p.readToken(); err != nil {
			return err
		}
		if ch.Path, err = p.readToken(); err != nil {
			return err
		}
	default:
		if ch.Path, err = p.readToken(); err != nil {
			return err
		}
	}
	byPath[ch.Path] = len(c.Changes)
	c.Changes = append(c.Changes, ch)
	return nil
}

func (p *Parser) readNumstat(c *Commit, byPath map[string]int) error {
	line, err := p.readToken()
	if err != nil {
		return fmt.Errorf("gitlog: truncated numstat entry: %w", err)
	}
	parts := bytes.SplitN([]byte(line), []byte{'\t'}, 3)
	if len(parts) != 3 {
		return fmt.Errorf("gitlog: malformed numstat entry %q", line)
	}
	path := string(parts[2])
	if path == "" { // rename/copy: two more tokens follow
		if _, err = p.readToken(); err != nil {
			return err
		}
		if path, err = p.readToken(); err != nil {
			return err
		}
	}
	idx, ok := byPath[path]
	if !ok {
		// Should not happen when --raw is present; keep the data anyway.
		idx = len(c.Changes)
		byPath[path] = idx
		c.Changes = append(c.Changes, Change{Status: 'M', Path: path})
	}
	ch := &c.Changes[idx]
	if string(parts[0]) == "-" {
		ch.Binary = true
		return nil
	}
	if ch.Added, err = strconv.Atoi(string(parts[0])); err != nil {
		return fmt.Errorf("gitlog: bad added count in %q", line)
	}
	if ch.Deleted, err = strconv.Atoi(string(parts[1])); err != nil {
		return fmt.Errorf("gitlog: bad deleted count in %q", line)
	}
	return nil
}
