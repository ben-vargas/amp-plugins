#!/usr/bin/env bash
# Installs the amp-cli-proxy-api orb host files into a repository.
#
#   scaffold.sh [--force] <repo-root>
#
# Writes .agents/setup, .agents/resume, .agents/cliproxy-host, .amp/services.yaml,
# .amp/plugins/cliproxy-host-keepalive.ts, copies this skill to
# .agents/skills/amp-cli-proxy-api, and appends missing .gitignore entries.
#
# Before writing anything it checks every destination. If one already exists with
# different content it lists them and exits 3 without changing anything; rerun
# with --force only after the user approved replacing them (for example to
# update a repository scaffolded from an older template).
set -euo pipefail

force=0
if [[ "${1:-}" == --force ]]; then
	force=1
	shift
fi
[[ $# -eq 1 ]] || {
	echo "usage: $0 [--force] <repo-root>" >&2
	exit 2
}
target="$(cd "$1" && pwd)"
skill="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
templates="$skill/templates"
skill_rel=.agents/skills/amp-cli-proxy-api
skill_dest="$target/$skill_rel"

files=(
	"agents/setup .agents/setup 755"
	"agents/resume .agents/resume 755"
	"agents/cliproxy-host .agents/cliproxy-host 755"
	"amp/services.yaml .amp/services.yaml 644"
	"amp/plugins/cliproxy-host-keepalive.ts .amp/plugins/cliproxy-host-keepalive.ts 644"
)

self_install=0
[[ "$(cd "$skill_dest" 2>/dev/null && pwd)" == "$skill" ]] && self_install=1

# Preflight: collect destinations whose existing content would be replaced.
conflicts=()
for spec in "${files[@]}"; do
	read -r src dest _ <<<"$spec"
	if [[ -e "$target/$dest" ]] && ! cmp -s "$templates/$src" "$target/$dest"; then
		conflicts+=("$dest")
	fi
done
if ((!self_install)) && [[ -e "$skill_dest" ]] && ! diff -rq "$skill" "$skill_dest" >/dev/null 2>&1; then
	conflicts+=("$skill_rel/")
fi
if ((${#conflicts[@]})) && ((!force)); then
	echo "These files already exist with different content and would be replaced:" >&2
	printf '  %s\n' "${conflicts[@]}" >&2
	echo "Nothing was changed. Merge them by hand, or rerun with --force after the user approves." >&2
	exit 3
fi

if ((self_install)); then
	echo "unchanged $skill_rel (running from it)"
elif [[ -e "$skill_dest" ]] && diff -rq "$skill" "$skill_dest" >/dev/null 2>&1; then
	echo "unchanged $skill_rel"
else
	rm -rf "$skill_dest"
	mkdir -p "$(dirname "$skill_dest")"
	cp -R "$skill" "$skill_dest"
	echo "wrote     $skill_rel"
fi

for spec in "${files[@]}"; do
	read -r src dest mode <<<"$spec"
	mkdir -p "$(dirname "$target/$dest")"
	if cmp -s "$templates/$src" "$target/$dest" 2>/dev/null; then
		chmod "$mode" "$target/$dest"
		echo "unchanged $dest"
	else
		install -m "$mode" "$templates/$src" "$target/$dest"
		echo "wrote     $dest"
	fi
done

gitignore="$target/.gitignore"
touch "$gitignore"
added=0
for entry in /src/ /bin/ /config.yaml /static/ /logs/ .amp/portals/; do
	if ! grep -qxF "$entry" "$gitignore"; then
		if ((added == 0)); then
			[[ -s "$gitignore" && -n "$(tail -c1 "$gitignore")" ]] && echo >>"$gitignore"
			echo "# amp-cli-proxy-api: CLIProxyAPI source, build output, and runtime state" >>"$gitignore"
		fi
		echo "$entry" >>"$gitignore"
		added=$((added + 1))
	fi
done
echo "gitignore: $added entries added"
