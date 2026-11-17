const viewOk    = document.getElementById('view-ok');
const viewForm  = document.getElementById('view-form');
const keyInput  = document.getElementById('key-input');
const keyError   = document.getElementById('key-error');
const btnSave    = document.getElementById('btn-save');
const btnChange  = document.getElementById('btn-change');

// Localized text from _locales/<lang>/messages.json
const t = (key) => chrome.i18n.getMessage(key);

function localize() {
  document.documentElement.lang = t('htmlLang');
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
}

async function init() {
  localize();
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
  keyInput.removeAttribute('aria-invalid');
  keyError.hidden = true;
}

btnChange.addEventListener('click', () => showForm());

keyInput.addEventListener('input', () => keyInput.removeAttribute('aria-invalid'));

viewForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const key = keyInput.value.trim();
  if (!key) return;

  keyError.hidden = true;
  btnSave.disabled = true;
  btnSave.textContent = t('popupChecking');

  const result = await chrome.runtime.sendMessage({ type: 'VALIDATE_KEY', key });

  btnSave.disabled = false;
  btnSave.textContent = t('popupSave');

  if (!result?.valid) {
    keyError.textContent =
      result?.error === 'TIMEOUT'       ? t('popupErrorTimeout') :
      result?.error === 'NETWORK_ERROR' ? t('popupErrorNetwork') :
                                          t('popupErrorDenied');
    keyError.hidden = false;
    keyInput.setAttribute('aria-invalid', 'true');
    keyInput.focus();
    return;
  }

  await chrome.storage.local.set({ apiKey: key, apiMode: result.apiMode });
  showOk();
});

init();
