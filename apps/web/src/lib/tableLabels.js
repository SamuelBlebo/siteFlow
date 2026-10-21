// Phones show each table row as a card (styles.css), with every value next to its column name.
// This copies each column's heading onto its cells as data-label, for any table on any page,
// including rows that appear later. Tables with no heading row are left alone.

function label(table) {
  const heads = [...(table.tHead?.rows[0]?.cells || [])].map((th) => th.textContent.trim());
  if (!heads.length) return;
  for (const body of [...table.tBodies, ...(table.tFoot ? [table.tFoot] : [])]) {
    for (const row of body.rows) {
      let col = 0;
      for (const cell of row.cells) {
        const text = heads[col] || '';
        if (cell.dataset.label !== text) cell.dataset.label = text;
        col += cell.colSpan || 1;
      }
    }
  }
}

export function labelTables() {
  let queued = false;
  const run = () => { queued = false; document.querySelectorAll('.scroll table').forEach(label); };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true });
  queue();
}
