#!/bin/bash
set -euo pipefail

TARGET_WIDTH=1280
OUTPUT_DIR=""
SUFFIX=""
FORMAT=""
QUALITY=85
FORCE=false
INPUT_FILES=()

usage() {
  cat <<EOF
Usage: $(basename "$0") -i <pattern> [options]

Resize images proportionally to width=${TARGET_WIDTH}px.

Options:
  -i, --input <pattern>   Input glob pattern or file (can be used multiple times)
  -o, --output <dir>      Output directory (default: same as input)
  -s, --suffix <string>   Filename suffix before extension (e.g., "-resized")
  -f, --format <fmt>      Output format: jpeg, png, webp (default: same as input)
  -q, --quality <num>     Quality for jpeg/webp (1-100, default: 85)
  --force                 Overwrite existing files
  -h, --help              Show this help

Examples:
  $(basename "$0") -i "./icons/*.png" -o ./resized
  $(basename "$0") -i "*.jpg" -s "@1280" -f webp -q 80
  $(basename "$0") assets/screenshots/*   # Also works with positional args
EOF
  exit 0
}

# Check for ImageMagick
check_imagemagick() {
  if command -v magick &>/dev/null; then
    CONVERT="magick"
  elif command -v convert &>/dev/null; then
    CONVERT="convert"
  else
    echo "Error: ImageMagick not found. Install with: brew install imagemagick"
    exit 1
  fi
}

resize_image() {
  local input="$1"
  local output="$2"
  local format="$3"

  local args=("$input" -resize "${TARGET_WIDTH}x>")

  case $format in
    jpeg|jpg)
      args+=(-quality "$QUALITY" "jpeg:$output")
      ;;
    png)
      args+=(-quality 100 "$output")
      ;;
    webp)
      args+=(-quality "$QUALITY" "$output")
      ;;
    *)
      args+=("$output")
      ;;
  esac

  "$CONVERT" "${args[@]}"
}

main() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      -i|--input)
        INPUT_FILES+=("$2")
        shift 2
        ;;
      -o|--output)
        OUTPUT_DIR="$2"
        shift 2
        ;;
      -s|--suffix)
        SUFFIX="$2"
        shift 2
        ;;
      -f|--format)
        FORMAT="$2"
        shift 2
        ;;
      -q|--quality)
        QUALITY="$2"
        shift 2
        ;;
      --force)
        FORCE=true
        shift
        ;;
      -h|--help)
        usage
        ;;
      -*)
        echo "Unknown option: $1" >&2
        exit 1
        ;;
      *)
        # Positional argument - treat as input file
        INPUT_FILES+=("$1")
        shift
        ;;
    esac
  done

  if [[ ${#INPUT_FILES[@]} -eq 0 ]]; then
    echo "Error: No input files specified"
    usage
  fi

  check_imagemagick

  echo "Found ${#INPUT_FILES[@]} file(s) to process."
  echo

  local processed=0
  local skipped=0

  for file in "${INPUT_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
      echo "Skipping (not a file): $file"
      continue
    fi

    local dir output_name ext format out_ext output

    dir=$(dirname "$file")
    ext="${file##*.}"
    ext=$(echo "$ext" | tr '[:upper:]' '[:lower:]')

    output_name=$(basename "$file" ".$ext")
    format="${FORMAT:-$ext}"
    [[ "$format" == "jpg" ]] && format="jpeg"
    out_ext=$format
    [[ "$out_ext" == "jpeg" ]] && out_ext="jpg"

    if [[ -n "$OUTPUT_DIR" ]]; then
      output="$OUTPUT_DIR/${output_name}${SUFFIX}.${out_ext}"
    else
      output="$dir/${output_name}${SUFFIX}.${out_ext}"
    fi

    echo "Processing: $file"

    # Skip if output exists and not forcing
    if [[ "$FORCE" != true && -f "$output" ]]; then
      local input_abs output_abs
      input_abs=$(cd "$(dirname "$file")" && pwd)/$(basename "$file")
      output_abs=$(cd "$(dirname "$output")" 2>/dev/null && pwd)/$(basename "$output") 2>/dev/null || true
      if [[ "$input_abs" != "$output_abs" ]]; then
        echo "  Skipping (output exists): $output"
        ((skipped++)) || true
        continue
      fi
    fi

    # Create output directory if needed
    if [[ -n "$OUTPUT_DIR" && ! -d "$OUTPUT_DIR" ]]; then
      mkdir -p "$OUTPUT_DIR"
    fi

    if resize_image "$file" "$output" "$format"; then
      echo "  → $output"
      ((processed++)) || true
    else
      echo "  Error: Failed to resize"
    fi
  done

  echo
  echo "Done. $processed resized, $skipped skipped."
}

main "$@"
