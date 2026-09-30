# Reading Page Completion remote ignore protocol

`WebDb.postIgnoreWords` normalizes requested expressions by trimming, lowercasing, dropping empty values, and removing duplicates. When at least one expression remains, it sends one request:

```http
POST /lr/ignores-if-absent
Content-Type: application/json

{"words":["alpha","beta"]}
```

The remote adapter must atomically process the whole batch. For every requested expression, it either creates a new ignore Learning Record or skips an existing Learning Record without changing any of that record's fields, including its first-accepted date. It must not expose a partial batch result.

New records are words with status `0`, an empty meaning, empty notes, tags, sentences and connections, and a first-accepted date assigned at creation. An existing record is preserved regardless of its type or learning status.

On a successful 2xx response, it returns a receipt whose `created` and `existing` arrays are disjoint and together contain each requested normalized expression exactly once:

```json
{
  "protocol": "create-ignores-if-absent-v1",
  "created": ["alpha"],
  "existing": ["beta"]
}
```

The operation is idempotent. Retrying after a completed request returns previously created expressions in `existing`; retrying after an interrupted request is safe because the server commits the complete batch atomically.

The client treats HTTP 404 or 405, or any malformed receipt, as `ignore_store_incompatible`. Other non-2xx responses and transport failures are `ignore_store_unavailable`. It never falls back to the legacy `/lr/ignores` route.

This repository contains the WebDb client and its protocol tests, but not the remote endpoint implementation. Remote deployments must implement this endpoint before Reading Page Completion can write ignore records; the desktop localhost bridge remains separate.
