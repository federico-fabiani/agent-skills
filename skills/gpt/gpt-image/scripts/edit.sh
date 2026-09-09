#!/usr/bin/env bash
# edit.sh — edit, combine or reference one or more images with GPT Image 2.5.
# Uses the OpenAI Images API: POST /v1/images/edits (multipart/form-data)
set -euo pipefail

MODEL=${GPT_IMAGE_MODEL:-gpt-image-2.5-sunburst}
SIZE=${GPT_IMAGE_SIZE:-1024x1024}
QUALITY=${GPT_IMAGE_QUALITY:-auto}
FORMAT=${GPT_IMAGE_FORMAT:-png}
BACKGROUND=auto
COUNT=1
OUT=""
PROMPT=""
MASK=""
IMAGES=()

usage() {
  cat <<'EOF'
Usage: edit.sh --prompt "TEXT" --image FILE [--image FILE ...] [options]

Edit, combine or reference one or more images with GPT Image 2.5.

Required:
  --prompt TEXT        The instruction (quote it).
  --image FILE         An input image. Repeat for multiple references.

Options:
  --mask FILE          Optional mask (white = edit, black = keep).
  --model NAME         Default gpt-image-2.5-sunburst (gpt-image-2.5-flare also available)
  --size WxH           1024x1024 | 1536x1024 | 1024x1536 | custom WxH (mult. of 16)
  --quality LVL        auto | low | medium | high | xhigh | max
  --format FMT         png | jpeg | webp
  --compression 0-100  Only for jpeg/webp
  --background MODE    auto | opaque | transparent
  --count N            Number of results (default 1)
  --out FILE           Output file/path. Default gpt-<timestamp>.<fmt>
  --help

The API key is read from OPENAI_API_KEY (must be set).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt) PROMPT="$2"; shift 2;;
    --image|-i) IMAGES+=("$2"); shift 2;;
    --mask) MASK="$2"; shift 2;;
    --model) MODEL="$2"; shift 2;;
    --size) SIZE="$2"; shift 2;;
    --quality) QUALITY="$2"; shift 2;;
    --format) FORMAT="$2"; shift 2;;
    --compression) COMPRESSION="$2"; shift 2;;
    --background) BACKGROUND="$2"; shift 2;;
    --count|-n) COUNT="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    --help) usage; exit 0;;
    *) echo "Unknown option: $1" >&2; usage; exit 1;;
  esac
done

[[ -z "$PROMPT" ]] && { echo "ERROR: --prompt is required" >&2; usage; exit 1; }
[[ ${#IMAGES[@]} -eq 0 ]] && { echo "ERROR: at least one --image is required" >&2; usage; exit 1; }
[[ -z "${OPENAI_API_KEY:-}" ]] && { echo "ERROR: OPENAI_API_KEY is not set." >&2; exit 2; }
[[ "$COUNT" =~ ^[0-9]+$ && "$COUNT" -ge 1 ]] || { echo "ERROR: --count must be a positive integer" >&2; exit 1; }
for t in curl jq base64; do command -v "$t" >/dev/null || { echo "ERROR: missing tool: $t" >&2; exit 1; }; done
for im in "${IMAGES[@]}"; do
  [[ -f "$im" ]] || { echo "ERROR: image not found: $im" >&2; exit 1; }
done
[[ -n "$MASK" && ! -f "$MASK" ]] && { echo "ERROR: mask not found: $MASK" >&2; exit 1; }

args=(-sS -X POST "https://api.openai.com/v1/images/edits")
args+=(-H "Authorization: Bearer $OPENAI_API_KEY")
args+=(-F "model=$MODEL" -F "prompt=$PROMPT" -F "size=$SIZE" -F "quality=$QUALITY")
args+=(-F "output_format=$FORMAT" -F "background=$BACKGROUND" -F "n=$COUNT")
for im in "${IMAGES[@]}"; do args+=(-F "image[]=@$im"); done
[[ -n "$MASK" ]] && args+=(-F "mask=@$MASK")
[[ -n "${COMPRESSION:-}" ]] && args+=(-F "output_compression=$COMPRESSION")

resp=$(curl "${args[@]}" -w "\n%{http_code}")
body=$(echo "$resp" | sed '$d')
code=$(echo "$resp" | tail -n1)

if [[ "$code" != "200" ]]; then
  echo "ERROR: HTTP $code" >&2
  echo "$body" >&2
  exit 1
fi
if ! echo "$body" | jq -e '.data[0].b64_json' >/dev/null 2>&1; then
  echo "ERROR: no image data in response" >&2
  echo "$body" >&2
  exit 1
fi

i=0
while IFS= read -r -d '' b64; do
  i=$((i+1))
  if [[ "$COUNT" -eq 1 ]]; then
    name="${OUT:-gpt-$(date +%Y%m%d-%H%M%S).$FORMAT}"
  else
    base="${OUT:-gpt-$(date +%Y%m%d-%H%M%S)}"
    name="$base-$i.$FORMAT"
  fi
  if [[ "$name" == */* ]]; then mkdir -p "$(dirname "$name")"; fi
  printf '%s' "$b64" | tr -d '\r' | base64 --decode > "$name"
  case "$name" in /*) abs="$name";; *) abs="$(pwd)/$name";; esac
  echo "saved: $abs"
done < <(echo "$body" | jq -j '.data[] | .b64_json, "\u0000"')
