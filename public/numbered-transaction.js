// Security rules can reject a stale reservation before Firestore reports contention.
// Retry only when the shared counter advanced after this transaction read it.
export async function runWithNumberRetry(transaction, readLatestNumber) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let observed;
    try { return await transaction(value => { observed = value; }); }
    catch (error) {
      if (error.code !== 'permission-denied' || !Number.isSafeInteger(observed) || attempt === 4
        || await readLatestNumber() <= observed) throw error;
    }
  }
}
