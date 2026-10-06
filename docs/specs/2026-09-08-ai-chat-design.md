# Spec: AI Chat — Drawer laterale conversazionale con azioni confermate

**ID:** `2026-09-08-ai-chat`
**Stato:** bozza per review umana
**Autore:** brainstorming sessione 2026-09-08

---

## 1. Obiettivo

Aggiungere a Clive (file manager Tauri) una **chat AI multi-turno** in un drawer laterale dedicato. Il modello:

- Risponde **in streaming**.
- Vede come contesto la **cartella corrente**, i **file selezionati** e quelli **aggiunti dall'utente al volo** (drag & drop).
- Può **proporre azioni** (rinomina, sposta/organizza, crea file, cestina) sempre **soggette a conferma esplicita** dell'utente, con card inline nel messaggio che le contiene.
- Non persiste su disco: la conversazione vive **solo per la sessione**.

## 2. Non-goals v1

- Ricerca semantica / indicizzazione FTS5.
- Deduplica, classificazione automatica, estrazione dati.
- Agente autonomo multi-step (tool-calling libero senza conferma umana).
- Persistenza cronologia conversazioni su disco.
- Modifiche al gateway Rust (`gateway.rs`) — lo streaming `/v1/chat/completions` è già verificato funzionante.

## 3. Architettura

### 3.1 Componenti nuovi

| Componente | Path | Responsabilità |
|---|---|---|
| `ChatDrawer` | `frontend/src/ai/ChatDrawer.tsx` | UI del drawer: thread messaggi, input, card inline, banner errori |
| `useChat` | `frontend/src/ai/chat.ts` | Controller: stato messaggi, streaming, parse azioni, budget, trim cronologia |
| Parser azioni | dentro `chat.ts` | Estrae il blocco `<<<ACTIONS>>>` dal messaggio, valida JSON, separa dal testo |

### 3.2 Modifiche a file esistenti

| File | Modifica |
|---|---|
| `runtime.ts` | Helper `streamChat` (già presente `streamAssistant`, riusato) |
| `budget.ts` | Helper per budgetizzare directory listing (più compatto di contenuti file) |
| `safety.ts` | Validazione proposta cestino (sistema protetto, nome file) |
| `App.tsx` | Montare drawer, bottone status bar, scorciatoia `⌘⇧C` |
| `i18n/locales/{en,it}.json` | Chiavi: `chat.*` (placeholder input, titolo, errori, card label) |

### 3.3 Relazione con il flusso AI esistente

- **Separati a livello UI**: `AiWidget` + `AiOverlay` restano invariati; il drawer chat è un percorso parallelo.
- **Condivisi a livello infrastruttura**: stesso gateway, stessi `runtime.ts`/`safety.ts`/`budget.ts`, stesse chiavi API in-app.
- **Esclusività overlay**: se l'overlay è aperto e si apre il drawer chat, l'overlay viene chiuso.

## 4. Flusso dati

### 4.1 Ciclo di un turno

```
Utente digita msg → appende {role:user}
→ assembla prompt (system + contesto + cronologia trimmata)
→ streamChat(model, messages) → SSE
→ accumula chunk in {role:assistant, streaming:true}
→ al DONE: cerca <<<ACTIONS>>> nel testo
   ├─ trovato → parse JSON → aggiungi actionCards al msg → rimuovi marker dal testo
   └─ assente → msg testuale puro
→ utente clicca Apply su una card
   → validateAction (safety + guard)
   → applyPlan / fs ops
   → journal per undo
```

### 4.2 Prompt system

```
Sei l'assistente AI di Clive, un file manager. Rispondi in modo conciso.
Se l'utente ti chiede un'operazione, proponila alla fine della risposta:

<<<ACTIONS>>>
{"actions":[{"type":"rename","file":"<path>","newName":"<nome>"}, ...]}
<<<END>>>

Nessuna azione viene eseguita senza conferma esplicita dell'utente.
Tipi validi: rename, organize (sposta), create, trash. Rispondi in JSON valido.
```

### 4.3 Parser azioni

```ts
function extractActions(raw: string): {text: string, actions?: ChatAction[]}
```

- Cerca marker `<<<ACTIONS>>>...<<<END>>>` nel testo.
- Se assente o JSON malformato → ritorna `{text: raw}` (nessuna azione, nessuna esecuzione).
- Se presente e valido → ritorna testo pulito + array `ChatAction[]`.

`ChatAction` è un discriminated union con `type: 'rename'|'organize'|'create'|'trash'` e payload.

### 4.4 Validazione azioni (prima di Apply)

- **rename**: `validateNewName(newName)` + collision check + guard sistema (`is_protected(file)`).
- **organize**: stessa validazione per `dstFolder`; src deve esistere; guard su src e dst.
- **create**: nome file + path dentro dir corrente; guard sistema sul target.
- **trash**: solo file/directory esistenti; **guard sistema**: se `is_protected(file)` → card non applicabile (grigia con hint "system").

Se la validazione fallisce, la card mostra un errore inline e Apply è disabilitato.

## 5. Gestione contesto & cronologia

### 5.1 Contesto (per turno)

Ricostruito **ogni turno**, in ordine:

1. `systemPrompt` + istruzioni azioni.
2. **Cartella corrente** (`dir` del pannello attivo): elenco di nomi (+ `isDir`). Budget: ~1000 token. Se più lungo → troncato con nota.
3. **File selezionati** del pannello attivo: contenuti passati da `budgetFiles` + `renderBudgeted` (stesso usato per summarize/rename).
4. **File aggiunti al volo** (drop di altri file/cartelle): stessi limiti di 2+3, budgetizzato separatamente.
5. **Cronologia conversazione** (see §5.2).

### 5.2 Vision gate

Per immagini (PNG/JPG/GIF/WebP/HEIC) nel contesto:
- Se il modello corrente ha `vision: true` (da `capabilities.ts`) → inviate come contenuti image nel messaggio. **v1: DEFERRED — `streamChat` è text-only. Le immagini vengono trattate come gli altri file (metadata + `readTextFile` che fallisce silenziosamente). Solo il ramo "non-vision → nota" è attivo in v1. V1.1: estendere `runtime.ts` con supporto `image_url` nel formato multimodale OpenAI.**
- Altrimenti → omesse con nota `"immagine ignorata (modello senza visione)"` (stessa UX Summarize). **✓ Implementato e testato in v1.**

### 5.3 Trimming cronologia multi-turno

Strategia v1 (**FIFO + ancora**), semplice e testabile:

- Mantieni sempre il **primo messaggio utente** (ancora di contesto della conversazione).
- Mantieni **tutti i messaggi più recenti** finché il budget lo consente.
- Scarta i turni intermedi vecchi in ordine di anzianità finché rientra nel budget.
- Se lo scarto è avvenuto → mostra chip "⚠️ Cronologia troncata" sopra l'input, per trasparenza.
- **Limite rigido**: se dopo il trimming il prompt supera comunque il `maxTokens` del modello → tronca anche il primo messaggio utente con nota.

Nessun riassunto della cronologia in v1 (dipenderebbe dal modello essere bravo a riassumere; rischio di perdita di informazioni).

## 6. UX / UI del drawer

### 6.1 Layout

- **Posizione**: destra, overlay con `backdrop` cliccabile per chiudere.
- **Dimensione**: `w-[420px]` full-height, scroll interno sul thread.
- **Header**: titolo `t('chat.title')` + `✕` (o `Esc` per chiudere).
- **Thread**: lista verticale di messaggi.
  - Ogni messaggio user: bubble destrorsa `bg-primary/10`.
  - Ogni messaggio assistant: bubble sinistrorsa `bg-base-200` con testo streaming live.
  - Card azione inline (sotto al messaggio assistant che le contiene):
    ```
    ┌────────────────────────────┐
    │ 🔄 Rinomina                │
    │ report_2025 → report.txt   │
    │ [Apply] [Annulla]          │
    └────────────────────────────┘
    ```
    Se l'azione è stata applicata, la card diventa verde `✓ Applicata` e i bottoni spariscono.
- **Banner errori**: in cima al thread, stile identico all'overlay AI (con **pulsante Copia** e `✕`).
- **Input**: `textarea` autosize + bottone Invio (`⌘↵`). Disabilitato mentre `streaming`.
- **Chip contesto** (sopra input): i file aggiunti via drop appaiono come chip cancellabili.

### 6.2 Apertura

- **Bottone status bar**: icona 💬 accanto a pannello AI.
- **Scorciatoia**: `⌘⇧C` (o equivalente su Win/Linux).
- **Menu contestuale** (v1.1): voce "Chiedi all'AI" che apre drawer e precarizza i file selezionati.

### 6.3 Chiusura

- `✕` header, click backdrop, `Esc`.
- Al riaprire: conversazione di sessione **preservata**.

## 7. Gestione errori

- **Streaming fallito a metà**: conserva il testo parzialmente ricevuto, mostra banner errore, `streaming` → `null`.
- **JSON malformato** in `<<<ACTIONS>>>`: il blocco è mostrato come testo normale; nessuna card, nessuna esecuzione.
- **Errore provider** (es. `InvalidParameter`, `MissingSessionID`): banner con messaggio + copia (stesso pattern di `AiOverlay`).
- **Azione fallita in apply** (es. collision, permission denied): card mostra errore inline (`text-error`) con messaggio; Apply può essere ritentato dopo modifica.
- **Guard sistema attivata** su path protetto: card grigia con hint "percorso protetto", Apply disabilitato.

## 8. Test plan (vitest)

| File | Copre |
|---|---|
| `chat.test.ts` | Parser `extractActions` (marker assente, valido, malformato, multi-azione) |
| `chat-budget.test.ts` | Trimming FIFO + ancora, chip "troncata", limite rigido |
| `chat-context.test.ts` | Assemblaggio: dir + selezionati + aggiunti; vision gate immagini |
| `chat-actions.test.ts` | `validateAction` su ogni tipo (rename, organize, create, trash) con guard sistema |
| `ChatDrawer.test.tsx` | Render drawer, send message, streaming update, card inline Apply/Cancel, chiusura Esc |
| `App.test.tsx` (esistente) | Non-regressione |

Obiettivo: ogni funzione pura ha unit test; integrazione validata con `make build` + `cargo test`.

## 9. Piano di implementazione

**Ordine a dipendenze:**

1. **Runtime helpers** (`chat.ts`): `extractActions`, `validateAction`, `trimHistory`. Funzioni pure → TDD.
2. **Prompt builder** (`chat.ts`): `buildChatPrompt(ctx, history)` con budget. → Test su output.
3. **`useChat` hook** (`chat.ts`): stato messaggi, `send`, `stream`, `applyAction`, `cancel`. → Test con `generateStructured` mock.
4. **`ChatDrawer.tsx`**: UI + wire-up a `useChat`. → Test render + interaction.
5. **Integrazione `App.tsx`**: bottone status bar, scorciatoia `⌘⇧C`, esclusività con overlay. → Non-regressione test esistenti.
6. **i18n en/it**: chiavi `chat.*`. → `i18n.test.ts` coverage.
7. **Validazione finale**: `make build`, `cargo test`, `npm test`.

## 10. Rischi & mitigazioni

| Rischio | Mitigazione |
|---|---|
| Il modello **non** rispetta il formato `<<<ACTIONS>>>` | Parser è permissivo (tollerante a spazi/capitalizzazione); se fallisce, nessuna azione e messaggio testuale intatto. Possibile follow-up: prompt con esempio. |
| Contesto troppo grande anche dopo trimming | Limite rigido per messaggio + hard cap su numero file in contesto (es. max 20 file). |
| Guard sistema bypassata | Validazione **doppia**: frontend (UI card grigia) + backend (comando Rust, già `allow_system`). |
| Azione apply parziale (some ok, some fail) | Usa `applyPlan` esistente che è atomic per tipo (renames/folders/moves) e logga `failures[]`. |
| `⌘⇧C` collide con shortcut browser | Configurable in Settings (v1.1). v1 hardcoded. |

## 11. Dipendenze existing

Tutto il riuso: `runtime.ts` (`getModel`, `streamAssistant`, `checkHealth`), `budget.ts` (`budgetFiles`, `renderBudgeted`), `safety.ts` (`validateNewName`, `validateRenames`, `uniqueName`), `systemGuard.ts`, `apply.ts` (`applyPlan`), `api.ts` (`fs`, `writeFile`, `moveToTrash`), `settings.ts` (`PROVIDERS`, `isCloudProvider`), `capabilities.ts` (`modelCapabilities`, `visionGate`).

## 12. Criteri di accettazione

1. L'utente apre il drawer chat, digita una domanda sui file selezionati → riceve risposta **in streaming**. ✓ v1.
2. Se il modello propone un'azione, appare una card con Apply/Annulla; Apply esegue l'operazione (rename/sposta/crea/cestina) e la card diventa verde con `✓`. ✓ v1.
3. Senza Apply, **niente** viene toccato su disco. ✓ v1 (test `useChat.test.ts` "does not execute anything without applyAction" + `ChatDrawer.test.tsx` guard-blocked).
4. Un'azione su path protetto (con guard attivo) mostra card grigia non applicabile. ✓ v1 (fix wave I-3: `validateAction` espone la pre-validazione al render).
5. Dopo 20+ turni con molti file in contesto, la chat resta funzionante (trimming FIFO + chip di avviso). ✓ v1 (fix wave I-4).
6. Tutti i test pre-esistenti (124 TS + 9 Rust) passano; build release OK. ✓ v1: suite ora a **173/173 TS** + 15/15 Rust, `make build` verde.
7. **DEFERRED → v1.1** — immagini passate al modello quando il provider ha vision capability (vedi §5.2). v1 usa solo il ramo "nota di skip".
