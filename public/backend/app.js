const statusEl = document.getElementById('status');
const userEmailEl = document.getElementById('user-email');
const addBtn = document.getElementById('add-btn');
const logoutBtn = document.getElementById('logout-btn');
const tableBody = document.querySelector('#urls-table tbody');
const tpl = document.getElementById('row-template');

const modalForm = document.getElementById('modal-form');
const formEl = document.getElementById('url-form');
const formTitleEl = document.getElementById('form-title');
const modalConfirm = document.getElementById('modal-confirm');
const confirmText = document.getElementById('confirm-text');

let kc; // Keycloak instance
let token = '';
let tokenTimer;

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

function setStatus(msg) { statusEl.textContent = msg || ''; }

function normalizeGroupName(name) {
  return (name || '').replace(/^\//, '');
}

function isAuthorized(groups, cfg) {
  const required = normalizeGroupName(cfg.userGroup || '');
  const admin = normalizeGroupName(cfg.adminGroup || '');
  if (!required) return true; // no requirement
  const set = new Set((groups || []).map(normalizeGroupName));
  if (set.has(required)) return true;
  if (admin && set.has(admin)) return true;
  return false;
}

function showUnauthorized(cfg) {
  const main = document.querySelector('main');
  if (main) {
    main.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'unauthorized';
    const req = cfg.userGroup ? `Groupe requis: ${cfg.userGroup}` : '';
    const adminInfo = cfg.adminGroup ? `; Groupe admin: ${cfg.adminGroup}` : '';
    box.innerHTML = `<h2>Accès non autorisé</h2><p>Vous n'êtes pas autorisé à accéder à cette application.</p><p>${req}${adminInfo}</p>`;
    main.appendChild(box);
  }
  setStatus("Accès refusé");
}

async function authInit() {
  const cfg = window.KEYCLOAK_CONFIG || { url: '', realm: '', clientId: 'urlshort' };
  kc = new Keycloak({ url: cfg.url, realm: cfg.realm, clientId: cfg.clientId });
  const authenticated = await kc.init({ onLoad: 'login-required', checkLoginIframe: false, pkceMethod: 'S256' });
  if (!authenticated) throw new Error('not authenticated');
  token = kc.token || '';
  userEmailEl.textContent = kc.tokenParsed?.email || kc.tokenParsed?.preferred_username || '';
  const userGroups = Array.isArray(kc.tokenParsed?.groups) ? kc.tokenParsed.groups : [];
  if (!isAuthorized(userGroups, cfg)) {
    showUnauthorized(cfg);
    return false;
  }
  scheduleTokenRefresh();
  return true;
}

function scheduleTokenRefresh() {
  if (!kc) return;
  clearTimeout(tokenTimer);
  tokenTimer = setTimeout(async () => {
    try {
      await kc.updateToken(30); // refresh if will expire in 30s
      token = kc.token || token;
    } catch (e) {
      console.error('Token refresh failed', e);
    } finally {
      scheduleTokenRefresh();
    }
  }, 20000);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function renderRows(items) {
  tableBody.innerHTML = '';
  for (const it of items) {
    const tr = tpl.content.firstElementChild.cloneNode(true);
    tr.querySelector('.label').textContent = it.label;
    tr.querySelector('.code').textContent = it.code;
    const longCell = tr.querySelector('.longUrl');
    const a = document.createElement('a');
    a.href = it.longUrl; a.textContent = it.longUrl; a.target = '_blank';
    longCell.appendChild(a);
    const expCell = tr.querySelector('.expiresAt');
    if (it.expiresAt) {
      expCell.textContent = fmtDate(it.expiresAt);
      const d = new Date(it.expiresAt);
      if (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now()) {
        const icon = document.createElement('span');
        icon.className = 'icon warn';
        icon.title = 'Lien expiré';
        icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v2h2v-2zm0-8h-2v6h2V10z"/></svg>';
        expCell.appendChild(icon);
      }
    } else {
      expCell.textContent = '';
    }
    tr.querySelector('.clickCount').textContent = String(it.clickCount ?? 0);
    tr.querySelector('.lastAccessAt').textContent = it.lastAccessAt ? fmtDate(it.lastAccessAt) : '';
    tr.title = `createdBy: ${it.createdBy}\ncreatedAt: ${fmtDate(it.createdAt)}\nupdatedBy: ${it.updatedBy}\nupdatedAt: ${fmtDate(it.updatedAt)}`;

    const actions = tr.querySelector('.actions');
    const btnCopy = document.createElement('button');
    btnCopy.textContent = 'Copier';
    btnCopy.addEventListener('click', async () => {
      const url = `${location.origin}/${it.code}`;
      await navigator.clipboard.writeText(url);
      setStatus('Lien copié');
      setTimeout(() => setStatus(''), 1200);
    });

    const btnEdit = document.createElement('button');
    btnEdit.textContent = 'Éditer';
    btnEdit.addEventListener('click', () => openEdit(it));

    const btnDel = document.createElement('button');
    btnDel.textContent = 'Supprimer';
    btnDel.classList.add('danger');
    btnDel.addEventListener('click', () => confirmDelete(it));

    actions.append(btnCopy, btnEdit, btnDel);
    tableBody.appendChild(tr);
  }
}

async function refreshList() {
  setStatus('Chargement...');
  try {
    const items = await api('/api/url');
    renderRows(items);
  } catch (e) {
    console.error(e);
    setStatus('Erreur de chargement');
  } finally {
    setStatus('');
  }
}

function openAdd() {
  formTitleEl.textContent = 'Ajouter';
  formEl.reset();
  formEl.elements.code.value = '';
  modalForm.showModal();
}

function openEdit(it) {
  formTitleEl.textContent = 'Éditer';
  formEl.reset();
  formEl.elements.code.value = it.code;
  formEl.elements.label.value = it.label;
  formEl.elements.longUrl.value = it.longUrl;
  formEl.elements.expiresAt.value = it.expiresAt ? new Date(it.expiresAt).toISOString().slice(0,16) : '';
  modalForm.showModal();
}

async function submitForm(ev) {
  ev.preventDefault();
  const data = Object.fromEntries(new FormData(formEl).entries());
  const payload = {
    label: data.label,
    longUrl: data.longUrl,
    expiresAt: data.expiresAt || null,
  };
  try {
    if (data.code) {
      await api('/api/url', { method: 'PUT', body: JSON.stringify({ ...payload, code: data.code }) });
      setStatus('Mise à jour effectuée');
    } else {
      await api('/api/url', { method: 'POST', body: JSON.stringify(payload) });
      setStatus('Créé avec succès');
    }
    modalForm.close();
    await refreshList();
  } catch (e) {
    console.error(e);
    setStatus('Erreur: ' + (e.message || 'inconnue'));
  }
}

function confirmDelete(it) {
  confirmText.textContent = `Supprimer ${it.label} (${it.code}) ?`;
  modalConfirm.showModal();
  const onClose = async () => {
    if (modalConfirm.returnValue === 'confirm') {
      try {
        await api('/api/url', { method: 'DELETE', body: JSON.stringify({ code: it.code }) });
        setStatus('Supprimé');
        await refreshList();
      } catch (e) {
        console.error(e);
        setStatus('Erreur lors de la suppression');
      }
    }
    modalConfirm.removeEventListener('close', onClose);
  };
  modalConfirm.addEventListener('close', onClose);
}

async function waitForKeycloakAdapter() {
  for (let i = 0; i < 50; i++) {
    if (typeof window.Keycloak !== 'undefined') return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Keycloak adapter not loaded');
}

async function main() {
  try {
    await waitForKeycloakAdapter();
    const ok = await authInit();
    if (ok) await refreshList();
  } catch (e) {
    console.error(e);
    setStatus('Auth échouée');
  }
}

addBtn.addEventListener('click', openAdd);
logoutBtn.addEventListener('click', () => kc?.logout({ redirectUri: location.origin + '/backend' }));
formEl.addEventListener('submit', submitForm);
document.getElementById('cancel-btn').addEventListener('click', (e) => { e.preventDefault(); modalForm.close(); });

main();
