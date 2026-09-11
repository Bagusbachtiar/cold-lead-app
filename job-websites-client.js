(() => {
  const dialog = document.getElementById('job-websites-dialog');
  if (!dialog) return;
  const form = document.getElementById('website-form');
  const name = document.getElementById('website-name');
  const list = document.getElementById('website-list');
  const count = document.getElementById('website-count');
  const error = document.getElementById('websites-error');
  const save = document.getElementById('website-save');
  const cancel = document.getElementById('website-cancel');
  const originalWebsiteId = document.getElementById('website_id')?.value;
  let websites = [], editingId = null, busy = false, opener = null;

  function showError(message = '') {
    error.textContent = message;
    error.hidden = !message;
  }
  function resetForm() {
    editingId = null;
    form.reset();
    save.textContent = 'Add Website';
    cancel.hidden = true;
  }
  function edit(website) {
    editingId = website.id;
    name.value = website.name;
    save.textContent = 'Save Changes';
    cancel.hidden = false;
    showError();
    name.focus();
  }
  function button(text, className, action) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    element.className = className;
    element.disabled = busy;
    element.addEventListener('click', action);
    return element;
  }
  function render() {
    count.textContent = websites.length ? `${websites.length} saved website${websites.length === 1 ? '' : 's'} · A–Z` : 'No websites saved yet.';
    list.replaceChildren();
    for (const website of websites) {
      const row = document.createElement('li');
      row.className = 'flex items-center justify-between gap-4 py-3';
      const label = document.createElement('span');
      label.className = 'text-sm break-words min-w-0';
      label.textContent = website.name;
      const actions = document.createElement('div');
      actions.className = 'flex gap-3 shrink-0';
      actions.append(
        button('Edit', 'text-sm text-blue-400', () => edit(website)),
        button('Delete', 'text-sm text-red-400', () => {
          if (confirm('Delete this saved website?')) mutate(`/job-websites/${website.id}/delete`, {}, website.id);
        })
      );
      row.append(label, actions);
      list.append(row);
    }
  }
  function syncApplications() {
    const select = document.getElementById('website_id');
    if (select) {
      const selected = select.value;
      const previousLabel = select.selectedOptions[0]?.textContent;
      const stillExists = websites.some(website => String(website.id) === selected);
      select.replaceChildren(new Option('Not specified', ''));
      // A deleted source on an existing application can retain its saved history.
      if (selected === 'legacy' || (selected && selected === originalWebsiteId && !stillExists && /^\/jobs\/\d+\/edit$/.test(location.pathname))) {
        select.add(new Option(previousLabel || 'Previously saved website', 'legacy'));
        select.value = 'legacy';
      }
      for (const website of websites) select.add(new Option(website.name, String(website.id)));
      if (stillExists) select.value = selected;
    }
    for (const label of document.querySelectorAll('[data-website-id]')) {
      const website = websites.find(item => String(item.id) === label.dataset.websiteId);
      if (website) label.textContent = `Found on: ${website.name}`;
    }
  }
  async function load() {
    const response = await fetch('/job-websites?format=json', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Could not load websites. Close this window and try again.');
    websites = (await response.json()).websites;
    render();
    syncApplications();
  }
  async function mutate(url, data, deletedId = null) {
    if (busy) return;
    busy = true;
    save.disabled = cancel.disabled = name.disabled = true;
    showError();
    render();
    try {
      const response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save the website. Try again.');
      if (!deletedId || deletedId === editingId) resetForm();
      await load();
    } catch (failure) {
      showError(failure.message || 'Could not connect. Try again.');
    } finally {
      busy = false;
      save.disabled = cancel.disabled = name.disabled = false;
      render();
    }
  }
  async function open(trigger) {
    opener = trigger;
    showError();
    if (!dialog.open) dialog.showModal();
    count.textContent = 'Loading websites...';
    try {
      await load();
      const editId = new URLSearchParams(location.search).get('edit_website');
      const website = websites.find(item => String(item.id) === editId);
      if (website) edit(website);
    } catch (failure) { showError(failure.message); }
  }
  document.querySelectorAll('[data-open-websites]').forEach(trigger => trigger.addEventListener('click', () => open(trigger)));
  document.getElementById('websites-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    opener?.focus();
    const url = new URL(location.href);
    url.searchParams.delete('websites');
    url.searchParams.delete('edit_website');
    history.replaceState(null, '', url);
  });
  cancel.addEventListener('click', () => { resetForm(); showError(); name.focus(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    mutate(editingId ? `/job-websites/${editingId}/update` : '/job-websites', { name: name.value });
  });
  if (new URLSearchParams(location.search).has('websites')) open(document.querySelector('[data-open-websites]'));
})();
