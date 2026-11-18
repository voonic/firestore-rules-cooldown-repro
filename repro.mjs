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

// "ALLOWED" or "REFUSED", as the rules decide `write`.
async function verdict(label, write) {
  try {
    await write();
    return `ALLOWED  ${label}`;
  } catch (e) {
    return `REFUSED  ${label}  [${e.code}]`;
  }
}

// Sends one commit and prints the verdict. Then prints, from the SDK's debug
// log, every write the request held and every result the reply held.
async function commit(label, write) {
  const log = [];
  const print = console.log;
  console.log = (...args) => log.push(args.join(" ").replace(/\s+/g, " "));
  setLogLevel("debug");
  const line = await verdict(label, write);
  setLogLevel("silent");
  console.log = print;
  console.log(line);

  const request = log.find((entry) => entry.includes("updateTransforms:")) ?? "";
  const reply = log.find((entry) => entry.includes("transformResults:")) ?? "";
  const writes = [...request.matchAll(/documents\/(\S+)'.*?increment: (\{.*?\})/g)];
  const results = [...reply.matchAll(/transformResults: \[ (\{.*?\})/g)];
  console.log(`         request sent: ${writes.length} writes`);
  writes.forEach(([, path, by], i) =>
    console.log(`           write ${i + 1}: ${path}, count: increment ${by}`));
  console.log(`         reply received: ${results.length} write results`);
  results.forEach(([, count], i) =>
    console.log(`           result ${i + 1}: count ${count}`));
}

const a = doc(db, "counters/a");
const b = doc(db, "counters/b");
await setDoc(a, { count: 0, updatedAt: serverTimestamp() });
await setDoc(b, { count: 0, updatedAt: serverTimestamp() });

console.log(await verdict("1 update, right after the create",
  () => updateDoc(a, edit())));

await new Promise((resolve) => setTimeout(resolve, 5500));

await commit("3 updates of one document in one batch", () => {
  const batch = writeBatch(db);
  for (let i = 0; i < 3; i++) batch.update(a, edit());
  return batch.commit();
});
console.log(`         count stored: ${(await getDoc(a)).data().count}`);

await commit("3 updates of one document in one transaction", () =>
  runTransaction(db, async (tx) => {
    for (let i = 0; i < 3; i++) tx.update(b, edit());
  }));
console.log(`         count stored: ${(await getDoc(b)).data().count}`);

console.log(await verdict("1 update, right after the batch",
  () => updateDoc(a, edit())));

process.exit(0);
