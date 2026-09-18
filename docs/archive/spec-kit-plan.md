# Implementation Plan: Clive AI-Powered File Manager & AI Magic Debugger

**Branch**: `main` | **Date**: 2026-09-11 | **Spec**: [spec.md](file:///Users/demo/Projects/github/gi4nks/clive/spec.md)

---

## Summary

Implementazione della diagnostica visiva e della stabilizzazione del motore **AI Magic (🪄 "Crea piano")** per il file manager desktop **Clive**. L'obiettivo è risolvere le situazioni di mancata risposta del pulsante di pianificazione (piani vuoti, timeout del secondo turno, errori del provider) fornendo al contempo un **Pannello di Debug Visivo (`AiDebugModal`)** per l'ispezione in tempo reale dei log, dei payload JSON e dello stato di salute del gateway AI.

---

## Technical Context

- **Language/Version**: TypeScript 5.x (Frontend React 18 + Vite), Rust 2021 (Backend Tauri v2)
- **Primary Dependencies**: Tauri 2.11.5, React 18, `@gi4nks/wise` (AI SDK bridge), `zod`, `i18next`, `vitest`, `tokio`, `axum`
- **Storage**: Journal locale persistente per Undo (`~/.clive/plan-journal/<batchId>.json`), LocalStorage per configurazione app
- **Testing**: Vitest (262 test unitari frontend), Cargo test (26 test unitari backend Rust)
- **Target Platform**: Desktop (macOS / Linux / Windows)
- **Project Type**: Desktop App (Tauri + React)
- **Performance Goals**: Risposta dell'interfaccia UI < 100ms; timeout pianificazione AI cap a 90s con avviso visivo immediato.
- **Constraints**: 100% controllo utente prima delle modifiche su disco; zero modifiche non confermate; protezione automatica posizioni di sistema.

---

## Constitution Check

- **I. Code Quality & Maintainability**: ✅ Moduli separati a singola responsabilità (`AiDebugModal.tsx`, `usePlanDebug.ts`), nessuna soppressione di errori.
- **II. Testing Standards**: ✅ Copertura con unit test Vitest per lo store dei log di debug e per la cattura degli eventi del planner AI.
- **III. User Experience Consistency**: ✅ Notifiche visive trasparenti in caso di piano vuoto o timeout; pulsanti azionabili e messaggi chiari localizzati (i18n en/it).
- **IV. Performance & Efficiency**: ✅ Nessuna memoria dispersa; buffer di log di debug limitato a 50 voci (ring buffer).

---

## Project Structure & Target Files

```text
fm/src/frontend/vite-project/src/
├── ai/
│   ├── AiDebugModal.tsx        # [NUOVO] Componente UI del pannello di debug visivo
│   ├── usePlanDebug.ts         # [NUOVO] Store e log dei tentativi di pianificazione AI
│   ├── createPlanFromMessage.ts # Inoltro eventi di debug a usePlanDebug durante generatePlan
│   ├── ChatDrawer.tsx          # Pulsante per aprire il pannello di debug nell'header del drawer
│   ├── chat.ts                 # Schema Zod e prompt di generazione del piano
│   ├── runtime.ts              # Probing di salute e tracciamento endpoint gateway
│   └── plan.ts                 # Regole di espansione e validazione del piano
├── App.tsx                     # Integrazione di usePlanDebug e montaggio di AiDebugModal
└── i18n/locales/
    ├── en.json                 # Nuove chiavi localizzate debug.*
    └── it.json                 # Nuove chiavi localizzate debug.*
```

---

## Planned Implementation Phases

### Phase 1: Debug State Management (`usePlanDebug.ts`)
- Creazione di uno store/hook React per registrare la cronologia delle esecuzioni di AI Magic.
- Struttura del singolo log di debug:
  - `id`: string (UUID / timestamp)
  - `timestamp`: number
  - `model`: string
  - `status`: 'pending' | 'success' | 'empty' | 'error'
  - `promptText`: string (estratto della richiesta utente)
  - `signature`: string (struttura della cartella inviata)
  - `rawModelResponse`: object / string (JSON grezzo emesso dal modello)
  - `expandedOpsCount`: number (numero di operazioni estratte)
  - `errorDetails`: string (dettagli di eventuali eccezioni o timeout)

### Phase 2: Integrazione Pipeline Planner (`createPlanFromMessage.ts` & `App.tsx`)
- Registrazione automatica dei log in `usePlanDebug` all'inizio e alla fine della chiamata `createPlanFromMessage`.
- Gestione trasparente del fallback: se il piano generato ha 0 operazioni, la notifica UI mostra un avviso chiaro con il pulsante "Apri Debug" per diagnosticare l'esito.

### Phase 3: Visual Debug Panel Component (`AiDebugModal.tsx`)
- Realizzazione del componente overlay con:
  - **Status Header**: Stato del gateway local-AI (porta, risposta `/healthz`, provider attivi).
  - **Execution History List**: Elenco delle ultime chiamate a 🪄 AI Magic con badge colorati per lo stato (`SUCCESS`, `EMPTY`, `ERROR`).
  - **Detail Inspector**: Scheda espandibile per esaminare la risposta JSON del modello, le regole generate e le motivazioni dei file non abbinati.
  - **Copy Logs Action**: Bottone per copiare il report completo negli appunti.

### Phase 4: Chat Drawer & App UI Integration (`ChatDrawer.tsx` & `App.tsx`)
- Aggiunta di una piccola icona di debug (🛠️ / 🔍) nell'header di `ChatDrawer`.
- Collegamento dello stato `debugOpen` in `App.tsx`.
- Integrazione completa delle chiavi di traduzione `debug.*` in `en.json` e `it.json`.

---

## Verification & Testing Plan

1. **Unit Testing (Vitest)**:
   - `usePlanDebug.test.ts`: Verifica dell'inserimento dei log, del limite del ring buffer a 50 elementi e del reset.
   - `createPlanFromMessage.test.ts`: Verifica del corretto inoltro dei log di successo, piano vuoto ed errore allo store di debug.
2. **Integration Testing**:
   - Esecuzione di `npm test` da `fm/src/frontend/vite-project` per garantire che tutti i test frontend passino senza regressioni.
   - Esecuzione di `cargo test` nella directory `fm` per confermare la stabilità del backend Rust.
