const PAGE_SIZE = 10;
const state = { page: 0, total: 0 };

const els = {
  tbody:     document.querySelector('#records tbody'),
  pageInfo:  document.querySelector('#page-info'),
  prevBtn:   document.querySelector('#prev-btn'),
  nextBtn:   document.querySelector('#next-btn'),
  status:    document.querySelector('#status'),
  uploadBtn: document.querySelector('#upload-btn'),
  uploadFile:document.querySelector('#upload-file'),
  checkBtn:  document.querySelector('#check-btn'),
};

function setStatus(msg, kind) {
  els.status.textContent = msg || '';
  els.status.className = kind || '';
}

async function loadPage(page) {
  setStatus('Loading…');
  try {
    const res = await fetch(`/api/compiled?page=${page}&limit=${PAGE_SIZE}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    state.page = data.page;
    state.total = data.total;
    renderRows(data.rows);
    renderPager();
    setStatus('');
  } catch (err) {
    setStatus(`Load failed: ${err.message}`, 'error');
  }
}

function renderRows(rows) {
  els.tbody.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.dataset.pk = row.name_with_valid_delimiters;

    tr.appendChild(cell(row.first_word, { readOnly: true }));
    tr.appendChild(cell(row.canonical_name, { field: 'canonical_name' }));
    tr.appendChild(cell(row.tag, { field: 'tag' }));
    tr.appendChild(cell(row.comments || '', { field: 'comments' }));
    tr.appendChild(cell(row.date || '', { readOnly: true }));
    tr.appendChild(cell(row.associated_record_identifier || '', { readOnly: true, pk: true }));

    els.tbody.appendChild(tr);
  }
}

function cell(value, opts = {}) {
  const td = document.createElement('td');
  td.textContent = value;
  if (opts.pk) td.classList.add('pk');
  if (!opts.readOnly) {
    td.contentEditable = 'true';
    td.dataset.original = value;
    td.addEventListener('blur', () => saveField(td, opts.field));
    td.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); td.blur(); }
      if (e.key === 'Escape') { td.textContent = td.dataset.original; td.blur(); }
    });
  }
  return td;
}

async function saveField(td, field) {
  const pk = td.closest('tr').dataset.pk;
  const original = td.dataset.original;
  const value = td.textContent;
  if (value === original) return;

  try {
    const res = await fetch('/api/compiled', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pk, changes: { [field]: value } }),
    });
    if (!res.ok) throw new Error(await res.text());
    td.dataset.original = value;
    setStatus('Saved', 'success');
    setTimeout(() => setStatus(''), 1200);
  } catch (err) {
    td.textContent = original;
    setStatus(`Save failed: ${err.message}`, 'error');
  }
}

function renderPager() {
  const start = state.total ? state.page * PAGE_SIZE + 1 : 0;
  const end   = Math.min((state.page + 1) * PAGE_SIZE, state.total);
  els.pageInfo.textContent = state.total ? `${start}–${end} of ${state.total}` : 'No records';
  els.prevBtn.disabled = state.page === 0;
  els.nextBtn.disabled = (state.page + 1) * PAGE_SIZE >= state.total;
}

els.prevBtn.addEventListener('click', () => loadPage(state.page - 1));
els.nextBtn.addEventListener('click', () => loadPage(state.page + 1));

els.uploadBtn.addEventListener('click', () => els.uploadFile.click());
els.uploadFile.addEventListener('change', async () => {
  const file = els.uploadFile.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  setStatus('Uploading…');
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await res.text());
    setStatus('Uploaded', 'success');
    els.uploadFile.value = '';
  } catch (err) {
    setStatus(`Upload failed: ${err.message}`, 'error');
  }
});

els.checkBtn.addEventListener('click', async () => {
  if (!confirm('Run check and convert?')) return;
  setStatus('Running…');
  try {
    const res = await fetch('/api/check', { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    const result = await res.json();
    setStatus(`Converted ${result.converted}, deleted ${result.deleted}`, 'success');
    loadPage(0);
  } catch (err) {
    setStatus(`Check failed: ${err.message}`, 'error');
  }
});

loadPage(0);