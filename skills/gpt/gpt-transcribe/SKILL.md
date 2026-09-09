---
name: gpt-transcribe
description: Transcribe audio/video files to text with OpenAI gpt-transcribe via a shell script. Use whenever the user asks to transcribe, transcribe-to-text, "what was said", get a transcript / verbatim of a recording, or turn a call/meeting/interview/lecture audio into text.
metadata:
  author: federico-fabiani
  version: "1.0.0"
---

# GPT-Transcribe — audio → testo

Chiama `POST /v1/audio/transcriptions` con `model=gpt-transcribe`. Solo `curl`+`jq`+`ffmpeg`/`ffprobe`, nessun SDK. Script accanto a questo file: `scripts/transcribe.sh`. Approfondimenti per umani: `README.md`; qui sotto gli effetti.

> **Output path**: se l'utente **non** specifica dove salvare, scegli tu il percorso più appropriato (di solito nella cartella del progetto/audio) e passalo con `--out`; se non ce n'è uno ovvio, lascia il default dello script (`<audio>.txt` accanto alla sorgente).

> **Uso diretto**: chiama direttamente `scripts/transcribe.sh` senza rileggere lo script né riscriverne il contenuto. Rileggilo o modificalo **solo** se compare un errore da diagnosticare.

## 0. Prima di lanciare — CHIEDI (sempre, un solo giro)

Prompt, keyword e lingua sono **opzionali**. Non inventarli:
- Chiedi se vuole specificare **`--prompt`** (contesto della registrazione), **`--keyword`** (termini che ci si aspetta, ripetibile), **`--language`** (codici attesi, ripetibile).

## 1. Uso base

```bash
# --out esplicito: transcript dove dici tu
$G/scripts/transcribe.sh --audio /percorso/registrazione.wav --out ./out/registrazione.txt
```

`$G` = percorso assoluto di questa cartella skill (normalmente `~/.agents/skills/gpt-transcribe`). Se l'utente **non** indica l'output, scegli tu il path più sensato (es. accanto all'audio o nella cartella del progetto) e fallo con `--out`; se non ne trovi uno ovvio, usa il default dello script (`<audio>.txt`).

Con contesto / lingua (solo se l'utente li ha chiesti):

```bash
$G/scripts/transcribe.sh --audio call.mp3 \
  --prompt "Chiamata di assistenza su piano premium, account AC-42." \
  --keyword "AC-42" --language it --language en
```

## 2. Limit & taglio

- Limite di upload: **25 MB** (nessun limite di durata separato documentato; la fatturazione è **per minuto**, `$0.0045/min`).
- Se il file supera ~24 MB lo script lo **ri-encoda** in MP3 mono 16 kHz e lo **taglia** automaticamente in chunk sotto il limite. `--max-minutes N` forza il taglio (utile per preservare contesto su file lunghi ma sotto il byte-limit). Non tagliare a metà frase quando possibile.
- Formati supportati: `mp3, mp4, mpeg, mpga, m4a, wav, webm`.

## 3. Flex tier — NON disponibile per la trascrizione

Verificato: flex (parametro `service_tier: flex`) vale solo per **Responses / Chat Completions**; la tabella prezzi flex non elenca modelli di trascrizione. **Non** inviare `service_tier` a `/v1/audio/transcriptions`. Il flag `--flex` esiste solo per chiarezza: lo script lo segnala e procede con processing standard. Non promettere sconti flex all'utente.

## 4. Costo

- `gpt-transcribe`: $0.0045/min. Lo script stampa la stima a fine run.
- Testare prima su un campione rappresentativo prima di spostare file di produzione.

## 5. Prima di consegnare — controlla

- **Leggi il transcript** e verifica che nomi/acronimi/date siano sensati. Se sbagliati, riprova aggiungendo `--prompt`/`--keyword` (più economico che insistere).
- Se la lingua era sconosciuta, verifica il campo `languages` nel JSON (finito accanto al `.txt`).

## 6. Troubleshooting

- HTTP 401 → chiave errata/manomessa. 429 → quota/rate, backoff. 400 → controlla `--language` (codici ISO supportati: `en`, `fr`, `eng`, `yue`, `cmn`, `zh-cn`…).
- L'API rifiuta l'intera richiesta se `prompt` è troppo lungo o se una keyword contiene `<`, `>`, CR o LF: tienile su una riga, senza quei caratteri.
- Nessun tool mancante? Servono `curl jq ffprobe ffmpeg`.
