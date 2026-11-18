# Firestore rules: several writes to one document in one commit

A security rule that lets a document be written at most once every 5 seconds
lets it be written 3 times at once, when the 3 writes are sent in one batch or
one transaction.

Seen in the Firestore emulator. Production has not been tested.

## Run it

```bash
npm it
```

That is short for `npm install-test`: it installs the two dependencies, starts
the Firestore emulator, runs `repro.mjs` against it and stops the emulator.

You need Node.js 20 or newer, and Java 21 or newer for the emulator. No
Firebase account or project is needed: `demo-repro` is a local-only project id.

## The rule

`firestore.rules` holds one rule, a per-document cooldown:

```
match /counters/{id} {
  allow get: if true;
  allow create: if request.resource.data.updatedAt == request.time;
  allow update: if request.resource.data.updatedAt == request.time
                && request.time > resource.data.updatedAt + duration.value(5, 's');
}
```

A write must stamp the server's time, and an update is allowed only when the
stored stamp is more than 5 seconds old. It is the per-document rate limit
often recommended for Firestore, for example in
https://stackoverflow.com/a/56487579.

## What the script does

`repro.mjs` uses the Firebase web SDK. Every update adds 1 to `count` and
stamps `updatedAt`.

1. Creates two documents, each with `count: 0`.
2. Updates the first one right away.
3. Waits 5.5 seconds.
4. Sends 3 updates of the first document in one batch.
5. Sends 3 updates of the second document in one transaction.
6. Updates the first document again right away.

## Result

| Step | If the cooldown held for every write | What happens |
|---|---|---|
| 2 | refused | refused |
| 4 | refused | allowed, and `count` is 3 |
| 5 | refused | allowed, and `count` is 3 |
| 6 | refused | refused |

Output:

```
REFUSED  1 update, right after the create  [permission-denied]
ALLOWED  3 updates of one document in one batch
         count: 3
ALLOWED  3 updates of one document in one transaction
         count: 3
REFUSED  1 update, right after the batch  [permission-denied]
```

The cooldown holds between commits and not inside one. All three writes are
applied: the counter ends at 3.

## What this does not show

- Whether production Firestore behaves the same way.
- How many times the rule is evaluated for such a commit.
- How such a commit is billed.

## Versions

firebase 12.12.1, firebase-tools 15.10.0, Node.js 22.21.1, Java 25.0.2, macOS.
