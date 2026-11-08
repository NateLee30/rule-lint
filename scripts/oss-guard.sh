#!/usr/bin/env bash
# oss-guard: block commits whose staged content, staged filenames, or commit
# message match any regex in a PRIVATE denylist that lives outside the repo.
#
#   Denylist: ${OSS_GUARD_DENYLIST:-$HOME/.config/oss-guard/denylist.txt}
#   Format:   one case-insensitive extended regex per line; '#' lines and blank lines ignored.
#
# Usage:
#   scripts/oss-guard.sh                 # check the staged index (pre-commit)
#   scripts/oss-guard.sh --message FILE  # check a commit message file (commit-msg)
#
# Privacy: this script never prints patterns or matched text. On a hit it reports
# only the file/line and the denylist LINE NUMBER, so the list can't leak via logs.
# It fails closed: a missing/empty/unreadable denylist or an invalid regex blocks the commit.
set -uo pipefail

DENYLIST="${OSS_GUARD_DENYLIST:-$HOME/.config/oss-guard/denylist.txt}"

die() { printf 'oss-guard: %s\n' "$*" >&2; exit 1; }

[ -f "$DENYLIST" ] && [ -r "$DENYLIST" ] || die "denylist not found or unreadable at $DENYLIST
  Refusing to commit (fail closed). Create it with one regex per line, or set OSS_GUARD_DENYLIST."

# Load patterns, remembering their line numbers in the denylist.
patterns=(); lines=(); n=0
while IFS= read -r raw || [ -n "$raw" ]; do
  n=$((n + 1))
  pat="${raw%$'\r'}"
  [[ "$pat" =~ ^[[:space:]]*(#|$) ]] && continue
  patterns+=("$pat"); lines+=("$n")
done < "$DENYLIST"
[ "${#patterns[@]}" -gt 0 ] || die "denylist at $DENYLIST has no patterns. Refusing to commit (fail closed)."

hits=0

# scan LABEL < input  (call with redirection, not a pipe, so $hits survives)
#  -> reports "LABEL:<lineno> matches denylist line N"
scan() {
  local label="$1" tmp i rc out
  tmp="$(mktemp)" || die "mktemp failed"
  cat > "$tmp"
  for i in "${!patterns[@]}"; do
    out="$(grep -a -i -E -n -e "${patterns[$i]}" -- "$tmp" 2>/dev/null)"; rc=$?
    if [ "$rc" -eq 2 ]; then rm -f "$tmp"; die "invalid regex on denylist line ${lines[$i]} (fail closed)."; fi
    if [ "$rc" -eq 0 ]; then
      while IFS=: read -r ln _; do
        printf 'oss-guard: %s:%s matches denylist line %s\n' "$label" "$ln" "${lines[$i]}" >&2
        hits=$((hits + 1))
      done <<< "$out"
    fi
  done
  rm -f "$tmp"
}

if [ "${1:-}" = "--message" ]; then
  [ -f "${2:-}" ] || die "--message needs a file"
  # Ignore git's comment lines in the message template.
  scan "commit message" < <(grep -v '^#' -- "$2")
else
  git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"
  while IFS= read -r -d '' f; do
    scan "filename '$f'" < <(printf '%s\n' "$f")
    scan "$f" < <(git show ":$f" 2>/dev/null)
  done < <(git diff --cached --name-only -z --diff-filter=ACMR)
fi

if [ "$hits" -gt 0 ]; then
  die "$hits denylist hit(s). Commit blocked. Rewrite the content; do not bypass with --no-verify."
fi
exit 0
