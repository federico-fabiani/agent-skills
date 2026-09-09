#!/usr/bin/env bash
# transcribe.sh — transcribe an audio file with OpenAI gpt-transcribe.
#
# Endpoint: POST /v1/audio/transcriptions  (multipart/form-data)
# Model:    gpt-transcribe
#
# Upload limit: 25 MB. Files over the limit are re-encoded to mono 16 kHz MP3 and,
# if still too big, split into chunks under the limit (see --max-minutes).
#
# Requires: curl, jq, ffprobe, ffmpeg. The API key is read from OPENAI_API_KEY.
set -euo pipefail

# --- defaults ----------------------------------------------------------------
MODEL=${GPT_TRANSCRIBE_MODEL:-gpt-transcribe}
RESPONSE_FORMAT=${GPT_TRANSCRIBE_FORMAT:-json}
PROMPT=""
KEYWORDS=()
LANGUAGES=()
OUT=""
INPUT=""
FLEX=0
STREAM=0
MAX_MINUTES=0
SAFE_LIMIT=$((24*1024*1024))   # 24 MB, a safe margin under the 25 MB limit

usage() {
  cat <<'EOF'
Usage: transcribe.sh --audio FILE [options]

Transcribe an audio file with OpenAI gpt-transcribe.

Required:
  --audio FILE           Path to the audio file (mp3, mp4, mpeg, mpga, m4a, wav, webm).

Optional:
  --prompt TEXT          Free-form context about the recording (topic, setting, names).
  --keyword TERM        Literal term you expect to hear (repeatable).
  --language CODE       Expected language code, e.g. en, fr, eng, yue, zh-cn (repeatable).
  --model NAME          Override the model.
  --response-format FMT json (default) | text | verbose_json.
  --flex                Request the flex tier. NOTE: flex is NOT supported by the
                        audio/transcriptions endpoint, so this is a no-op (warned).
  --stream              Stream partial text live to stdout, then save the full transcript.
  --max-minutes N       Force splitting into N-minute chunks (default off; splitting is
                        automatic only when the file exceeds ~24 MB).
  --out FILE            Output transcript file. Default: <audio>.txt .
  --help

The output .txt file is the plain transcript; when response_format is not "text" the raw
JSON (languages, segments, usage) is also saved next to it.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --audio) INPUT="$2"; shift 2;;
    --prompt) PROMPT="$2"; shift 2;;
    --keyword) KEYWORDS+=("$2"); shift 2;;
    --language) LANGUAGES+=("$2"); shift 2;;
    --model) MODEL="$2"; shift 2;;
    --response-format) RESPONSE_FORMAT="$2"; shift 2;;
    --flex) FLEX=1; shift;;
    --stream) STREAM=1; shift;;
    --max-minutes) MAX_MINUTES="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    --help) usage; exit 0;;
    *) echo "Unknown option: $1" >&2; usage; exit 1;;
  esac
done

# --- validation --------------------------------------------------------------
[[ -n "$INPUT" ]] || { echo "ERROR: --audio is required" >&2; usage; exit 1; }
[[ -f "$INPUT" ]] || { echo "ERROR: file not found: $INPUT" >&2; exit 1; }
[[ -n "${OPENAI_API_KEY:-}" ]] || { echo "ERROR: OPENAI_API_KEY is not set." >&2; exit 2; }
for t in curl jq ffprobe ffmpeg; do
  command -v "$t" >/dev/null || { echo "ERROR: missing tool: $t" >&2; exit 1; }
done
[[ "$MAX_MINUTES" =~ ^[0-9]+$ ]] || { echo "ERROR: --max-minutes must be an integer" >&2; exit 1; }

# --- probe -------------------------------------------------------------------
DURATION=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$INPUT" 2>/dev/null | cut -d. -f1)
DURATION=${DURATION:-0}
SIZE=$(wc -c < "$INPUT")
fmt_dur(){ printf '%dm %02ds' $(( $1/60 )) $(( $1%60 )); }
echo "Input : $INPUT"
echo "Size  : $(numfmt --to=iec "$SIZE") ($SIZE bytes)   Duration: $(fmt_dur "$DURATION")"

# --- flex tier notice (not supported for transcription) ----------------------
if [[ "$FLEX" == 1 ]]; then
  echo "NOTE: the flex tier is not available on /v1/audio/transcriptions." >&2
  echo "      Flex is only supported on Responses / Chat Completions; using standard processing." >&2
fi

# --- prepare audio: re-encode / split when over the limit ---------------------
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT
FILES=()

need_split=0
if (( SIZE > SAFE_LIMIT )); then need_split=1; fi
if (( MAX_MINUTES > 0 )); then need_split=1; fi

if (( need_split )); then
  BR=64000                       # mono 16 kHz MP3 @64 kbps -> ~8000 B/s
  BYTES_PER_SEC=$((BR/8))
  CHUNK_SEC=$((SAFE_LIMIT / BYTES_PER_SEC))         # ~51 min per chunk
  if (( MAX_MINUTES > 0 )); then
    M=$((MAX_MINUTES*60)); (( M < CHUNK_SEC )) && CHUNK_SEC=$M
  fi
  # margin so a chunk never exceeds the byte limit
  CHUNK_SEC=$(( CHUNK_SEC * 85 / 100 ))
  echo "Over/forced limit -> re-encoding to mono 16 kHz MP3 and splitting into ~$(fmt_dur "$CHUNK_SEC") chunks."
  ffmpeg -y -v error -i "$INPUT" -ac 1 -ar 16000 -b:a "${BR}" \
    -f segment -segment_time "$CHUNK_SEC" -reset_timestamps 1 \
    "$TMPDIR/part%03d.mp3" </dev/null || { echo "ERROR: ffmpeg failed" >&2; exit 1; }
  shopt -s nullglob
  for f in "$TMPDIR"/part*.mp3; do FILES+=("$f"); done
  shopt -u nullglob
else
  FILES=("$INPUT")
fi

# --- per-file cost / helpers -------------------------------------------------
COST_PER_MIN=0.0045
TOTAL_SEC=0

extract_text() {   # $1 = body, $2 = format
  if [[ "$2" == "text" ]]; then
    printf '%s' "$1"
  else
    printf '%s' "$1" | jq -r '.text // empty'
  fi
}

# --- transcribe --------------------------------------------------------------
OUT=${OUT:-"${INPUT%.*}.txt"}
JSON_OUT=""
JSON_OUTS=()
: > "$OUT"                     # reset output

TOTAL_PARTS=${#FILES[@]}
PART=0
for f in "${FILES[@]}"; do
  PART=$((PART+1))
  size=$(wc -c < "$f")
  dur=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$f" 2>/dev/null | cut -d. -f1)
  dur=${dur:-0}
  TOTAL_SEC=$((TOTAL_SEC + dur))

  echo "-> Transcribing [$PART/$TOTAL_PARTS] $(basename "$f") (~$(fmt_dur "$dur"), $size bytes) ..." >&2

  form=(-F "file=@$f" -F "model=$MODEL" -F "response_format=$RESPONSE_FORMAT")
  [[ -n "$PROMPT" ]] && form+=(-F "prompt=$PROMPT")
  for kw in "${KEYWORDS[@]}"; do form+=(-F "keywords[]=$kw"); done
  for lg in "${LANGUAGES[@]}"; do form+=(-F "languages[]=$lg"); done

  if [[ "$STREAM" == 1 ]]; then
    text=""
    while IFS= read -r line; do
      [[ "$line" == data:* ]] || continue
      payload=${line#data: }
      type=$(printf '%s' "$payload" | jq -r '.type // empty' 2>/dev/null || true)
      if [[ "$type" == "transcript.text.delta" ]]; then
        printf '%s' "$(printf '%s' "$payload" | jq -r '.delta // ""')" >&2
      elif [[ "$type" == "transcript.text.done" ]]; then
        text=$(printf '%s' "$payload" | jq -r '.text // ""')
      fi
    done < <(curl -sS -N --max-time 10800 -X POST "https://api.openai.com/v1/audio/transcriptions" \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      "${form[@]}" -F "stream=true")
    echo "" >&2
  else
    resp=$(curl -sS -w "\n%{http_code}" --max-time 10800 -X POST "https://api.openai.com/v1/audio/transcriptions" \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      "${form[@]}")
    body=$(printf '%s' "$resp" | sed '$d')
    code=$(printf '%s' "$resp" | tail -n1)
    if [[ "$code" != "200" ]]; then
      echo "ERROR: HTTP $code" >&2
      echo "$body" >&2
      exit 1
    fi
    text=$(extract_text "$body" "$RESPONSE_FORMAT")
    if [[ "$RESPONSE_FORMAT" != "text" ]]; then
      if (( TOTAL_PARTS > 1 )); then
        JSON_OUT="${OUT%.txt}.part$(printf %02d "$PART").json"
      else
        JSON_OUT="${OUT%.txt}.json"
      fi
      [[ "$PART" -gt 1 ]] && JSON_OUTS+=("$JSON_OUT")
      printf '%s\n' "$body" > "$JSON_OUT"
    fi
  fi

  printf '%s\n' "$text" >> "$OUT"
done

# summarise raw JSON files
if (( ${#JSON_OUTS[@]} > 0 )); then
  echo "Raw JSON   : ${JSON_OUTS[*]}" >&2
elif [[ "$RESPONSE_FORMAT" != "text" && "$STREAM" != 1 ]]; then
  echo "Raw JSON   : ${OUT%.txt}.json" >&2
fi

echo "--- done ---" >&2
echo "Transcript : $OUT" >&2
cost=$(awk -v s="$TOTAL_SEC" -v r="$COST_PER_MIN" 'BEGIN{printf "%.4f", s/60*r}')
echo "Duration   : $(fmt_dur "$TOTAL_SEC")   Est. cost: \$$cost" >&2
