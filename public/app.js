const PAGE_SIZE = 10;
const state = { page: 0, total: 0, searchQuery: '' };

const els = {
  tbody:     document.querySelector('#records tbody'),
  pageInfo:  document.querySelector('#page-info'),
  prevBtn:   document.querySelector('#prev-btn'),
  nextBtn:   document.querySelector('#next-btn'),
  status:    document.querySelector('#status'),
  uploadBtn: document.querySelector('#upload-btn'),
  uploadFile:document.querySelector('#upload-file'),
  checkBtn:  document.querySelector('#check-btn'),
  newEntrySelect: document.querySelector('#new-entry-select'),
  searchForm: document.querySelector('#search-form'),
  searchInput: document.querySelector('#search-input'),
  checkAllBtn: document.querySelector('#check-all-btn'),
};


function setStatus(msg, kind) {
  els.status.textContent = msg || '';
  els.status.className = kind || '';
}

async function loadPage(page) {
  setStatus('Loading…');
  try {
    let url = `/api/compiled?page=${page}&limit=${PAGE_SIZE}`;
    if (state.searchQuery) {
      url += `&q=${encodeURIComponent(state.searchQuery)}`;
    }
    const res = await fetch(url);
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
    tr.dataset.type = 'parent'; 

    tr.appendChild(cell(row.tag, { readOnly: true }));
    tr.appendChild(cell(row.canonical_name, { readOnly: true }));
    tr.appendChild(document.createElement('td'));
    tr.appendChild(document.createElement('td'));

    const parentComments = cell(row.comments || '', { field: 'comments' });
    parentComments.classList.add('comment-cell');
    tr.appendChild(parentComments);
    
    tr.appendChild(cell(row.date || '', { field: 'date' }));
    tr.appendChild(cell(row.associated_record_identifier || '', { readOnly: true, pk: true }));

    const actionsTd = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'delete-btn';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Are you sure you want to delete ${row.name_with_valid_delimiters}?`)) return;
      deleteRecord(row.name_with_valid_delimiters);
    });
    actionsTd.appendChild(deleteBtn);
    tr.appendChild(actionsTd);


    els.tbody.appendChild(tr);

    // Associated Records
    if (row.associated_records && row.associated_records.length > 0) {
      for (const child of row.associated_records) {
        const childTr = document.createElement('tr');
        childTr.className = 'child-row';
        childTr.dataset.pk = child.id;       
        childTr.dataset.type = 'associated_compiled'; 

        childTr.appendChild(cell(child.tag, { readOnly:true }));
        childTr.appendChild(cell(child.author_name_match || '', { readOnly:true }));
        childTr.appendChild(cell(child.percent_match || '', { readOnly:true }));
        childTr.appendChild(cell(child.lcn || '', { readOnly:true }));
        const childComments = cell(child.comments || '', { field: 'comments' });
        childComments.classList.add('comment-cell');
        childTr.appendChild(childComments);
        childTr.appendChild(cell(child.date || '', { field:'date' }));
        childTr.appendChild(cell(child.associated_record_identifier || '', { readOnly: true, pk: true }));
        childTr.appendChild(document.createElement('td')); 
        

        els.tbody.appendChild(childTr);
      }
    }
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
  const tr = td.closest('tr');
  const pk = tr.dataset.pk;
  const type = tr.dataset.type || 'parent';
  const original = td.dataset.original;
  const value = td.textContent;
  if (value === original) return;

  const endpoint = type === 'associated_compiled' ? '/api/associated_compiled' : '/api/compiled';

  try {
    const res = await fetch(endpoint, {
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

async function deleteRecord(pk) {
  setStatus('Deleting...');
  try {
    const res = await fetch(`/api/compiled/${encodeURIComponent(pk)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await res.text());
    
    setStatus('Deleted successfully', 'success');
    setTimeout(() => setStatus(''), 1200);
    
    loadPage(state.page);
  } catch (err) {
    setStatus(`Delete failed: ${err.message}`, 'error');
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


async function loadNewEntries() {
  try {
    const res = await fetch('/api/new-entries');
    if (!res.ok) throw new Error(await res.text());
    const entries = await res.json();
    
    els.newEntrySelect.replaceChildren();
    if (entries.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'No new entries found';
      opt.value = '';
      els.newEntrySelect.appendChild(opt);
      return;
    }

    for (const entry of entries) {
      const opt = document.createElement('option');
      opt.value = entry.record_identifier;
      // Show both ID and Name for clarity
      opt.textContent = `${entry.record_identifier} (${entry.parent_record_name || 'No Name'})`;
      els.newEntrySelect.appendChild(opt);
    }
  } catch (err) {
    setStatus(`Failed to load new entries: ${err.message}`, 'error');
  }
}

els.checkBtn.addEventListener('click', async () => {
  const recordIdentifier = els.newEntrySelect.value;
  if (!recordIdentifier) return;

  const confirmMsg = `Run check on ${recordIdentifier}?`;
  if (!confirm(confirmMsg)) return;

  setStatus('Running...');
  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record_identifier: recordIdentifier }),
    });
    
    if (!res.ok) throw new Error(await res.text());
    const result = await res.json();
    
    setStatus(result.status === 'converted' ? 'Converted successfully' : 'Matched & Deleted', 'success');
    
    // Refresh the dropdown and the main table
    loadNewEntries();
    loadPage(0); 
  } catch (err) {
    setStatus(`Check failed: ${err.message}`, 'error');
  }
});

els.searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  state.searchQuery = els.searchInput.value.trim();
  loadPage(0);
});

els.checkAllBtn.addEventListener('click', async () => {
  if(!confirm('Run check on all new entries?')) return;

  setStatus('Running all conversions... Please wait.');

  try {
    const res = await fetch('api/check-all', {method: 'POST'});
    if (!res.ok) throw new Error(await res.text());
    const result = await res.json();

    setStatus(`Success: ${result.converted} converted, ${result.deleted} matched & deleted.`, 'success');

    loadNewEntries();
    loadPage(0);
  } catch (err) {
    setStatus('Batch check failed: ${err.message}', 'error');
  } finally {
    els.checkAllBtn.disabled = false;
  }
});


loadNewEntries();
loadPage(0);