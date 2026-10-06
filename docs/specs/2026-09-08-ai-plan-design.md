# Spec: AI Plan — bottone "Riorganizza" + pannello di riorganizzazione di massa con Apply/Undo atomico

**ID:** `2026-09-08-ai-plan`
**Stato:** bozza per review umana
**Autore:** brainstorming sessione 2026-09-08
**Baseline (dipende da):** chat AI (`2026-09-08-ai-chat`, v1 spedito), trash macOS unificato (`dc5238f`), markdown + copy button (`1ed2f4f`)

---

## 1. Obiettivo

Trasformare un'analisi testuale che l'AI chat ha già prodotto (es. "smista la Desktop in 01_Personal, 02_Projects…") in un **piano d'azione concreto, visivo e reversibile**: un pannello ad albero dove l'utente rivede le mosse (crea cartelle / rinomina / sposta / cestina), spunta/esclude, sistema collisioni, e poi **Applica tutto** in un colpo — con **Annulla tutto** atomico, persistente tra riavvii.

Non sostituisce il flusso `<<<ACTIONS>>>` esistente (che resta per modifiche puntuali): lo **affianca** — quando il modello propone un insieme strutturato di operazioni, il bottone 🪄 permette di materializzarlo come `Plan` e applicarlo in massa.

## 2. Non-goals v1

- **Ricorsione** in sottocartelle: il `Plan` v1 lavora solo sulla **cartella corrente** (flat).
- **Dedup "vera"** (hash contenuti): il modello può proporre "sposta in /duplicates-review" ma Clive non confronta byte per byte.
- **Agente multi-step** (`harness`-style): nessuna esecuzione interattiva modello→azione→risultato in loop; il modello produce il piano *in un colpo*, il client espande/esegue in modo deterministico.
- **Pianificazione/scheduling** del piano (applicare tra X giorni, pipeline automatiche di mantenimento).
- **Merge di cartelle** esistenti nel piano (v1 crea solo sottoalberi nuovi).
- **Multi-root** (piano che opera su due pannelli contemporaneamente).

## 3. Architettura

### 3.1 Componenti nuovi

| Componente | Path | Responsabilità |
|---|---|---|
| `plan.ts` (puro) | `frontend/src/ai/plan.ts` | Tipi (`Plan`, `PlanOp`, `ModelPlanShape`), `expandPlan(modelJson, listing, ctx)`, `orderPlanOps(ops)`, `validateFolderPath(path): NameCheck` |
| `usePlan.ts` | `src/ai/usePlan.ts` | Stato locale del pannello (include/exclude, editing nome/destinazione, progress, report), wrapper su `apply_plan`/`undo_plan` invoke e listener `plan-progress` |
| `createPlanFromMessage.ts` | `src/ai/createPlanFromMessage.ts` | Pipeline App-side (ruling R8, implementata al posto di `useChat.planFor`): health probe → `generatePlan` → `expandPlan` → `Plan` |
| `PlanPanel.tsx` | `src/ai/PlanPanel.tsx` | Overlay modale con albero, checkbox, inline-edit, barra azioni, secondo-confirm cestino, progresso, report + Annulla tutto |
| `commands/plan.rs` | `src-tauri/src/commands/plan.rs` | Comandi Tauri `apply_plan` (batch a fasi) e `undo_plan` (journal inverso). Entrambi con guard autoritativo (`allow_system`) ed evento `plan-progress` |
| Journal | `~/.clive/plan-journal/<batchId>.json` | Persistente su disco, sopravvive al riavvio; ogni apply ne crea uno; `undo_plan(batchId)` lo consuma |

### 3.2 Modifiche a moduli esistenti

- `src/ai/chat.ts`: aggiunge `generatePlan(currentText, listing, ctx): Promise<ModelPlanShape | null>` che fa una **seconda chiamata modello** con un system-prompt fisso che chiede un JSON compatto (vedi §6) e usa `"json"` nel prompt → non si ripresenta l'`InvalidParameter` già sistemato per summarize.
- `src/ai/ChatDrawer.tsx`: ogni messaggio assistente può mostrare un bottone **🪄 "Crea piano"** (disabilitato durante lo streaming e oltre il cap di 5000 entry). Il click **forwarda solo il testo del messaggio** tramite la prop `onCreatePlan(text)`; la UI resta passiva (ruling R8).
- ~~`src/ai/useChat.ts`: espone `planFor(msgIdx)`~~ → **non implementato**: per R8 la pipeline vive in App (handler `onCreatePlan` → `createPlanFromMessage.ts` → `usePlan.setPlan`). `useChat` non conosce il Plan.
- `src/App.tsx`: istanzia `usePlan`, gestisce l'handler `onCreatePlan` (via `createPlanFromMessage`), passa `guardOn = cfg.guardSystemLocations` via `allowSystem()` (stessa funzione che oggi passa `allowSystem` a `rename`/`delete_to_trash`), monta `<PlanPanel>` come overlay a livello App (sopra ChatDrawer quando aperto) e persiste l'ultimo batch applicato in localStorage per l'undo post-riavvio (R11).
- `frontend/src/api.ts`: aggiunti wrapper `applyPlan(batchId, ops, allowSystem)`, `undoPlan(batchId, allowSystem)`, `onPlanProgress(cb)` (via `@tauri-apps/api/event`).
- `src/ai/budget.ts`: riusa `renderDirListing` per il prompt (già presente).
- `src/ai/safety.ts`: riuso `validateNewName` per i **singoli segmenti** dei percorsi cartella; aggiungo `validateFolderPath(path): NameCheck` in `plan.ts` (sottile wrapper che splitta su `/` e chiama `validateNewName` per ogni segmento, rifiutando `..`, `\0`, spazi, vuoto).

### 3.3 Relazione con `<<<ACTIONS>>>` (chat) e `AiOverlay` (one-shot)

- **Coesistono, non si sovrappongono**: `<<<ACTIONS>>>` resta per poche operazioni puntuali (1–20 card inline). Il `Plan` è per riorganizzazioni strutturate (≥20–200 op) con anteprima ad albero e apply atomico.
- **Il bottone 🪄 è l'unico trigger**: l'utente clicca sul messaggio che contiene l'analisi; non parte in automatico.
- **Non-modifiche a `AiOverlay`**: il flusso widget AI attuale (Rename/Organize/Summarize/Generate) non viene toccato.
- Se un futuro `Plan` ha ≤5 ops, mostriamo comunque il pannello — non tentiamo di "tornare" alle card (evitiamo dualismo).

## 4. Flusso dati

```
Utente clicca 🪄 su messaggio m
→ App.onCreatePlan(text) → createPlanFromMessage (R8)
  → gather: entries del pane attivo (name/isDir/size/modified) + messaggio.testo
  → chat.generatePlan(text, listing, ctx) — 2ª chiamata, response_format json_object
  → ModelPlanShape { folders, assignments, renames, trash, notes? }
  → plan.expandPlan(json, listing, { currentPath, existingNames, guardOn })
     ├─ basename → path assoluto (matching: esatto → case-insensitive → varianti ` (1)`)
     ├─ cartelle: validateFolderPath per segmento, rifiuta `..`
     ├─ collisioni destino → issue (op disabilitata)
     ├─ nomi sconosciuti → issue (op scartata, riportata)
     ├─ file non coperti → elenco "unchanged" nel Plan (non ops)
     └─ ops ordinate: orderPlanOps(create asc-depth, rename, move, trash)
→ setPlan(expanded) → <PlanPanel open={true} plan={...} />
→ Utente rivede/spunta → Applica
→ apply_plan(ops_incluse, batchId=uuid(), allowSystem) → eventi plan-progress → ApplyReport
→ Se fallimenti: report con motivazioni; ops riuscite nel journal
→ Utente può Annulla-tutto → undo_plan(batchId, allowSystem) → eventi plan-progress → UndoReport
```

## 5. Modello dati

### 5.1 `ModelPlanShape` (CIÒ che il modello deve emettere — compatto, nomi locali)

```ts
{
  "folders": ["01_Personal/CV", "02_Projects/Feliz/00_Current", ...],
  "assignments": [{ "file": "CV-2.pdf", "to": "01_Personal/CV" }, ...],
  "renames":     [{ "file": "a.md", "to": "notes-2026-09-08.md" }, ...],
  "trash":       [{ "file": "memoryzone-mac.dmg" }, ...],
  "notes": "eventuale testo libero"
}
```

- `file` è **basename** della cartella corrente (il modello non deve ripetere il prefisso assoluto → meno token, meno allucinazioni).
- `to` è un **path relativo** a partire dalla root del piano (cartella), segmentato con `/`.
- Il client **non** fida ciecamente: valida, risolve, marca collisioni.

### 5.2 `PlanOp` (forma canonica client-side)

```ts
type PlanOp =
  | { id: string; kind:'createFolder'; path: string;                included: boolean; issue?: string }
  | { id: string; kind:'rename';       path: string; newName: string; included: boolean; issue?: string }
  | { id: string; kind:'move';         path: string; destDir: string; included: boolean; issue?: string }  // destDir assoluto
  | { id: string; kind:'trash';        path: string;                 included: boolean; issue?: string }
interface Plan { rootPath: string; ops: PlanOp[]; unchanged: FileEntry[]; warnings: string[] }
```

`issue` non-`undefined` ⇒ op **sempre** excluded, non riabilitabile dall'utente nel pannello (dovrebbe significare collisione reale, path protetto, o basename non trovato).

### 5.3 `ApplyReport` / `UndoReport`

```ts
{ applied: number; failed: { id; error: string }[]; skipped: number; batchId: string }
```

### 5.4 Journal (persistente)

```jsonc
// ~/.clive/plan-journal/<batchId>.json
{
  "batchId": "...",
  "createdAt": 1731084000,
  "rootPath": "/Users/.../Desktop",
  "ops": [
    { "id": "createFolder:01_Personal/CV", "kind": "createFolder", "inverse": null },
    { "id": "move:CV-2.pdf→01_Personal/CV", "kind": "move", "inverse": { "move": ["/Users/.../Desktop/01_Personal/CV/CV-2.pdf", "/Users/.../Desktop/CV-2.pdf"] } },
    { "id": "trash:memoryzone-mac.dmg", "kind": "trash", "inverse": { "restoreFromTrash": "…/.Trash/memoryzone-mac.dmg", "to": "/Users/.../Desktop/memoryzone-mac.dmg" } }
  ]
}
```

Ops riuscite → la loro `inverse` è salvata; ops fallite → **non** ci sono. Undo = applica inversi in ordine inverso.

## 6. Generazione (chiamata al modello)

- **Doppio giro**: primo (già fatto) → l'utente ha l'analisi testuale. Secondo (🪄) → si chiede al modello di **tradurla in `ModelPlanShape`** con `response_format: json_object` e prompt che include la parola "json".
- **System-prompt fisso** (inglese, conciso):
  > "Sei il motore di piani di Clive. Dato il TESTO DEL PIANO (scritto da te nel turno precedente) e la LISTA REALE dei file, produci SOLO un JSON valido con chiavi `folders`, `assignments`, `renames`, `trash`, `notes`. `file` è il basename esatto preso dalla lista. `to` è un path relativo separato da `/`. NON inventare nomi che non sono nella lista. NON toccare cartelle esistenti: le cartelle che elenchi in `folders` sono tutte NUOVE sottocartelle che l'app creerà sotto la root."
- **Contesto inviato**: `renderDirListing(entries)` + **il solo** messaggio che ha generato l'analisi (no tutta la conversazione).
- **Fallback se il JSON non arriva / è invalido**: mostra errore con pulsante "Riprova" (un retry automatico non è previsto in v1).
- **Limite hard**: se `entries.length > 5000`, il bottone 🪄 è disabilitato con tooltip "cartella troppo grande" (il modello non reggerebbe e il pannello sarebbe inutilizzabile).

## 7. UI / Pannello

- Overlay centrato, grande (`max-w-4xl`, `max-h-[80vh]`), sopra il `ChatDrawer` quando aperto.
- Header: "Piano per `<rootPath>`" + statistiche `+X cartelle · Y mosse · Z rinomine · W cestinati · N non toccati`.
- Corpo: **albero** renderizzato da `ops` + listing originale. Ogni riga:
  - `createFolder`: icona cartella + path relativo, badge "nuova"
  - `move`: icona file, "da `/Desktop/CV-2.pdf` → `/Desktop/01_Personal/CV/`", menu a tendina per cambiare `to` in un'altra cartella del piano
  - `rename`: input inline per `newName` (valida con `validateNewName`)
  - `trash`: icona file + badge rosso "cestina" (va nel Trash macOS)
  - Checkbox a sinistra (deselezionata se `issue`)
  - Hover: mostra `issue` (es. "destinazione occupata", "path protetto", "nome non trovato")
- Footer: `Annulla` · `Applica piano` (primario). Se `W>0` → secondo modal *"Stai per cestinare W file. Vanno nel Trash macOS, finché non lo svuoti puoi annullare tutto."* [Annulla] [Conferma e applica].
- Durante apply: barra progresso (`plan-progress {done,total,current}`).
- Dopo apply: report (`applicate/fallite/saltate`) + **`Annulla tutto`** (`undo_plan`) + `Chiudi`.
- **Regola d'oro del pannello**: nessuna op parte senza Apply; ops `issue` non riabilitabili.

## 8. Motore di apply (Rust)

### 8.1 `apply_plan(batchId, ops, allowSystem)`

- Riceve solo ops `included`.
- **Fasi** nell'ordine: `createFolder` (per profondità crescente: prima `A`, poi `A/B`), poi `rename`, poi `move`, poi `trash`. Questo ordine garantisce che le destinationi esistano prima degli spostamenti.
- **Guard autoritativo**: ogni `path` coinvolto (sorgente o destinazione) passa `is_protected(path) && !allowSystem → Err`. Le ops fallite per guard non finiscono nel journal.
- **Idempotenza**: prima di ogni op, controlla lo stato reale (es. src non più esistente → `skipped`, non `failed`). Rende possibile rilanciare un piano parzialmente riuscito.
- **Journal**: per ogni op riuscita scrivi la sua `inverse` nel file `~/.clive/plan-journal/<batchId>.json` **prima** di procedere alla fase successiva (write-fsync).
- **Progress**: ad ogni op emetti `app.emit("plan-progress", { done, total, currentId })`.
- **Return**: `ApplyReport`.
- **Non cancella il journal**: resta su disco, consumato solo da un `undo_plan` riuscito o dalla pulizia manuale.

### 8.2 `undo_plan(batchId, allowSystem)`

- Carica il journal; se non esiste → `Err("no journal")`.
- Esegue le `inverse` **in ordine inverso**, sempre a fasi (trash-restore, poi move-back, poi rename-back, poi delete empty folders).
- Ogni inverse fallita va in `failed` nel report (es. utente ha svuotato il Finder: trash-restore → "not in trash").
- Al termine: rinomina il journal in `<batchId>.undone.json` (non lo cancella, per audit).

## 9. Sicurezza

- **Guard** attivo di default (`cfg.guardSystemLocations` → `allowSystem()`) propagato a `apply_plan`/`undo_plan`, identico al flusso rename/trash.
- **Secondo-confirm** **solo** se il piano include ops `trash`; move/rename/create sono reversibili senza conferme extra.
- **Non coperti** sono visibili nel pannello (l'utente decide se chiedere un secondo piano).
- **Niente "put-back" Finder**: i file cestinati dal piano finiscono in `~/.Trash/<slot>` gestiti da Clive (stessa semantica del trash-app unificato), quindi `undo` funziona *finché non si svuota il Finder*.
- **Journal non contiene segreti**: solo path, batchId, timestamp.

## 10. Errori

| Caso | Comportamento |
|---|---|
| Modello non risponde / JSON invalido | Errore con "Riprova" |
| Basename non nel listing | Op scartata con `issue: "nome non trovato"`, listata nelle warnings |
| Due assegnazioni stesso `to` | Seconda marcata `issue: "destinazione già usata"`, esclusa |
| File sorgente non più presente al momento apply | `skipped` (idempotenza) |
| Path protetto | `issue` a livello pannello **e** `Err` lato apply se l'utente forza (non può, checkbox disabilitata — difensiva) |
| Collisione destino su rename | `issue: "nome già esistente"` |
| Apply fallito a metà | Giornale resta valido per le ops riuscite; Undo riparte da lì |
| Undo dopo svuotamento Finder | Ops `trash` in `failed: "not in trash"`, le altre si annullano |

## 11. Test plan

| File | Copre |
|---|---|
| `plan.test.ts` | `expandPlan` su JSON valido; basename sconosciuto → `issue`; collisioni `to`; `validateFolderPath` rifiuta `..`, accetta `A/B/C`; `orderPlanOps` rispetta profondità e ordine fasi; non-assegnati restano in `unchanged` |
| `useChat.test.ts` (esteso) | `planFor` chiama `generatePlan` → `expandPlan` → setta `Plan`; se il modello torna invalido → errore senza crash |
| `usePlan.test.ts` | toggle include/exclude, edit `newName`, riassegna `to`, contatori |
| `PlanPanel.test.tsx` | rendering albero, secondo-confirm quando `W>0`, ops `issue` non riabilitabili, "Annulla tutto" attivo solo se c'è batchId con journal |
| `commands/plan.rs` (Rust, temp dir) | `apply_plan` su cartelle di prova: create/rinomina/move/trash → inverse corrette; `undo_plan` ripristina esattamente lo stato iniziale; guard rifiuta src/dest protetti anche se il client li passa; idempotenza: rilancio ops già completate = `skipped` |
| `App.test.tsx` (esistente) | Non-regressione (mount nuovo componente) |

Target: suite TS + Rust + `make build` verdi; almeno 1 test Rust end-to-end "apply → undo = stato iniziale".

## 12. Piano di implementazione (ordine)

1. **`plan.ts`** — tipi + `expandPlan` + `validateFolderPath` + `orderPlanOps` (pure). TDD.
2. **`generatePlan`** in `chat.ts` — 2ª chiamata modello + parsing schema. Test con `callModel` mock.
3. **`commands/plan.rs`** — `apply_plan` + `undo_plan` + journal + progress. Test Rust su temp dir.
4. **`api.ts`** — wrapper invoke + `onPlanProgress`.
5. **`usePlan.ts`** — stato, include/exclude, editing, invoke apply/undo, listen progress.
6. **`PlanPanel.tsx`** — UI albero, statistiche, secondo-confirm, progresso, report, Annulla tutto.
7. **`useChat.planFor`** + bottone 🪄 in `ChatDrawer` + mount `PlanPanel` in `App`.
8. **i18n** en/it `chat.plan.*` + `plan.action.*`.
9. **Validazione finale**: `cargo test` + `cargo clippy` + `tsc --noEmit` + `npm test` + `make build`.

## 13. Rischi & mitigazioni

| Rischio | Mitigazione |
|---|---|
| Il modello allucina nomi | Client valida sempre contro listing reale, `issue` per ogni non-trovato |
| Piano con migliaia di ops (root grande) | Hard-cap: `entries.length > 5000` disabilita 🪄 |
| Undo dopo svuotamento Finder | Warn esplicita; ops `trash` che falliscono vanno in `failed` (le altre si annullano) |
| Journal che cresce | File piccoli (KB), cleanup manuale o pulsante "pulisci vecchi" in Settings v2 |
| Piano con rinomina-massiva non voluta | Ogni op è spuntata separatamente; l'utente vede prima l'elenco completo |
| Apply che si interrompe (crash) | Journal incrementale, op-per-op; rilancio è idempotente |
| `⌘⇧C` collide con scorciatoie esistenti | già sistemato per chat; il pannello non aggiunge scorciatoie globali in v1 (Esc lo chiude, basta) |

## 14. Criteri di accettazione

1. L'utente apre la chat, chiede "riorganizza la mia Desktop" → il modello produce una lunga analisi in markdown (già oggi, con il rendering markdown attivo).
2. Click su 🪄 "Crea piano" → si apre il `PlanPanel` con l'albero delle cartelle create + assegnazioni + cestini proposti, coerente con l'analisi.
3. L'utente deseleziona 5 mosse, rinomina una cartella, riassegna un file a un'altra cartella.
4. Click Applica → se il piano contiene `trash`, compare il secondo-confirm "Stai per cestinare W file…".
5. Conferma → barra progresso → report finale con N applicate, M fallite (con motivo), K saltate.
6. Click "Annulla tutto" → le inverse girano → la Desktop torna **esattamente** come prima (verificabile con listing prima/dopo in un test).
7. L'utente chiude il pannello, riapre l'app → "Annulla tutto" è **ancora disponibile** per quel batch (journal persistito).
8. Se l'utente svuota il Finder **prima** di annullare, l'undo delle ops `trash` fallisce con `failed: "not in trash"` **ma** le altre ops si annullano correttamente.
9. Un file con path protetto (es. `/Applications/…`) proposto dal modello viene marcato `issue` e l'utente non può riabilitarlo; e se per bug ci arrivasse a `apply_plan`, il guard Rust rifiuta comunque.
10. Tutti i test passano: Rust, TS, `tsc --noEmit` pulito, `make build` OK.

## 15. Riferimenti

- Spec chat: `docs/specs/2026-09-08-ai-chat-design.md`
- Plan chat: `docs/plans/2026-09-08-ai-chat.md`
- Moduli riusati: `safety.ts::validateNewName`, `systemGuard.ts::isProtectedPath`, `budget.ts::renderDirListing`, `apply.ts::InverseOp`, trash unificato in `commands/trash.rs`.
