import { summarizeRequests } from './prayer-summary.js';

let activeController;
const $ = selector => document.querySelector(selector);
export function clearSummarySession() { activeController?.abort(); $('#share-dialog').close(); }
export function shareText(text, navigatorImpl = navigator) {
  if (typeof navigatorImpl.share !== 'function') throw new Error('Este navegador no ofrece Compartir del sistema. Podés copiar el texto.');
  if (navigatorImpl.canShare && !navigatorImpl.canShare({ text })) throw new Error('El sistema no puede compartir este texto. Podés copiarlo.');
  return navigatorImpl.share({ text });
}

function openDialog(dialog) { dialog.showModal(); document.body.classList.add('dialog-open'); }

export function setupAdminActions({ api, toast, refresh }) {
  const share = $('#share-all'), remove = $('#delete-all');
  share.onclick = () => showSummary({ api, toast });
  remove.onclick = async () => {
    share.disabled = remove.disabled = true;
    try {
      // Freeze the confirmed IDs: submissions arriving afterwards are preserved.
      const snapshot = await api('/requests');
      if (!snapshot.length) { toast('No hay pedidos para eliminar.'); await refresh(); return; }
      const dialog = $('#delete-all-dialog');
      $('#delete-all-description').textContent = `Se eliminarán los ${snapshot.length} pedidos actuales, incluidos los que no se ven por los filtros, junto con todos sus motivos y copias públicas. No se puede deshacer.`;
      const confirmed = await new Promise(resolve => {
        dialog.returnValue = 'cancel';
        dialog.onclose = () => { document.body.classList.remove('dialog-open'); resolve(dialog.returnValue === 'confirm'); };
        openDialog(dialog);
      });
      if (!confirmed) return;
      remove.textContent = 'Eliminando pedidos…';
      try {
        const result = await api('/requests', 'DELETE', { ids: snapshot.map(item => item.id) });
        toast(`${result.deletedCount} pedidos eliminados.`);
      } finally {
        await refresh();
      }
    } catch (error) { toast(error.message); }
    finally {
      if (remove.isConnected) { remove.textContent = 'Eliminar todos los pedidos'; share.disabled = remove.disabled = false; }
    }
  };
}

function showSummary({ api, toast }) {
  const dialog = $('#share-dialog');
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="share-title">Compartir todos los pedidos</h2><button type="button" class="icon-button" id="close-share" aria-label="Cerrar">×</button></div>
    <div class="share-content"><p>Gemini resumirá todos los pedidos, agrupados por nombre. Los nombres ocultos seguirán anónimos.</p>
    <p class="field-help">El resumen se genera automáticamente. Los nombres visibles y los motivos se procesan con Gemini.</p>
    <p id="summary-progress" role="status" aria-live="polite" hidden></p><p id="summary-error" class="error" role="alert" hidden></p>
    <button type="button" class="secondary" id="retry-summary" hidden>Volver a intentar</button>
    <div id="summary-result" hidden><label class="field-label" for="summary-text">Texto para WhatsApp · Podés editarlo</label><textarea id="summary-text" rows="12"></textarea>
    <p class="field-help">Los nombres entre *asteriscos* se mostrarán en negrita en WhatsApp. Revisá el resumen antes de compartir.</p>
    <div class="share-actions"><button class="primary" type="button" id="share-summary">Compartir</button><button class="secondary" type="button" id="copy-summary">Copiar texto</button><button class="secondary" type="button" id="regenerate-summary">Volver a generar</button></div></div></div>`;
  const controller = new AbortController(); activeController = controller;
  dialog.onclose = () => {
    controller.abort(); $('#summary-text').value = '';
    document.body.classList.remove('dialog-open');
  };
  $('#close-share').onclick = () => dialog.close();
  const errorBox = $('#summary-error'), progress = $('#summary-progress'), retry = $('#retry-summary'), result = $('#summary-result'), text = $('#summary-text');
  const fail = message => { errorBox.textContent = message; errorBox.hidden = false; };
  async function generate() {
    errorBox.hidden = true; retry.hidden = result.hidden = true; progress.hidden = false; progress.textContent = 'Consultando todos los pedidos…';
    try {
      const snapshot = await api('/requests');
      if (controller.signal.aborted) return;
      text.value = await summarizeRequests(snapshot, (entries, options) => api('/summary', 'POST', { entries }, options), { signal: controller.signal,
        onProgress: (current, total) => { progress.textContent = `Resumiendo con Gemini… ${current} de ${total}`; }
      });
      if (controller.signal.aborted) return;
      result.hidden = false;
      if (typeof navigator.share !== 'function') fail('Este navegador no ofrece Compartir del sistema. Usá Copiar texto.');
      $('#share-summary').disabled = typeof navigator.share !== 'function';
      $('#share-summary').focus();
    } catch (error) {
      if (controller.signal.aborted) return;
      fail(error.message); retry.hidden = false;
    } finally { if (!controller.signal.aborted) progress.hidden = true; }
  }
  retry.onclick = generate;
  $('#regenerate-summary').onclick = generate;
  text.oninput = () => { $('#share-summary').disabled = !text.value.trim() || typeof navigator.share !== 'function'; $('#copy-summary').disabled = !text.value.trim(); };
  $('#share-summary').onclick = async () => {
    errorBox.hidden = true;
    const button = $('#share-summary'); button.disabled = true;
    try {
      // Invoke synchronously from the click to preserve native user activation.
      await shareText(text.value);
      toast('Texto compartido.');
    } catch (error) { if (error.name !== 'AbortError') fail(error.message || 'No pudimos abrir Compartir. Podés copiar el texto.'); }
    finally { button.disabled = !text.value.trim(); }
  };
  $('#copy-summary').onclick = async () => {
    try { await navigator.clipboard.writeText(text.value); toast('Texto copiado para WhatsApp.'); }
    catch { text.focus(); text.select(); fail('Seleccionamos el texto. Copialo desde el menú de tu dispositivo.'); }
  };
  openDialog(dialog);
  generate();
}
