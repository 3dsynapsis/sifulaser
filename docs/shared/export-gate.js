// Sign in before you can take the file away.
//
// The tools are free and stay free. What this asks for is a name at the moment
// somebody has actually made something they want - which is both the point when
// they are most willing to give it, and the point when asking costs the least.
// A wall at the front door would turn away the stranger who arrived from a
// search and might have paid for a course six months later; the tool itself is
// the advertisement, so the door stays open.
//
// This is a funnel, not a lock, and it is worth being blunt about that. The flag
// it reads is ordinary localStorage: anybody who opens the console can set it,
// and the tools are static files that can be fetched whole in any case. Nothing
// here protects anything. It exists so that people who are happy to sign in are
// asked at the right moment, and that is all it is for.
//
// It hooks the click rather than the tools. Every tool happens to open its
// export dialog from a button with the same id, so one listener in the capture
// phase - before any tool's own handler runs - covers all seven without a line
// changing in any of them. If this file ever fails to load, the listener is
// simply not installed and export works as it always did. Failing open is the
// right way round for something that is not a security control.

const KEY = 'sifulaser.session';
const HOME = 'https://sifulaser.com/';

const signedIn = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed && parsed.email);
  } catch {
    // Private windows and blocked site data both throw rather than return null.
    return false;
  }
};

const style = (el, css) => { el.style.cssText = css; return el; };

function ask() {
  const back = style(document.createElement('div'),
    'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;'
    + 'background:rgba(15,23,42,.55);padding:20px;'
    + 'font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif');

  const card = style(document.createElement('div'),
    'max-width:380px;width:100%;background:#fff;color:#0f172a;border-radius:16px;'
    + 'padding:22px;box-shadow:0 24px 60px rgba(2,6,23,.35);text-align:center');

  const title = style(document.createElement('h2'),
    'margin:0 0 8px;font-size:17px;font-weight:800');
  title.textContent = 'Daftar masuk untuk muat turun';

  const body = style(document.createElement('p'), 'margin:0 0 18px;color:#475569');
  body.textContent = 'Alat ini percuma dan kekal percuma. Daftar masuk sekali '
    + 'sahaja dengan Google untuk menyimpan fail potong anda.';

  const go = style(document.createElement('button'),
    'width:100%;padding:11px 16px;border:0;border-radius:10px;background:#0f172a;'
    + 'color:#fff;font-weight:700;font-size:14px;cursor:pointer');
  go.textContent = 'Daftar masuk dengan Google';

  const not = style(document.createElement('button'),
    'width:100%;margin-top:8px;padding:9px 16px;border:0;border-radius:10px;'
    + 'background:transparent;color:#64748b;font-size:13px;cursor:pointer');
  not.textContent = 'Nanti dulu';

  const close = () => back.remove();
  not.addEventListener('click', close);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key !== 'Escape') return;
    document.removeEventListener('keydown', esc);
    close();
  });

  go.addEventListener('click', () => {
    // Where to come back to. Only the path, and only from this page - the site
    // checks it again at the other end, because a "next" parameter that will
    // take any URL is how an open redirect gets built by accident.
    const next = location.pathname + location.search;
    location.href = `${HOME}?signin=1&next=${encodeURIComponent(next)}`;
  });

  card.append(title, body, go, not);
  back.append(card);
  document.body.append(back);
  go.focus();
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  if (!target.closest('#exportBtn')) return;
  if (signedIn()) return;
  event.preventDefault();
  event.stopPropagation();
  // Also stops other listeners on this same element, which is what keeps the
  // tool's own handler from opening its export dialog behind the prompt.
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation();
  }
  ask();
}, true);
