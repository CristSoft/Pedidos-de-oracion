// Five originals plus their public copies and ownership links stay within rules access limits.
export async function deleteRequestBatches(items, createBatch, references) {
  let deletedCount = 0;
  try {
    for (let start = 0; start < items.length; start += 5) {
      const batch = createBatch(), chunk = items.slice(start, start + 5);
      for (const item of chunk) for (const ref of references(item)) batch.delete(ref);
      await batch.commit();
      deletedCount += chunk.length;
    }
  } catch (error) {
    const failure = new Error(deletedCount
      ? `Se eliminaron ${deletedCount} pedidos, pero no pudimos terminar. Revisá la lista y volvé a intentar.`
      : 'No pudimos eliminar los pedidos. Revisá tu conexión y volvé a intentar.');
    failure.status = 400;
    failure.deletedCount = deletedCount;
    throw failure;
  }
  return { deletedCount };
}
