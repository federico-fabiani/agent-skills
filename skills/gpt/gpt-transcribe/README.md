# GPT-Transcribe — trascrizione audio

Skill che trascrive un file audio/video in testo usando **`gpt-transcribe`** di OpenAI.
Chiama direttamente `POST /v1/audio/transcriptions` con `curl` (niente SDK). Non serve altro oltre a `curl`, `jq`, `ffmpeg`/`ffprobe`.

- **Script:** `scripts/transcribe.sh`
- **Istruzioni per l'agente:** `SKILL.md`

---

## 1. Requisiti

| Strumento | Uso |
|---|---|
| `curl` | chiamata HTTP multipart all'API |
| `jq` | estrazione del testo dal JSON di risposta |
| `ffprobe` | durata del file |
| `ffmpeg` | ri-encoding / taglio dei file oltre il limite |

La chiave API si legge da `OPENAI_API_KEY` (non viene mai stampata). Se manca lo script esce con codice `2`.

> **Formati input supportati:** `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm`.

---

## 2. Uso

```bash
# base
./scripts/transcribe.sh --audio riunione.wav

# con contesto e lingua
./scripts/transcribe.sh --audio call.mp3 \
  --prompt "Chiamata di assistenza su piano premium, account AC-42." \
  --keyword "AC-42" \
  --language it --language en
```

Il **trafiletto `.txt`** è il transcript. Se `--response-format` non è `text`, accanto viene salvato anche il **JSON grezzo** (con `languages`, `segments`, `usage`).

---

## 3. Opzioni

| Opzione | Descrizione |
|---|---|
| `--audio FILE` | (obbligatoria) file di input |
| `--prompt TEXT` | contesto libero sulla registrazione (argomento, setting, nomi) |
| `--keyword TERM` | termine letterale atteso (ripetibile); è un *hint*, non un output garantito |
| `--language CODE` | lingue attese (ripetibile). Per `gpt-transcribe` **sostituisce** il campo singolo `language` |
| `--model NAME` | override del modello |
| `--response-format FMT` | `json` (default) · `text` · `verbose_json` |
| `--flex` | richiede il flex tier — **non supportato** dalla trascrizione (vedi §7) |
| `--stream` | mostra il testo parziale in live, poi salva il transcript completo |
| `--max-minutes N` | forza il taglio in chunk da N minuti (default: automatico solo oltre 24 MB) |
| `--out FILE` | file di output del transcript (default: `<audio>.txt`) |

### Lingue supportate

Codici ISO 639-1 (`en`, `es`, `fr`, `it`…), alcuni ISO 639-3 (`eng`, `spa`, `yue`, `cmn`) e varianti regionali `zh` (`zh-cn`, `zh-tw`, `zh-hk`). Codici non validi → richiesta rifiutata.

---

## 4. Limiti di durata e taglio del file

| Vincolo | Valore |
|---|---|
| **Dimensione upload** | **25 MB** |
| **Durata** | nessun limite separato documentato (la **fatturazione è per minuto**) |
| **Prezzo** | `$0.0045 / minuto` |

Quando il file supera ~**24 MB** lo script:

1. lo **ri-encoda** in MP3 mono 16 kHz (~64 kbps);
2. se ancora sopra soglia, lo **taglia** in chunk, uno per richiesta;
3. concatena i transcript nella stessa cavata di output (i JSON grezzi sono salvati come `.partNN.json`).

`--max-minutes N` forza comunque il taglio (utile per file lunghi ma sotto il byte-limit, ad es. per non perdere contesto tra spezzoni). Se posso, evita di tagliare a metà frase.

---

## 5. Contesto e qualità

`gpt-transcribe` accetta tre tipi di contesto (tutti opzionali):

- **`prompt`** — contesto libero (argomento, nomi di prodotto, numeri di conto, formattazione).
- **`keywords`** — termini **letterali** che ti aspetti di sentire. Sono *hint*: restano nel transcript solo se davvero pronunciati.
- **`languages`** — lingue attese, per audio multilingua o code-switching.

Scrivili solo se rilevanti. L'API rifiuta l'intera richiesta se `prompt` eccede il limite di lunghezza del modello o se una keyword contiene `<`, `>`, un a-capo o un carriage return → tieni ogni keyword su una riga, pulita.

---

## 6. Output

L'output del transcript è un file `.txt`. Specifica un path esplicito con `--out`; se lo ometti, lo script scrive `<audio>.txt` accanto al file sorgente. Se `--response-format` non è `text`, viene salvato anche il JSON grezzo accanto al `.txt`.

---

## 7. Flex tier

**Il flex tier NON è disponibile per la trascrizione audio.** Flex (`service_tier: flex`) è documentato solo per **Responses / Chat Completions** e la tabella prezzi flex non elenca modelli di trascrizione. Non inviare `service_tier` a `/v1/audio/transcriptions`: non serve e non dà sconto. Il flag `--flex` esiste per chiarezza: lo script avvisa e prosegue con processing standard.

---

## 8. Troubleshooting

| Errore | Causa / rimedio |
|---|---|
| `HTTP 401` | chiave errata. Ricontrolla `OPENAI_API_KEY` |
| `HTTP 400` | `languages` non valido, `prompt` troppo lungo, o keyword con `<`, `>`, CR/LF |
| `HTTP 429` | quota/rate limit → backoff e ripeti |
| tool mancante | installa `curl jq ffmpeg` (Git Bash / MSYS2) |

---

## 9. Verifica prima di consegnare

- Rileggi il transcript: nomi, acronimi, date e numeri devono tornare.
- Se sbagliati, riprova aggiungendo `--prompt` / `--keyword` (più efficace che riprovare a vuoto).
- Controlla il campo `languages` nel JSON se la lingua non era nota.
