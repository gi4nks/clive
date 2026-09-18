# Feature Specification: Clive AI-Powered File Manager

**Feature Branch**: `main`  
**Created**: 2026-09-11  
**Status**: Draft  
**Input**: Requisiti funzionali e comportamentali della repository Clive (File Manager desktop con supporto AI assistito, dual-pane, organizzazione atomica e cestino di sistema).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gestione File Dual-Pane e Operazioni di Base (Priority: P1)

Come utente desktop, voglio navigare nel mio file system tramite un'interfaccia a due pannelli affiancati (dual-pane) ed eseguire le classiche operazioni sui file (copia, sposta, rinomina, elimina, anteprima) tramite tastiera o mouse, in modo rapido, intuitivo e privo di rischi.

**Why this priority**: Rappresenta la funzionalità essenziale e prioritaria dell'applicazione senza la quale l'esperienza di file management non sussiste.

**Independent Test**: Può essere testato in modo autonomo avviando l'applicazione, navigando tra cartelle su entrambi i pannelli, trasferendo file da un lato all'altro e verificando l'effettiva modifica su disco.

**Acceptance Scenarios**:

1. **Given** l'applicazione aperta con due pannelli affiancati, **When** l'utente seleziona uno o più file nel pannello attivo e preme la scorciatoia di copia/spostamento verso il pannello inattivo, **Then** i file vengono trasferiti nella directory di destinazione con indicazione di progresso e aggiornamento immediato della vista.
2. **Given** un file selezionato in un pannello, **When** l'utente attiva la rinomina inline o seleziona "Rinomina", **Then** viene offerto un campo di testo editabile con la selezione automatica del solo nome senza estensione.
3. **Given** un file o una directory selezionata, **When** l'utente richiede l'anteprima rapida (QuickLook), **Then** viene mostrata una finestra overlay contenente il rendering o il testo del file senza aprire applicazioni esterne.

---

### User Story 2 - Assistente AI Conversazionale e Proposte di Azione In-line (Priority: P2)

Come utente che gestisce cartelle disordinate, voglio interagire con un assistente AI via chat contestuale (drawer laterale) che comprende la struttura della cartella corrente e dei file selezionati, consentendomi di fare domande e ricevere proposte di riorganizzazione o rinomina eseguibili solo previa mia conferma esplicita.

**Why this priority**: Fornisce un valore aggiunto differenziante rispetto ai file manager classici, rendendo l'intelligenza artificiale un supporto operativo guidato dall'utente.

**Independent Test**: Può essere testato aprendo il drawer della chat AI in una cartella con file selezionati, chiedendo un'analisi o una rinomina e verificando che nessuna modifica su disco venga eseguita finché l'utente non clicca su "Applica" nella card in-line.

**Acceptance Scenarios**:

1. **Given** il drawer della chat AI aperto in una cartella con file selezionati, **When** l'utente invia un messaggio di richiesta ("Rinomina questi file secondo la data"), **Then** l'AI risponde in streaming mostrando il testo motivazionale e una card di azione con l'anteprima del vecchio e del nuovo nome.
2. **Given** una card di azione in-line generata dalla chat AI, **When** l'utente clicca su "Annulla" o ignora la proposta, **Then** il file system rimane completamente inalterato.
3. **Given** una card di azione in-line valida, **When** l'utente clicca su "Applica", **Then** l'operazione viene eseguita su disco, la card si aggiorna allo stato "✓ Applicata" e l'azione diventa annullabile.

---

### User Story 3 - Riorganizzazione di Massa Guidata (AI Plan) con Undo Atomico (Priority: P3)

Come utente con directory complesse o disorganizzate (es. Desktop o Download), voglio trasformare i suggerimenti strutturati dell'AI in un "Piano di Riorganizzazione" visivo ad albero dove posso rivedere, modificare, filtrare le singole mosse ed eseguire un'applicazione atomica rollbackabile anche dopo il riavvio dell'applicazione.

**Why this priority**: Permette di ristrutturare intere directory in sicurezza con una granularità totale di controllo prima e dopo l'esecuzione.

**Independent Test**: Può essere testato generando un piano da un messaggio della chat, escludendo alcune opzioni nel pannello ad albero, applicando il piano e successivamente cliccando "Annulla tutto" per verificare che lo stato della cartella sia ripristinato esattamente alle condizioni iniziali.

**Acceptance Scenarios**:

1. **Given** un messaggio della chat AI che propone un piano di riorganizzazione, **When** l'utente clicca sul pulsante "Crea piano", **Then** si apre un pannello modale ad albero che mostra le nuove cartelle da creare, gli spostamenti, le rinomine e i file da cestinare, con relativi filtri (checkbox).
2. **Given** il pannello del piano di riorganizzazione aperto, **When** l'utente modifica il nome di una cartella di destinazione o deseleziona determinati file, **Then** le statistiche del piano e le anteprime si aggiornano istantaneamente.
3. **Given** un piano applicato con successo, **When** l'utente sceglie "Annulla tutto" (anche dopo aver riavviato l'applicazione), **Then** il sistema esegue le operazioni inverse ripristinando la struttura originaria delle directory.

---

### User Story 4 - Protezione Percorsi di Sistema e Cestino Unificato (Priority: P4)

Come utente, voglio che l'applicazione protegga automaticamente le cartelle critiche del sistema operativo da modifiche accidentali o distruttive condotte dall'AI e gestisca l'eliminazione dei file tramite il cestino di sistema (Trash), evitando perdite di dati irrecuperabili.

**Why this priority**: Assicura la sicurezza del sistema operativo dell'utente ed evita la cancellazione definitiva accidentale di file importanti.

**Independent Test**: Può essere testato tentando di eseguire operazioni di cancellazione o rinomina su file o directory di sistema (es. `/System` o `/Applications`) o inviando file al cestino per verificare il loro recupero tramite il cestino di sistema.

**Acceptance Scenarios**:

1. **Given** un file o cartella appartenente a posizioni protette di sistema, **When** l'utente o l'AI tenta di proporre un'azione su di esso, **Then** il sistema contrassegna l'azione come non applicabile (disabilitata) con la segnalazione di "Percorso protetto".
2. **Given** un'operazione di eliminazione richiesta dall'utente o da un piano AI, **When** viene confermata l'eliminazione, **Then** i file vengono spostati nel cestino del sistema operativo invece di essere eliminati definitivamente.

---

### Edge Cases

- **Cosa succede se la connessione al provider AI o la chiave API non è valida?**
  L'interfaccia deve mostrare un banner di errore chiaro e azionabile ("Configurazione Provider Non Valida") senza bloccare la navigazione normale nel file manager dual-pane.
- **Cosa succede se si applica un piano AI e un file sorgente è stato nel frattempo rimosso o aperto in modo esclusivo?**
  L'operazione specifica per quel file viene contrassegnata come fallita con opportuno messaggio nel report, mentre le altre operazioni del piano proseguono senza interrompere l'intero batch.
- **Cosa succede se l'utente tenta di ripristinare (Undo) un piano le cui eliminazioni sono state permanentemente svuotate dal Cestino di sistema?**
  L'operazione di ripristino per i file cestinati riporta l'indicazione di file non più presente nel cestino, ma porta a termine il ripristino di tutte le altre mosse (spostamenti e rinomine).
- **Cosa succede con cartelle contenenti più di 5000 elementi durante la generazione di un piano AI?**
  Il pulsante di generazione piano viene disabilitato indicando che la directory supera la dimensione massima analizzabile in sicurezza.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Il sistema DEVE fornire un'interfaccia di navigazione file a doppio pannello (dual-pane) con supporto sia per interazione via mouse che da tastiera.
- **FR-002**: Il sistema DEVE consentire l'esecuzione delle operazioni fondamentali di file system: navigazione, creazione cartelle, copia, spostamento, rinomina inline e invio al cestino di sistema.
- **FR-003**: Il sistema DEVE integrare un assistente AI accessibile tramite drawer laterale contestuale capace di leggere l'elenco della directory corrente e dei file selezionati.
- **FR-004**: Il sistema DEVE garantire che QUALSIASI modifica al file system proposta dall'AI (tramite chat o piano) sia preventivamente sottoposta ad approvazione esplicita dell'utente prima dell'esecuzione su disco.
- **FR-005**: Il sistema DEVE supportare la generazione di un "Piano di Riorganizzazione" visuale ad albero a partire dalle analisi testuali dell'AI.
- **FR-006**: Il sistema DEVE permettere la personalizzazione puntuale del Piano di Riorganizzazione prima dell'esecuzione (inclusione/esclusione di singole mosse, rinomina cartelle target).
- **FR-007**: Il sistema DEVE registrare un giornale di esecuzione delle operazioni dei piani applicati per consentire il ripristino completo ("Undo tutto") persistente tra sessioni.
- **FR-008**: Il sistema DEVE integrare un meccanismo di guardia (System Location Guard) che blocca in modo autoritativo le operazioni su percorsi critici di sistema.
- **FR-009**: Il sistema DEVE supportare la configurazione locale dei provider AI fornendo indicazioni chiare in caso di errore o assenza di credenziali.
- **FR-010**: Il sistema DEVE mostrare lo stato di avanzamento per le operazioni batch prolungate e fornire resoconti trasparenti sugli esiti (applicate, fallite, saltate).

---

### Key Entities

- **FileEntry**: Rappresenta un elemento del file system (file o directory) identificato da percorso assoluto, nome, dimensione, data di modifica e flag di directory/protezione.
- **ChatAction**: Singola proposta di modifica generata dall'assistente AI (rinomina, spostamento, creazione o cestinamento) collegata a una scheda di conferma nella chat.
- **Plan**: Insieme strutturato ad albero di opzioni di riorganizzazione che descrive la creazione di nuove sottocartelle e l'assegnazione o rinomina dei file presenti nella directory corrente.
- **PlanOp**: Singola operazione elementare facente parte di un Plan (`createFolder`, `rename`, `move`, `trash`), dotata di stato di inclusione ed eventuali note di collisione/blocco.
- **PlanJournal**: Registro persistente su disco che memorizza la sequenza inversa delle operazioni eseguite in un batch per permetterne il rollback preciso.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Gli utenti possono eseguire le normali operazioni di file management (navigazione dual-pane, copia, rinomina) con una risposta visiva dell'interfaccia inferiore a 100ms.
- **SC-002**: Nessuna operazione proposta dall'intelligenza artificiale viene eseguita su disco senza la conferma cliccata dell'utente (100% rispetto della sicurezza).
- **SC-003**: In seguito all'applicazione di un piano di riorganizzazione, la funzione "Annulla tutto" ripristina lo stato iniziale della cartella per il 100% delle operazioni non alterate esternamente.
- **SC-004**: L'integrazione del System Location Guard impedisce la modifica o l'eliminazione accidentale delle posizioni protette di sistema nel 100% dei tentativi guidati dall'AI.
- **SC-005**: Le risposte della chat AI vengono rese disponibili all'utente in modalità streaming entro 1 secondo dall'inizio dell'emissione da parte del provider.

---

## Assumptions

- L'applicazione viene eseguita in ambiente desktop (macOS/Linux/Windows) con privilegi utente standard.
- L'utente fornisce una chiave API valida o un endpoint locale funzionante per il provider AI scelto.
- L'eliminazione dei file sfrutta il Cestino del sistema operativo ospitante (es. macOS Trash), permettendo il ripristino standard fino allo svuotamento dello stesso.
- La riorganizzazione di massa tramite AI Plan opera sulla cartella attiva di primo livello senza ricorsione profonda automatica in sottodirectory preesistenti nella versione corrente.
