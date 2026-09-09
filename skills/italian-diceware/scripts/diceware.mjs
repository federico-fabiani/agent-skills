#!/usr/bin/env node
// Zero-dependency Diceware passphrase generator for the Italian word list.
// Requires Node 18+. Uses a CSPRNG (crypto.randomInt) as a stand-in for physical dice.
//
// Usage:
//   node diceware.mjs                       # 6 words, space-separated
//   node diceware.mjs --words 8             # 8 words
//   node diceware.mjs --count 3             # three candidate passphrases
//   node diceware.mjs --separator "-"       # join words with "-"
//
// Flags:
//   --words <n>      number of words per passphrase (default 6)
//   --count <n>      number of passphrases to print (default 1)
//   --separator <s>  separator between words (default " ")
//   --wordlist <path>  override the word list file path

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";

const DEFAULT_WORDLIST = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "word_list_diceware_it-IT-4.json"
);

function parseArgs(argv) {
  const o = { words: 6, count: 1, separator: " ", wordlist: DEFAULT_WORDLIST };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--words": o.words = parseInt(next(), 10); break;
      case "--count": o.count = parseInt(next(), 10); break;
      case "--separator": o.separator = next(); break;
      case "--wordlist": o.wordlist = next(); break;
      case "-h":
      case "--help":
        console.log("Usage: node diceware.mjs [--words N] [--count N] [--separator S] [--wordlist PATH]");
        process.exit(0);
      default: throw new Error(`Unknown flag: ${a}`);
    }
  }
  return o;
}

function loadWordList(obj) {
  const entries = {};
  for (const [code, word] of Object.entries(obj)) {
    if (/^[1-6]{5}$/.test(code) && typeof word === "string" && /^\S+$/.test(word)) {
      entries[code] = word;
    }
  }
  if (Object.keys(entries).length !== 7776) {
    throw new Error(
      `expected 7776 diceware entries, found ${Object.keys(entries).length}; ` +
      "is the word list intact?"
    );
  }
  return entries;
}

function rollWord(entries) {
  let key = "";
  for (let i = 0; i < 5; i++) key += String(randomInt(1, 7));
  return entries[key];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!(args.words >= 1 && args.words <= 100)) {
    throw new Error("--words must be between 1 and 100");
  }
  if (!(args.count >= 1 && args.count <= 100)) {
    throw new Error("--count must be between 1 and 100");
  }
  return { args };
}

async function run() {
  const { args } = main();
  const text = await readFile(args.wordlist, "utf8");
  const entries = loadWordList(JSON.parse(text));

  for (let i = 0; i < args.count; i++) {
    const words = [];
    for (let j = 0; j < args.words; j++) words.push(rollWord(entries));
    console.log(words.join(args.separator));
  }
}

run().catch((e) => { console.error(`ERROR: ${e.message}`); process.exitCode = 1; });
