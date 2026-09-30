# Language Learner

Language Learner manages reading, lookup, learning, and review records inside an Obsidian vault.

## Language

**Text Database Publication**:
A refresh of language-learning records into Markdown-facing collections that other Obsidian workflows can consume. It covers both lookup material and spaced-repetition material.
_Avoid_: Sync, export, refresh

**Word Database**:
A Markdown-facing collection of expressions grouped for lookup and completion.
_Avoid_: Word export, autocomplete file

**Review Database**:
A Markdown-facing collection of expressions prepared for spaced repetition, including existing review metadata when present.
_Avoid_: SR file, review export

**Reading Document**:
An Obsidian note structured for reading mode, with article, words, notes, and reading-progress material.
_Avoid_: Reading state, reading view, reading service

**Reading Session**:
An active passage through a Reading Document, with a current visible location and a session-specific page size. A Reading Session is temporary; only its confirmed reading position is retained in the Reading Document.
_Avoid_: Reading state, reader session

**Reading Page Ledger**:
The inventory of expressions and their learning statuses appearing on the active page of a Reading Session, used for page rendering and batch review/ignore transitions without DOM inspection.
_Avoid_: DOM words, page tokens, ignore list

**Reading Page Completion**:
The acceptance of a confirmed Reading Page Ledger for completion, creating ignore Learning Records only for expressions that remain unrecorded and preserving existing Learning Records. It belongs to the captured page even if the reader subsequently navigates elsewhere.
_Avoid_: Ignore submission, finish request, page save

**Reading Selection**:
The captured passage context (the studied expression, its enclosing sentence in the Reading Document, and the document origin) extracted during reading to initiate lookup or learning record intake.
_Avoid_: Click target, DOM event, word selection

**Learning Record Draft**:
An editable proposal for a new or updated Learning Record, prepared from a Reading Selection or an existing Learning Record. Its contents become authoritative only when committed through Learning Record Intake.
_Avoid_: Learning form, preparation result, expression model

**Learning Record Intake**:
The acceptance of a new or updated learning record as one complete domain operation, including the resulting publication and reader-visible updates.
_Avoid_: Expression recording, submission, save

**Learning Record**:
The authoritative record for a studied word or phrase, including its meaning, learning status, tags, notes, and example sentences. Markdown databases, statistics, and reading markers are derived representations of Learning Records.
_Avoid_: Expression info, word data, vocabulary entry

**Lookup Provider**:
An external reference or translation source integrated behind the lookup seam to provide definitions, audio, grammatical notes, or machine translation for expressions and sentences.
_Avoid_: Dictionary engine, dict API, translator service

**Learning Record Statistics**:
The chronological and category-level aggregations derived from Learning Records over specified time windows (e.g., daily counts, ignored vs. studied progression, accumulated total). Calculated by pure aggregation functions decoupled from persistence storage engines.
_Avoid_: Chart data, countSeven, DB metrics
