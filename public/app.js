/** 
We begin the programme by defining some state variables and define a structure of the DOM elements. 

Since we will be calculating the page position using a fixed page_size, which is the number of elements which
we permit on each page, we choose to define the variabels below. 
*/

const PAGE_SIZE = 10;
const state = { page: 0, total: 0, searchQuery: '', highlightPK: null };

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


/**
setStatus allows us to interact with a DOM element at the bottom right of the page. Errors intended for developers can appear here. 

Issues which appear in the app.js can be routed to this DOM element. 

@param {string} msg: The message to be displayed in the status element.
@param {string} kind: The type of message, which can be 'error', 'success', or '' (empty string for neutral messages).
@returns {void} 
*/
function setStatus(msg, kind) {
  els.status.textContent = msg || '';
  els.status.className = kind || '';
}

/*
loadPage loads the records from the compiled_records table into the the DOM element. We concatenate the url by
using the page number which is calculated by the toolbar element event listener or by the server using the searchbar. 

@PARAMS page: zero-indexed page number of the dataset to be fetched. Pages are 10 records long, as defined at the beginning of this file. 
@PARAMS jumpQuery: the search query which is to be used to filter records.
*/
async function loadPage(page, jumpQuery = null) {
  setStatus('Loading…');
  try {
    let url = `/api/compiled?page=${page}&limit=${PAGE_SIZE}`;
    if (jumpQuery) {
      url += `&q=${encodeURIComponent(jumpQuery)}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    state.page = data.page;
    state.total = data.total;
    state.highlightPK = data.highlightPK || null;
    renderRows(data.rows);
    renderPager();
    setStatus('');
  } catch (err) {
    setStatus(`Load failed: ${err.message}`, 'error');
  }
}

/** 
renderRows parses the data returned from api calls and constructs a table from DOM in O(n). 
row in rows can have an associated record, which will be parsed as one or two child rows, if it exists. 

@param {Object} rows: row SQL data from API call return as JSON. 
@returns {void}
*/
function renderRows(rows) {
  els.tbody.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr'); //"table row"

    tr.dataset.pk = row.name_with_valid_delimiters;
    tr.dataset.type = 'parent'; 

    if(row.name_with_valid_delimiters === state.highlightPK) {
      tr.classList.add('highlight');
    }

    tr.appendChild(cell(row.tag, { readOnly: true })); //Since we access the members of row by dot operator, we can create the elements in the order we want to display them. 
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
        const childComments = cell(child.comments || '', { readOnly:true });
        childComments.classList.add('comment-cell');
        childTr.appendChild(childComments);
        childTr.appendChild(cell(child.date || '', { readOnly:true }));
        childTr.appendChild(cell(child.associated_record_identifier || '', { readOnly: true, pk: true }));
        childTr.appendChild(document.createElement('td')); 
        

        els.tbody.appendChild(childTr);
      }
    }
  }
}

/** 
  cell() creates the cell object for the table by reading the options of the cell to decide which ones are read-only, and adds event listeners for the cell data.
  We always save after interacting with field. 

  @param {*} value: displayed value. 
  @param {Object} opts: options for the cell, which can include readOnly, pk, and field. 
  @returns {HTMLElement} td: the table cell created.
*/
function cell(value, opts = {}) {
  const td = document.createElement('td');
  td.textContent = value;
  if (opts.pk) td.classList.add('pk'); //Display differently if primary key, these display instructions are in css file. 
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

/**
 * Saves a field to database given the table cell and the new field name. 
 * @param {HTMLElement} td 
 * @param {*} field 
 * @returns {void}
 */
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

/**
 * Deletes the record given the primary key. 
 * @param {string} pk I'm pretty sure it's a string.  
 * @returns {void}
 */
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
/**
 * Displays record numbers at toolbar.
 * @returns {void}
 */
function renderPager() {
  const start = state.total ? state.page * PAGE_SIZE + 1 : 0;
  const end   = Math.min((state.page + 1) * PAGE_SIZE, state.total);
  els.pageInfo.textContent = state.total ? `${start}–${end} of ${state.total}` : 'No records';
  els.prevBtn.disabled = state.page === 0;
  els.nextBtn.disabled = (state.page + 1) * PAGE_SIZE >= state.total;
}


/**
 * Calls API for the new records to be converted and puts them in the drop-down selector. 
 * 
 * @returns {void}
 */
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

//These are a load of event listeners. 

//Move the page forwards or backwards. 
els.prevBtn.addEventListener('click', () => loadPage(state.page - 1));
els.nextBtn.addEventListener('click', () => loadPage(state.page + 1));

//Ethan is doing this part. 
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



//This event listener calls the match and convert logic, which is done by the database server. It also reloads the tables so changes made to current page are visible. 
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
    
    loadNewEntries();
    loadPage(0); 
  } catch (err) {
    setStatus(`Check failed: ${err.message}`, 'error');
  }
});


/**
 * 
 *Runs check and convert logic on ALL new entries. 
 *
 *The reason that we do this with a new event listener instead of iterating through the new entries with the old logic is so that
 *the whole batch is done as a single transaction, so by ACID compliance, the whole transaction will be rolled back if it fails. 
 *
 *This should hopefully help prevent malformed databases upon server misbehaviors. 
 */

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

//Calls loadpage with a trimmed query parameter. 
els.searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = els.searchInput.value.trim();
  loadPage(0, q || null);
});




loadNewEntries();
loadPage(0);