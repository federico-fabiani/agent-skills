---
name: gemini-transcribe
description: Transcribe audio/video files to text with a Google Gemini multimodal model via a zero-dependency Node script. Use whenever the user asks to transcribe, transcribe-to-text, "what was said", get a transcript / verbatim of a recording, or turn a call/meeting/interview/lecture/voice-note audio into text.
metadata:
  author: federico-fabiani
  version: "1.0.0"
---

# Gemini-Transcribe — audio → testo

Anna una registrazione audio/video a un **modello multimodale Gemini** e gli chiede (via prompt) la sola trascrizione. Niente SDK: `Node 18+` + `ffprobe`/`ffmpeg`, chiamata REST diretta a `:generateContent`. Script accanto a questo file: `scripts/transcribe.mjs`. Approfondimenti per umani: `README.md`; qui sotto gli effetti.

> **Output path**: se l'utente **non** specifica dove salvare, scegli tu il percorso più appropriato (di solito nella cartella del progetto/audio) e passalo con `--out`; se non ce n'è uno ovvio, usa il default dello script (`<audio>.txt` accanto alla sorgente).

> **Uso diretto**: chiama direttamente `scripts/transcribe.mjs` senza rileggere lo script né riscriverne il contenuto. Rileggilo o modificalo **solo** se compare un errore da diagnosticare.

> **Come funziona**: Gemini non ha un endpoint né un modello dedicati alla trascrizione — l'audio è solo una *modalità* di un generico modello multimodale. **È il prompt a fare tutto il lavoro**: dai il contesto, chiedi esplicitamente che l'output sia **solo** la trascrizione verbatim e, solo se l'utente lo chiede, la **diarizzazione**.

## 0. Prima di lanciare — CHIEDI (sempre, un solo giro)

`--prompt`, `--diarize` e `--language` sono **opzionali**, non inventarli:
- Chiedi se vuole specificare **`--prompt`** (contesto della registrazione: argomento, nomi, setting, termini attesi), **`--diarize`** (separare i parlanti, solo se sono più d'uno) e **`--language`** (lingue attese).

Se non risponde, **non** aggiungere nulla di inventato. Di default il prompt chiede solo la trascrizione verbatim, senza diarizzazione.

## 1. Uso base

```bash
# --out esplicito: transcript dove dici tu
$G/scripts/transcribe.mjs --audio /percorso/registrazione.m4a --out ./out/registrazione.txt
```

`$G` = percorso assoluto di questa cartella skill (normalmente `~/.agents/skills/gemini-transcribe`). Se l'utente **non** indica l'output, scegli tu il path più sensato (es. accanto all'audio o nella cartella del progetto) e fallo con `--out`; se non ne trovi uno ovvio, usa il default dello script (`<audio>.txt`).

Con contesto / diarizzazione (solo se l'utente li ha chiesti):

```bash
$G/scripts/transcribe.mjs --audio call.m4a \
  --prompt "Chiamata di assistenza su piano premium, account AC-42." \
  --diarize --language it
```

## 2. Modelli — scegli consapevolmente

| Modello | Uso consigliato | Input $/1M tok | Audio $/min |
|---|---|---|---|
| **`gemini-3.5-flash-lite`** (default) | Trascrizione di routine, bulk, voice-note veloci; il più economico | $0.30 | **$0.00058** |
| `gemini-3.5-flash` | Quando lite non basta: audio lungo, lessico tecnico, più precisione | $1.50 | $0.00288 |
| `gemini-3.6-flash` | Flash di generazione precedente, buon equilibrio costo/qualità | $0.75 | $0.00144 |
| `gemini-3.7-flash` | Flash veloce per coding/agentic; ok per trascrizioni | $0.75 | $0.00144 |
| `gemini-3.8-flash` | Il Flash più intelligente; per audio limitati e contesto difficile | $0.75 | $0.00144 |

> **Audio $/min** = 1920 token/min (32 token/sec di audio) × input $/1M. **L'output** (il transcript) è fatturato **a parte** come token di testo (~$2.50/1M per lite, $9.00/1M per 3.5-flash, $3.75/1M per 3.6/3.7/3.8): aggiunge ~$0.0005–$0.002/min, trascurabile rispetto all'audio.
>
> Nota: `gemini-3.6/3.7/3.8-flash` raddoppiano a **$1.50** (input) dal **1 gen 2027** → audio $0.00288/min.

**Default: `gemini-3.5-flash-lite`.** Sali di modello solo se la qualità non basta, mai per riflesso: flash-lite è genuinamente ok per la maggior parte delle trascrizioni. In caso di dubbi, inizia da lite e riprova l'eventuale trascrizione problematica su uno dei modelli superiori.

## 3. Durata, taglio e silenzi

- **Massimo per prompt: 9,5 ore di audio** (documentato). Sotto c'è anche un **cap per-request inline (~18 MB)**.
- Quando serve, lo script:
  1. **ri-encoda** in mono 16 kHz (MP3 64 kbps);
  2. **taglia in chunk cortati sui silenzi più lunghi** (mai a metà parola), uno per richiesta;
  3. concatena i transcript nella stessa cavata di output.
- `--max-minutes N` forza comunque un taglio anticipato (utile per file lunghi ma sotto il byte-limit, o per non perdere contesto). Se possibile, evita di tagliare a metà frase — il taglio ai silenzi fa questo.
- Per **file video** (`.mp4`, `.mov`, `.mkv`, …) lo script **estrae la traccia audio** e procede.
- Se vuoi sentire la qualità su un campione prima di batch grandi, testa su un pezzo rappresentativo.

## 4. Costo

- Vedi tabella §2: **audio $/min** per modello (escluso output). Lo script stampa la stima a fine run.
- **Testa prima su un campione rappresentativo** prima di spostare file di produzione.

## 5. Prima di consegnare — controlla

- **Leggi il transcript** e verifica che nomi/acronimi/date siano sensati. Se sbagliati, riprova aggiungendo `--prompt` / `--diarize` (più economico che insistere).
- Se hai chiesto la **diarizzazione**, verifica che i turni `Speaker N:` siano coerenti (un modello può fondere o inventare parlanti; se l'audio è a un solo parlante, i label vanno tolti).

## 6. Troubleshooting

- `API key not valid` / HTTP 401/403 → chiave errata/manomossa (`GEMINI_API_KEY` o `GOOGLE_API_KEY`).
- HTTP 400 → MIME/estensione non supportata, o modello inesistente (controlla il nome in §2).
- HTTP 429 → quota/rate limit → backoff e riprova (controlla https://aistudio.google.com).
- `no transcript (finishReason: ...)` → blocco di sicurezza o prompt letto come testo; riformula.
- Tool mancanti? Servono `node 18+`, `ffprobe`, `ffmpeg`.
- **Windows**: girano nativamente — niente WSL/Git Bash, basta Node.
