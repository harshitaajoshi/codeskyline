package repo

import "testing"

func TestProgressMessage(t *testing.T) {
	cases := map[string]string{
		"Receiving objects:  43% (12345/28000), 120.00 MiB | 1.20 MiB/s":        "receiving 43%, 120.00 MB at 1.20 MB/s",
		"Receiving objects: 100% (28000/28000), 300.12 MiB | 2.00 MiB/s, done.": "receiving 100%, 300.12 MB at 2.00 MB/s",
		"remote: Counting objects:  12% (1/8)":                                  "github is counting objects, 12%",
		"Resolving deltas:  77% (1000/1300)":                                    "resolving deltas 77%",
	}
	for in, want := range cases {
		got, ok := progressMessage(in)
		if !ok || got != want {
			t.Errorf("%q: got %q (%v), want %q", in, got, ok, want)
		}
	}
	if _, ok := progressMessage("Cloning into bare repository '/tmp/x'..."); ok {
		t.Error("noise line should not be a progress message")
	}
}
