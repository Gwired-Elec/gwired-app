// In the estimating screens, clicking or tapping into a box highlights what is in it, so typing replaces it and nothing has to
// be deleted first. (Highlighting rather than deleting means nothing is lost if you tap in and then change your mind.) One
// listener covers every box: the estimate on a job, and everything under More > Estimating data.
const TYPES = new Set(['text', 'number', 'tel', 'search', 'email', ''])

const inEstimating = (el: HTMLElement) => location.pathname.startsWith('/more/estimating') || !!el.closest('.est')

export function installSelectOnFocus() {
  document.addEventListener('focusin', (e) => {
    const el = e.target
    if (!(el instanceof HTMLInputElement) || el.readOnly || el.disabled || !TYPES.has(el.type) || !inEstimating(el)) return
    // after the browser has placed the cursor (needed on iPhone / iPad, where select() straight away is ignored)
    setTimeout(() => {
      if (document.activeElement !== el) return
      try { el.select(); el.setSelectionRange(0, el.value.length) } catch { /* some input types cannot be selected */ }
    }, 0)
  })
}
