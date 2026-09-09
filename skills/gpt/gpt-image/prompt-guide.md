# Prompt guide — GPT Image 2.5

Come scrivere prompt per `gpt-image-2.5-sunburst` e `gpt-image-2.5-flare`. Basato sulle guide ufficiali OpenAI: image-generation e image-prompting.

## 1. Scegli il modello

| Modello | Quando usarlo |
|---|---|
| `gpt-image-2.5-sunburst` **(default)** | Editing di precisione, composizione complessa, più riferimenti, testo esatto |
| `gpt-image-2.5-flare` | Generazione quotidiana, veloce, qualità alta |

A parità di `quality`, flare è più veloce. Parti da sunburst se l'accuratezza dell'edit conta più della velocità; passa a flare solo se la qualità regge e la latenza migliora.

## 2. Impostazioni di richiesta

- **`quality`**: `auto` (default) · `low` · `medium` · `high` · `xhigh` · `max`. `low` per bozze. Sali solo se il risultato non basta; `xhigh`/`max` aggiungono latenza e costo senza garantire un risultato migliore.
- **`size`**: `auto` · `1024x1024` (quadrato) · `1536x1024` (landscape) · `1024x1536` (portrait) · `2048x2048`/`2048x1152` (2K) · `3840x2160`/`2160x3840` (4K). Custom `WIDTHxHEIGHT`: multiplo di 16, lato max 3840, aspect ratio entro 1:3–3:1, pixel totali tra 655.360 e 8.294.400. Oltre `2560x1440` è sperimentale.
- **`output_format`**: `png` (default) · `jpeg` (più veloce) · `webp`. Solo png/webp supportano trasparenza.
- **`output_compression`**: 0–100, solo per jpeg/webp.
- **`background`**: `auto` · `opaque` · `transparent` (usa png o webp).
- **`n`**: numero di immagini da generare in una richiesta.

## 3. Fondamenta del prompt

1. **Definisci il risultato.** Nome del soggetto e uso previsto (foto prodotto, pubblicità, diagramma). Specifica composizione, aspect ratio e vincoli di posizionamento. Per richieste complesse, organizza il prompt in sezioni etichettate.
2. **Scegli un formato leggibile.** Frasi brevi, paragrafi descrittivi o JSON-like. Scegli il formato più facile da mantenere, non una sintassi magica.
3. **Descrivi i dettagli visibili.** Materiali, luce, colori, medium. Chiedi esplicitamente "fotorealistico" o "fotografia reale" se è l'obiettivo. I parametri fotografici sono indizi d'aspetto, non garanzie fisiche. Per scene ampie/cinematografiche/notturne/neon indica scala, atmosfera e colore, non solo parole d'umore.
4. **Specifica persone e azioni.** Inquadratura del corpo, scala relativa, sguardo, interazione con gli oggetti. Esempi: "corpo intero, piedi inclusi", "guarda in basso verso il libro aperto", "mani che afferrano naturalmente il manubrio".
5. **Specifica il testo esatto.** Metti le parole tra virgolette e descrivi posizione e tipografia. Scrivi le parole insolite lettera per lettera quando serve. Chiedi "nessun testo extra", poi controlla ortografia e leggibilità. Per testo piccolo o denso, confronta medium/high.
6. **Separa i cambiamenti dai vincoli.** Per gli edit: "cambia solo X" e elenca ciò che va preservato (identità, geometria, layout, luce, etichette). Indica le esclusioni (testo indesiderato, loghi, watermark).
7. **Assegna un ruolo ai riferimenti.** Identifica ogni input per numero e scopo: soggetto, stile, abbigliamento, sfondo. Spiega come combinarli e cosa spostare dove.
8. **Itera con deliberazione.** Riusa l'output precedente come input, chiedi un solo cambiamento, ripeto i dettagli da preservare. Se una regione deve restare identica al pixel, composita l'edit approvato nell'originale invece di affidarti solo al prompt.

## 4. Generazione — pattern

### Stile e luce
Descrivi soggetto, inquadratura, luce e texture; escludi esplicitamente il ritocco pesante.

> Crea una fotografia candida e realistica di un anziano marinaio su una piccola barca da pesca. Ha la pelle segnata con rughe, pori e texture del sole, e tatuaggi da marinaio sbiaditi sulle braccia. Sta sistemando una rete mentre il suo cane siede sul ponte. Scattata come una pellicola 35mm, mezzo primo piano a livello degli occhi, lente 50mm. Luce costiera morbida, profondità ridotta, leggero grain, bilanciamento naturale. Nessuna glamourizzazione, nessun ritocco pesante.

### Spiegare un processo
Nome del processo, pubblico, informazione da comunicare. Per i diagrammi verifica etichette e relazioni, non solo l'aspetto.

> Crea un'infografica dettagliata del funzionamento e del flusso di una macchina da caffè automatica come una Jura. Dal contenitore dei chicchi, alla macinatura, al dosaggio, al serbatoio dell'acqua, alla caldaia, ecc. Voglio capire tecnicamente e visivamente il flusso.

### Testo esatto
Cita il testo e indica quante volte deve apparire. Specifica pubblico e trattamento visivo.

> Scatto moda/street per un brand chiamato Thread. È un brand giovanile di strada. L'ad mostra un gruppo di amici con il claim "Yours to Create." Tono da campagna pubblicitaria per un pubblico giovanile: chic, contemporaneo, energico, di buon gusto. Composizione pulita, direzione colore decisa, pose naturali. Rendi il claim una sola volta, chiaro e leggibile, integrato nel layout. Nessun testo extra, nessun watermark, nessun logo estraneo.

### Interfaccia / mockup
Descrivi layout, gerarchia, spaziature e testo leggibile.

## 5. Editing — pattern

### Combinare riferimenti
Numera gli input e di' cosa spostare e cosa lasciare invariato.

> Metti il cane della seconda immagine nell'ambientazione dell'immagine 1, subito accanto alla donna, con lo stesso stile di luce, composizione e sfondo. Non cambiare nient'altro.

### Taglio prodotto trasparente
Richiedi nell'API `background="transparent"`, usa png o webp, verifica il canale alfa (capelli, vetro, ombre, bordi). Non accontentarti di una scacchiera disegnata.

### Rimuovere un oggetto
Nome dell'oggetto e preserva tutto il resto — persona, posa, luce, composizione.

> Rimuovi il fiore dalla mano dell'uomo. Non cambiare nient'altro.

### Inserire una persona in una scena
Preserva identità, specifica luce naturale, dettagli credibili, inquadratura, sguardo, interazione. Indica i tratti del volto da non cambiare.

> Genera una scena d'azione molto realistica in cui questa persona scappa da un grande orso bruno realistico che attacca un campeggio. Sembri una vera fotografia, non un poster cinematografico. È centrata ma guarda via dalla camera, abbigliamento da outdoor, sporco sul viso e strappi nei vestiti. Chiaramente spaventata ma concentrata a fuggire. Il campeggio è nel Parco Nazionale di Yosemite, con dettagli naturali credibili. È l'alba, luce naturale e colori realistici. Tutto deve sembrare autentico e non stilizzato. Evita luce cinematografica, gradazione drammatica, composizione artificiosa.

### Trasferire uno stile / cambiare abbigliamento
Riferimento di stile come input separato; indica cosa mutua e cosa resta.

## 6. Raffinare tra più turni

- Parti da un'immagine e usala come input del turno dopo.
- **Un cambiamento per volta**, così vedi cosa ha aiutato.
- Ripeti i vincoli critici se il risultato deriva.
- Esempio: dopo un mockup di prodotto, chiedi "Fallo sembrare una sera d'inverno con neve che cade." come edit singolo sull'output precedente.

## 7. Controlla il risultato — sempre

Prima di consegnare, apri il file e guardalo. Gli errori tipici:

- **Testo**: lettere storte, parole inventate, spelling sbagliato. È il difetto più comune.
- **Copertura del brief**: ogni elemento chiesto è presente? Numero di oggetti giusto?
- **Anatomia/geometria**: dita in più, prospettiva rotta, oggetti fusi.
- **Formato**: l'inquadratura rispetta il richiesto o il soggetto è tagliato?
- **Edit**: le zone non toccate sono rimaste identiche?

Se è sbagliato, correggi con un edit mirato sull'output (di solito più economico e fedele del rigenerare). Non presentare un'immagine che non hai visto.

## 8. Costo e latenza

- Token rate (uguali per entrambi i 2.5): $8/M token immagine in input, $2/M cached, $30/M token immagine in output, $5/M testo in input, $1.25/M cached. Il testo in output non è fatturato (il modello emette immagini).
- Prompt complessi fino a ~2 minuti di latenza.
- `jpeg` è più veloce di `png`.
- Ogni richiesta è a pagamento (nessun tier gratuito con GPT Image). Sviluppa un prompt accurato prima della prima chiamata; iterare brucia chiamate.
- Per i flussi streaming con `partial_images`, ogni immagine parziale costa 100 token di output in più.

Fonti: `developers.openai.com/api/docs/models/gpt-image-2.5-sunburst`, `/api/docs/guides/image-generation`, `/api/docs/guides/image-prompting`.
