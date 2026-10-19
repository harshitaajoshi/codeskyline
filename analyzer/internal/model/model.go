// Package model defines the City document: everything the viewer needs to
// render a repository as a city. It is the contract between the Go analyzer
// and the TypeScript frontend, so field names here are the JSON field names.
package model

// Version is bumped whenever the serialized shape changes incompatibly.
const Version = 1

// City is the root document produced by one analysis run.
type City struct {
	Version  int      `json:"version"`
	Repo     Repo     `json:"repo"`
	Authors  []Author `json:"authors"`
	Dirs     []Dir    `json:"dirs"`
	Files    []File   `json:"files"`
	Stats    Stats    `json:"stats"`
	Timeline Timeline `json:"timeline"`
}

// Timeline is the time-travel data: the city sampled at K keyframe commits.
//
// Events is a flat list of 6-tuples [file, k, lines, activity, owner, fire],
// sorted by file then k, recording a file's state at keyframe k whenever it
// differs from its state at k-1. Between events a file's state is constant.
// Files not mentioned before their first event do not exist yet.
//
//   - lines:    line count at the keyframe (0 once deleted)
//   - activity: commits touching the file since the previous keyframe, capped at 255
//   - owner:    index into City.Authors, or -1
//   - fire:     hotspot level 0..3 ranked among files alive at the keyframe
type Timeline struct {
	Keyframes []Keyframe `json:"keyframes"`
	Events    []int32    `json:"events"`
}

// Keyframe is one sampled commit.
type Keyframe struct {
	Index   int    `json:"index"` // position in the first-parent walk, 0-based
	Time    int64  `json:"time"`
	Hash    string `json:"hash"`
	Subject string `json:"subject"`
	Author  int    `json:"author"`
}

// Repo describes the analyzed repository and the extent of history covered.
type Repo struct {
	Name          string `json:"name"`
	URL           string `json:"url,omitempty"`
	Head          string `json:"head"`
	DefaultBranch string `json:"defaultBranch,omitempty"`
	AnalyzedAt    int64  `json:"analyzedAt"`
	Commits       int    `json:"commits"`
	FirstCommit   int64  `json:"firstCommit"`
	LastCommit    int64  `json:"lastCommit"`
	// Truncated is true when history was capped, so per-file counters only
	// cover the most recent Commits commits rather than the full history.
	Truncated bool `json:"truncated,omitempty"`
}

// Author is a de-duplicated committer identity (after .mailmap).
type Author struct {
	Name      string `json:"name"`
	Email     string `json:"email"`
	Login     string `json:"login,omitempty"` // GitHub login when derivable from a noreply address
	Commits   int    `json:"commits"`
	Added     int64  `json:"added"`
	Deleted   int64  `json:"deleted"`
	FirstSeen int64  `json:"firstSeen"`
	LastSeen  int64  `json:"lastSeen"`
}

// Rect is a footprint on the ground plane: X/Z is the min corner, W runs
// along X and D along Z.
type Rect struct {
	X float64 `json:"x"`
	Z float64 `json:"z"`
	W float64 `json:"w"`
	D float64 `json:"d"`
}

// Dir is a district. The root directory has Path "" and Parent -1.
type Dir struct {
	ID     int    `json:"id"`
	Path   string `json:"path"`
	Parent int    `json:"parent"`
	Depth  int    `json:"depth"`
	Files  int    `json:"files"` // files in this directory and all descendants
	Lines  int    `json:"lines"`
	// Bus is the truck factor: how many authors could leave before more
	// than half of this district's live files have no remaining owner.
	Bus int `json:"bus"`
	Rect
}

// Owner is one author's share of a file's (decayed) authored lines.
type Owner struct {
	Author int     `json:"author"`
	Share  float64 `json:"share"`
}

// File is a building.
type File struct {
	ID   int    `json:"id"`
	Path string `json:"path"`
	Dir  int    `json:"dir"`
	Lang string `json:"lang"`
	Size int64  `json:"size"`

	Lines      int `json:"lines"`
	Code       int `json:"code"`
	Comment    int `json:"comment"`
	Blank      int `json:"blank"`
	Complexity int `json:"complexity"`

	Commits       int   `json:"commits"`
	RecentCommits int   `json:"recentCommits"` // commits in the 365 days before LastCommit
	Added         int64 `json:"added"`
	Deleted       int64 `json:"deleted"`
	Created       int64 `json:"created"`
	LastTouched   int64 `json:"lastTouched"`
	BugFixes      int   `json:"bugFixes"`

	Hotspot float64 `json:"hotspot"` // 0..1 percentile-ish score
	Fire    int     `json:"fire"`    // 0 none, 1 smoke, 2 flames, 3 inferno
	Owners  []Owner `json:"owners"`

	Rect
	Generated bool `json:"generated,omitempty"`
	Vendored  bool `json:"vendored,omitempty"`
	Binary    bool `json:"binary,omitempty"`
	// Removed files no longer exist at HEAD but keep their lot so the city
	// does not reshuffle during time travel. Lines is 0 for them.
	Removed  bool `json:"removed,omitempty"`
	MaxLines int  `json:"maxLines"` // largest line count the file ever had
	// Ghost marks a file whose owners have all been inactive for over a
	// year: nobody left who knows it.
	Ghost bool `json:"ghost,omitempty"`
}

// Stats are repo-wide aggregates used for legends and scales.
type Stats struct {
	Files      int            `json:"files"`
	Dirs       int            `json:"dirs"`
	Lines      int            `json:"lines"`
	Code       int            `json:"code"`
	MaxLines   int            `json:"maxLines"`
	MaxCommits int            `json:"maxCommits"`
	Languages  map[string]int `json:"languages"` // language -> lines
	Burning    int            `json:"burning"`   // files with Fire > 0
	Removed    int            `json:"removed"`   // files that exist only in history
	// LineMismatches counts files whose running numstat total disagreed with
	// the real line count at HEAD. Non-zero on full histories indicates a
	// parser bug, so it is surfaced rather than hidden.
	LineMismatches int `json:"lineMismatches,omitempty"`
}
