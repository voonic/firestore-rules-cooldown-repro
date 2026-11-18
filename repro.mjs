import { initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator, doc, getDoc, getFirestore, increment,
  runTransaction, serverTimestamp, setDoc, setLogLevel, updateDoc, writeBatch,
} from "firebase/firestore";

setLogLevel("silent"); // refusals are printed below, with their code
const db = getFirestore(initializeApp({ projectId: "demo-repro" }));
connectFirestoreEmulator(db, "127.0.0.1", 8080);

// One edit: add 1 to `count` and stamp the server's time.
const edit = () => ({ count: increment(1), updatedAt: serverTimestamp() });

async function attempt(label, write) {
  try {
    await write();
    console.log(`ALLOWED  ${label}`);
  } catch (e) {
    console.log(`REFUSED  ${label}  [${e.code}]`);
  }
}

const a = doc(db, "counters/a");
const b = doc(db, "counters/b");
await setDoc(a, { count: 0, updatedAt: serverTimestamp() });
await setDoc(b, { count: 0, updatedAt: serverTimestamp() });

await attempt("1 update, right after the create", () => updateDoc(a, edit()));

await new Promise((resolve) => setTimeout(resolve, 5500));

await attempt("3 updates of one document in one batch", () => {
  const batch = writeBatch(db);
  for (let i = 0; i < 3; i++) batch.update(a, edit());
  return batch.commit();
});
console.log(`         count: ${(await getDoc(a)).data().count}`);

await attempt("3 updates of one document in one transaction", () =>
  runTransaction(db, async (tx) => {
    for (let i = 0; i < 3; i++) tx.update(b, edit());
  }));
console.log(`         count: ${(await getDoc(b)).data().count}`);

await attempt("1 update, right after the batch", () => updateDoc(a, edit()));

process.exit(0);
