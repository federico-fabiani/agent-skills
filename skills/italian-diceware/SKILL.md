---
name: italian-diceware
description: Generate strong passphrases in Italian from a Diceware word list via a zero-dependency Node script. Use whenever the user asks for a passphrase, a password, a security code, or any random phrase/name composed of Italian words, or wants to create one with real dice or a CSPRNG.
metadata:
  author: federico-fabiani
  version: "1.0.0"
---

# Italian Diceware — passphrase in italiano

Genera passphrase forti a partire dalla word list ufficiale
[diceware_it-IT](https://github.com/taringamberini/diceware_word_list_it-IT)
(7776 parole). Zero dipendenze: solo Node 18+.

- Word list: `word_list_diceware_it-IT-4.json` (accanto a questo SKILL.md)
- Script: `scripts/diceware.mjs` — nei comandi sotto indicato come `$D`
  (sostituisci con il path assoluto della cartella della skill, es.
  `~/.config/opencode/skills/italian-diceware/scripts/diceware.mjs`).

## 1. Uso base

Una passphrase di 6 parole (default):

```bash
node $D
# → caccia lampada 4 giallo strada villa
```

Personalizza:

```bash
node $D --words 8              # 8 parole
node $D --count 3              # tre passphrase tra cui scegliere
node $D --separator "-"        # separatore diverso dallo spazio
```

## 2. Formato della word list

La word list è un JSON: oggetto `{ "11111": "0", …, "66666": "zzzz" }` con 7776 voci,
chiavi = codici dei 5 dadi, valori = parole. Lo script valida ogni voce e, se non
trova esattamente 7776 voci, fallisce con un errore chiaro.

## 3. Randomness

Lo script usa `crypto.randomInt` (CSPRNG del sistema) per simulare il lancio dei 5
dadi per parola. È adatto alla maggior parte degli usi. Se l'utente chiede la massima
sicurezza fisica, usa dadi veri: genera i numeri con i dadi e cercali nella word list
manualmente (oggi lo script non supporta l'input manuale dei lanci).

## 4. Come usarla

- Proponi la passphrase generata e lascia che l'utente scelga la lunghezza in base
  alla sensibilità: 6 parole (default, ~77 bit) per la maggior parte dei servizi,
  8+ parole per password manager, chiavi o account critici.
- Mai usare una passphrase per due account. Se serve la passphrase per un utente,
  digli di custodirla nel proprio password manager.
- Se l'utente vuole solo *un nome o una stringa casuale* (nickname, codice, frase),
  funziona ugualmente: fallo partire con pochi `--words`.
- La passphrase appare in chiaro nel terminale: è il comportamento voluto, l'utente
  deve copiarla. Non salvarla in file di progetto né nei log.

## 5. Troubleshooting

- **`expected 7776 diceware entries`** — la word list non è integra o è stata
  modificata. Scaricala di nuovo da
  <https://github.com/taringamberini/diceware_word_list_it-IT>.
- **`Unknown flag`** — controlla la sintassi: sono supportati solo `--words`,
  `--count`, `--separator`, `--wordlist`, `--help`.
- **Node assente o troppo vecchio** — serve Node 18+: <https://nodejs.org>.
