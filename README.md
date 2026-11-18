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

For steps 4 and 5 it turns on the SDK's debug log and prints from it each
write in the request that was sent, and each result in the reply.

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
         request sent: 3 writes
           write 1: counters/a, count: increment { integerValue: '1' }
           write 2: counters/a, count: increment { integerValue: '1' }
           write 3: counters/a, count: increment { integerValue: '1' }
         reply received: 3 write results
           result 1: count { integerValue: '1' }
           result 2: count { integerValue: '2' }
           result 3: count { integerValue: '3' }
         count stored: 3
ALLOWED  3 updates of one document in one transaction
         request sent: 3 writes
           write 1: counters/b, count: increment { integerValue: '1' }
           write 2: counters/b, count: increment { integerValue: '1' }
           write 3: counters/b, count: increment { integerValue: '1' }
         reply received: 3 write results
           result 1: count { integerValue: '1' }
           result 2: count { integerValue: '2' }
           result 3: count { integerValue: '3' }
         count stored: 3
REFUSED  1 update, right after the batch  [permission-denied]
```

The cooldown holds between commits and not inside one.

These are three writes, not one. Each request holds three separate writes of
the same document, and the reply holds one result for each, with `count` at
1, then 2, then 3.

## Question: how is this billed?

The emulator does not bill, so this repo cannot tell.

The [billing page](https://firebase.google.com/docs/firestore/pricing) says
"each set or update operation counts as a single write". Is a commit like
this one billed as three document writes, or as one?

If it is three, a rule like this limits how often a document changes, and
not how many writes a client can be billed for.

## What this does not show

- Whether production Firestore behaves the same way.
- How many times the rule is evaluated for such a commit.

## Versions

firebase 12.12.1, firebase-tools 15.10.0, Node.js 22.21.1, Java 25.0.2, macOS.
