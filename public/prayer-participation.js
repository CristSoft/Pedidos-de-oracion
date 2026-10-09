// A private browser receipt controls one public, anonymous participation record.
// Public records never expose the receipt needed to remove someone's prayer.
export async function setParticipation(sdk, db, prayerId, voterKey, praying, voteId, onlyIfMissing = false) {
  const { doc, runTransaction } = sdk;
  const parent = doc(db, 'prayerFeed', prayerId);
  const receipt = doc(parent, 'participationKeys', voterKey);
  return runTransaction(db, async transaction => {
    const request = await transaction.get(parent);
    if (!request.exists()) throw new Error('Este pedido ya no está disponible.');
    const previous = await transaction.get(receipt);
    const current = previous.data()?.voteId || null;
    if (onlyIfMissing && previous.exists()) return !!current;
    if (!!current === praying && previous.exists()) return praying;
    if (praying) {
      transaction.set(receipt, { voteId });
      transaction.set(doc(parent, 'participants', voteId), { praying: true });
      transaction.set(doc(parent, 'participantOwners', voteId), { key: voterKey });
    } else {
      transaction.set(receipt, { voteId: null });
      if (current) {
        transaction.delete(doc(parent, 'participants', current));
        transaction.delete(doc(parent, 'participantOwners', current));
      }
    }
    return praying;
  });
}

export function prayerCountText(count) {
  return `${count} ${count === 1 ? 'persona orando' : 'personas orando'}`;
}
