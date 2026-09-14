# Clive architecture hardening — 2026-09-12

## Obiettivo

Rendere affidabile il flusso AI Magic `chat → Crea piano → review → apply/undo` e ridurre la dispersione dell’orchestrazione tra React, Tauri e provider.

## Piano e stato

1. **AI execution pipeline — implementato**
   - streaming JSON come percorso primario;
   - `generateObject/json_schema` solo fallback;
   - timeout per singola generazione: 240 s, con budget complessivo di 300 s per provider lenti;
   - cancellazione esterna distinta dal timeout;
   - limite output planner: 1.200 token;
   - compatibilità con `rules`/`trashPatterns` e `assignments`/`trash`.

2. **Application orchestrator — implementato**
   - ciclo del piano estratto in `usePlanGeneration`;
   - stato mutabile dual-pane estratto in `usePaneSession`;
   - `App.tsx` conserva composizione della UI e policy di navigazione.

3. **Filesystem command module — hardening implementato**
   - guard Rust applicata anche alle destinazioni di copy/move;
   - guard applicata alla creazione cartelle;
   - `allowSystem` propagato dai wrapper Tauri;
   - test di regressione su destinazioni protette.

4. **Provider gateway — hardening implementato**
   - request body limit 2 MiB;
   - response metadata `x-clive-provider` e `x-clive-upstream-status`;
   - provider quirks isolati nel gateway;
   - nessun timeout HTTP totale sullo stream chat: il gateway lascia arrivare la risposta completa; i timeout applicativi restano a carico del planner/frontend;
   - il runtime propaga `finishReason` e la chat segnala esplicitamente una risposta troncata dal limite output del provider;
   - errori frontend normalizzati da `describeAiError`.

5. **Debug end-to-end del piano — implementato**
   - ogni piano generato mantiene un `debugId` collegato al log persistente;
   - la fase apply/undo registra batch ID, payload esatto inviato a Rust, operazioni incluse/escluse, conteggio per tipo, progresso, report ed errore;
   - il pannello `🛠️ Debug` espone i dati in formato leggibile e JSON copiabile, per distinguere piano vuoto, filtro UI, errore di validazione, timeout o fallimento filesystem.
   - il planner usa un budget wall-clock complessivo di 60 s condiviso tra streaming e fallback strutturato; il log indica la fase corrente (`health`, `stream`, `structured`, `expand`). Il testo viene ripulito dalle sequenze terminale ANSI/OSC.
   - il trace include eventi planner e apply/undo; il gateway restituisce request ID, provider, status upstream e timing TTFB; `ApplyReport` include durata, totale e conteggi per fase.
   - i log redigono username/token nel testo e mantengono un limite per record.
   - Activity Center unifica stato corrente, run chat e run piano; il debugger tecnico resta un dettaglio espandibile.

## Verifica

- Frontend: 32 file test, 285 test verdi.
- Vite build: OK.
- Rust: 26 test verdi.
- `cargo check`: OK.

## Nota operativa

La verifica provider end-to-end deve essere eseguita con una build Tauri fresca e un provider configurato. Il test deve controllare: tempo al primo chunk, timeout a 45 s, piano non vuoto e apertura del `PlanPanel`. Per un problema di applicazione, aprire `🛠️ Debug`, espandere il log e controllare prima `payload`, `batchId`, `progress`, `report` ed `error`.
