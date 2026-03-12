const viewOk    = document.getElementById('view-ok');
const viewForm  = document.getElementById('view-form');
const keyInput  = document.getElementById('key-input');
const keyError   = document.getElementById('key-error');
const btnSave    = document.getElementById('btn-save');
const btnChange  = document.getElementById('btn-change');

async function init() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (apiKey) { showOk(); } else { showForm(); }
}

function showOk() {
  viewOk.hidden = false;
  viewForm.hidden = true;
}

function showForm() {
  viewOk.hidden = true;
  viewForm.hidden = false;
  keyInput.value = '';
  keyError.hidden = true;
}

btnChange.addEventListener('click', () => showForm());

btnSave.addEventListener('click', async () => {
  const key = keyInput.value.trim();
  if (!key) return;

  keyError.hidden = true;
  btnSave.disabled = true;
  btnSave.textContent = 'Vérification…';

  const result = await chrome.runtime.sendMessage({ type: 'VALIDATE_KEY', key });

  btnSave.disabled = false;
  btnSave.textContent = 'Enregistrer';

  if (!result?.valid) {
    keyError.textContent =
      result?.error === 'TIMEOUT'       ? 'Délai dépassé — vérifiez votre connexion.' :
      result?.error === 'NETWORK_ERROR' ? 'Erreur réseau — vérifiez votre connexion.' :
                                          'Clé API refusée — vérifiez qu\'elle autorise l\'API Places.';
    keyError.hidden = false;
    return;
  }

  await chrome.storage.local.set({ apiKey: key });
  showOk();
});

init();
