---
status: accepted
---

# Centralize Learning Record Intake behind one commit seam

Learning Record Intake is one serialized domain operation exposed through a single `accept(unknown)` interface shared by the Vue and localhost adapters. The module owns authoritative validation, lowercase identity normalization, whole-record upsert, first-accepted date preservation, and structured outcomes; an atomic record-store commit is the irreversible commit point because Learning Records are authoritative and their Reading Document, statistics, Word Database, and Review Database representations cannot participate in the same transaction.

After commit, reader updates, statistics updates, and both Text Database Publication targets run independently and settle before intake returns; their failures are reported without rollback, cancellation, or resubmission, and publication retry remains a separate operation. LocalDb and WebDb must return an atomic create/update receipt, so an incompatible remote adapter fails explicitly rather than approximating the invariant with `get` followed by `post`.

## Considered options

- Keeping orchestration in each input adapter was rejected because validation, publication, and update behavior had already diverged.
- A policy catalog was deferred until a second real intake policy exists; adding it now would create a hypothetical seam.
- Binding presentation callbacks into the interface was rejected because Notice and HTTP mapping belong to adapters and would reduce module depth.

## Consequences

- Calls are FIFO and cannot be cancelled once accepted; post-commit work may increase response time.
- Expected failures resolve as `rejected`, `notCommitted`, or `committed` with post-commit outcomes; only programming errors reject the Promise.
- The remote record-store protocol must be upgraded to return the committed Learning Record and whether it was created or updated.
