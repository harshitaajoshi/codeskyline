package metrics

import (
	"path"
	"regexp"
	"strings"
)

// Path classification mirrors the spirit of GitHub Linguist's vendor.yml and
// generated.rb: these files are real, but they would dwarf hand-written code
// and say nothing about the humans who maintain the repo. They stay in the
// city, flagged, so the viewer can hide them by default.

var vendoredDirs = map[string]bool{
	"node_modules": true, "vendor": true, "vendors": true, "third_party": true,
	"thirdparty": true, "third-party": true, "external": true, "externals": true,
	"bower_components": true, "jspm_packages": true, "deps": true, "dist": true,
	".yarn": true, "Pods": true, "Carthage": true, "packages": false,
}

var vendoredFile = regexp.MustCompile(`(?i)(^|[./-])min\.(js|css)$|(^|/)jquery[-.][\d.]+\.js$|(^|/)(bootstrap|modernizr|prototype|mootools)[-.][\d.]*(min\.)?(js|css)$`)

var generatedFile = regexp.MustCompile(`(?i)(` +
	`(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json|bun\.lockb?|composer\.lock|cargo\.lock|gemfile\.lock|poetry\.lock|pipfile\.lock|uv\.lock|go\.sum|flake\.lock|mix\.lock|pubspec\.lock|packages\.lock\.json|gradle\.lockfile)$` +
	`|\.(pb|pb2|pbgo)\.(go|py|js|ts|rb|cc|h)$|_pb2(_grpc)?\.py$|\.pb\.(cc|h)$` +
	`|\.generated\.|\.g\.(dart|cs)$|\.designer\.cs$|\.freezed\.dart$` +
	`|\.(map|snap|lock)$|(^|/)__snapshots__/|(^|/)__generated__/|(^|/)generated/` +
	`|\.xcodeproj/|\.nib$|\.storyboard$|\.xib$` +
	`|(^|/)(swagger|openapi)\.(json|yaml|yml)$|\.d\.ts$` +
	`)`)

// Classify returns whether a path looks vendored or generated. Linguist
// attributes from .gitattributes override these heuristics when present.
func Classify(p string, gen, vend *bool) (generated, vendored bool) {
	segs := strings.Split(path.Dir(p), "/")
	for _, s := range segs {
		if vendoredDirs[s] {
			vendored = true
			break
		}
	}
	if !vendored && vendoredFile.MatchString(p) {
		vendored = true
	}
	generated = generatedFile.MatchString(p)
	if gen != nil {
		generated = *gen
	}
	if vend != nil {
		vendored = *vend
	}
	return generated, vendored
}
