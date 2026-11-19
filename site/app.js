// Copy buttons for install snippets. Each .copy button copies the text of the <pre> next to it.
const RESET_MS = 1600;

const setState = (button, state, label) => {
  button.dataset.state = state;
  button.textContent = label;
  window.setTimeout(() => {
    delete button.dataset.state;
    button.textContent = 'Copy';
  }, RESET_MS);
};

document.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy');
  if (!button) return;
  const source = button.dataset.copy ?? button.parentElement.querySelector('pre')?.textContent ?? '';
  try {
    await navigator.clipboard.writeText(source);
    setState(button, 'done', 'Copied');
  } catch {
    setState(button, 'error', 'Press Ctrl+C');
    const pre = button.parentElement.querySelector('pre');
    if (pre) window.getSelection()?.selectAllChildren(pre);
  }
});
