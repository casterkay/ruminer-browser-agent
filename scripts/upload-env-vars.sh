#!/usr/bin/env bash
set -euo pipefail

cd landing-page

ENV_FILE=".env.local"
TARGETS=(production preview)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

strip_outer_quotes() {
  local value="$1"

  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi

  printf '%s' "$value"
}

for target in "${TARGETS[@]}"; do
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip blank lines and full-line comments.
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

    # Support optional `export KEY=value` syntax.
    if [[ "$line" =~ ^[[:space:]]*export[[:space:]]+ ]]; then
      line="${line#*export }"
    fi

    # Skip malformed lines.
    [[ "$line" != *=* ]] && continue

    key="${line%%=*}"
    value="${line#*=}"

    # Trim whitespace from key only.
    key="${key//[[:space:]]/}"
    [[ -z "$key" ]] && continue

    value="$(strip_outer_quotes "$value")"

    echo "Uploading $key to $target"
    printf '%s' "$value" | vercel env add "$key" "$target" --force
  done < "$ENV_FILE"
done