# Gemini-Transcribe — trascrizione audio

Skill che trascrive un file audio/video in testo usando un **modello multimodale Gemini**.
Chiama direttamente `POST /v1beta/models/{model}:generateContent` con `fetch` (niente SDK).
Servono solo `Node 18+`, `ffprobe` e `ffmpeg`.

- **Script:** `scripts/transcribe.mjs`
- **Istruzioni per l'agente:** `SKILL.md`

> **Come funziona:** Gemini non ha un endpoint né un modello dedicati alla trascrizione — l'audio è solo una *modalità* di un generico modello multimodale. **È il prompt a fare tutto il lavoro**: dai il contesto, chiedi esplicitamente "output solo la trascrizione verbatim" e, se richiesto, la **diarizzazione**.

---

## 1. Requisiti

| Strumento | Uso |
|---|---|
| `Node 18+` | runtime, `fetch` nativo |
| `ffprobe` | durata del file |
| `ffmpeg` | ri-encoding, estrazione audio da video, rilevamento silenzi |

La chiave si legge da `GEMINI_API_KEY` (o `GOOGLE_API_KEY`), mai stampata. Se manca lo script esce con codice `2`.

> **Formati audio supportati:** `mp3`, `wav`, `aiff`, `aac`, `ogg`, `flac`, `m4a`, `m4b`, `l16`, `opus`, `amr`. **Contenitori video supportati** (ne viene estratta la traccia audio): `mp4`, `mov`, `m4v`, `webm`, `mkv`, `avi`, `wmv`, `mpg`, `mpeg`, `3gp`, `ts`.

---

## 2. Uso

```bash
# base
node scripts/transcribe.mjs --audio riunione.m4a

# con contesto, diarizzazione e lingua
node scripts/transcribe.mjs --audio call.m4a \
  --prompt "Chiamata di assistenza su piano premium, account AC-42." \
  --diarize --language it
```

Il **trafiletto `.txt`** è il transcript. Con `--json` accanto vengono salvati i **JSON grezzi** per ogni chunk (`.partNN.json`).

---

## 3. Opzioni

| Opzione | Descrizione |
|---|---|
| `--audio FILE` | (obbligatoria) file di input |
| `--prompt TEXT` | contesto libero (argomento, nomi, setting, termini attesi). Va **nel prompt** — è il modo in cui Gemini riceve il contesto |
| `--diarize` | chiede la **diarizzazione** (`Speaker 1:`, `Speaker 2:`… per turno). Solo utile con più parlanti |
| `--language CODE` | lingue attese (ripetibile), hint nel prompt |
| `--model NAME` | override del modello (vedi §4) |
| `--max-minutes N` | forza il taglio in chunk da N minuti (default: automatico quando serve) |
| `--out FILE` | file del transcript (default: `<audio>.txt`) |
| `--json` | salva il JSON grezzo di ogni chunk |
| `--silence-db NUM` | soglia del rilevatore di silenzi in dB (default: `-30`) |
| `--silence-sec NUM` | durata minima di silenzio per essere un punto di taglio (default: `0.8`) |

### Contesto e qualità

Il prompt di base chiede già: trascrivi **verbatim**, output **solo** la trascrizione (niente commenti, heading, timestamp, note). Aggiungi `--prompt` per contesto, `--language` per la lingua, `--diarize` per i parlanti. Non esistono parametri dedicati: tutto il contesto va nel prompt (`--prompt`) e i termini attesi sono *hint*, non output garantito.

---

## 4. Modelli e prezzi

Audio fatturato **a token**: **32 token/sec di audio** = **1.920 token/minuto** (docs audio). Il costo audio/min derivi dal prezzo **input** del modello (per flash-lite la riga dice esplicitamente "text / image / video / audio").

| Modello | Uso consigliato | Input $/1M | **Audio $/min** | Output $/1M |
|---|---|---|---|---|
| **`gemini-3.5-flash-lite`** (default) | routine, bulk, voice-note | $0.30 | **$0.00058** | $2.50 |
| `gemini-3.5-flash` | lite non basta, lessico tecnico | $1.50 | $0.00288 | $9.00 |
| `gemini-3.6-flash` | Flash gen. precedente, buon equilibrio | $0.75 | $0.00144 | $3.75 |
| `gemini-3.7-flash` | Flash veloce per coding/agentic | $0.75 | $0.00144 | $3.75 |
| `gemini-3.8-flash` | Flash più intelligente | $0.75 | $0.00144 | $3.75 |

Calcolo: `1920 token/min × (input $/1M) ÷ 1.000.000`.

- **Output** (il transcript) è fatturato **a parte** come testo: ~$0.0005–$0.002/min aggiuntivi secondo il modello (`~200 token/min di parlato`). Trascurabile rispetto all'audio.
- **Aggiornamento prezzi:** `gemini-3.6/3.7/3.8-flash` raddoppiano l'input da **$0.75 → $1.50** e l'output da **$3.75 → $7.50** dal **1 gen 2027** → audio $0.00288/min.

Lo script stampa la **stima del costo** a fine run (basata sulla durata audio e sul modello). Se il modello non è nella mappa prezzi, avvisa e non stima.

---

## 5. Limiti di durata e taglio del file

| Vincolo | Valore |
|---|---|
| **Max durata per prompt** | **9,5 ore** di audio |
| **Dimensione inline** | **~18–20 MB** per richiesta |
| **Risoluzione** | downsampled a 16 kbps; multi-canale → mono |

Quando il file supera il limite (byte *o* durata), lo script:

1. **ri-encoda** in MP3 mono 16 kHz (~64 kbps);
2. **taglia in chunk cortati sui silenzi più lunghi** (mai a metà parola), uno per richiesta;
3. concatena i transcript nella stessa cavata (JSON grezzi come `.partNN.json`).

`--max-minutes N` forza comunque il taglio. Se non ci sono silenzi abbastanza lunghi, lo script taglia comunque a intervalli di tempo (evita di rompere parole dove possibile, ma non può separare un parlato continuo).

---

## 6. Output

L'output è un file `.txt`. Specifica un path con `--out`; se lo ometti lo script scrive `<audio>.txt` accanto alla sorgente. Con `--json` viene salvato anche il JSON grezzo di ogni chunk (`<nome>.partNN.json`).

---

## 7. Troubleshooting

| Errore | Causa / rimedio |
|---|---|
| `API key not valid` (401/403) | chiave errata. Ricontrolla `GEMINI_API_KEY`/`GOOGLE_API_KEY` |
| `HTTP 400` | MIME/estensione non supportata, o nome modello sbagliato → vedi §4 |
| `HTTP 429` | quota/rate limit → backoff e riprova; controlla https://aistudio.google.com |
| `no transcript (finishReason: …)` | blocco di sicurezza o prompt letto come puro testo → riformula |
| `cannot determine MIME type` | estensione non supportata → converti il file |
| tool mancante | installa `node 18+`, `ffmpeg` (incl. `ffprobe`) |

---

## 8. Verifica prima di consegnare

- Rileggi il transcript: nomi, acronimi, date e numeri devono tornare. Se sbagliati, riprova aggiungendo `--prompt` / `--diarize`.
- Se hai chiesto la diarizzazione, controlla che i `Speaker N:` siano coerenti; con un solo parlante, rimuovi i label se compaiono.
- Scegli il modello in base a costo/qualità (parti da lite, scala se serve).
