'use strict';
// Preview page around the simulated app window (app/index.html = the app's original page).
//  * Sizes the frame like the desktop window: main.cjs asks for 440x365 and 460x690 (report screen)
//    through BrowserWindow.setSize, which the simulation forwards here. Centered when it fits;
//    full width (growing with its content) on narrow screens.
//  * Theme: the portfolio shell's postMessage({ type: "portfolio:theme", theme }) acts as the
//    operating-system theme. It recolours this backdrop and is passed to the app, whose own
//    "Theme: System" setting follows it (Dark/Light still override it, as in the app).
//  * Shows a short notice when an action was only simulated (report upload, saving a file).
(() => {
  const frame = document.getElementById('app');
  const win = document.getElementById('window');
  const title = document.getElementById('window-title');
  const notice = document.getElementById('notice');
  const media = matchMedia('(prefers-color-scheme: dark)');
  const NOTICES = {
    'report-sent': 'Nothing was sent: the report upload is simulated.',
    'file-saved': 'No file was saved: the save dialog is simulated.',
  };
  let shellTheme = null;
  let size = { width: 440, height: 365 };
  let contentHeight = 0;

  const systemTheme = () => shellTheme || (media.matches ? 'dark' : 'light');

  function applyTheme() {
    const theme = systemTheme();
    document.documentElement.dataset.theme = theme;
    if (frame.contentWindow && frame.src) frame.contentWindow.postMessage({ type: 'portfolio:theme', theme }, '/');
  }

  function layout() {
    const narrow = innerWidth < size.width + 48;
    document.body.classList.toggle('narrow', narrow);
    const root = document.documentElement.style;
    root.setProperty('--w', `${size.width}px`);
    root.setProperty('--h', `${narrow ? Math.max(size.height, contentHeight) : size.height}px`);
  }

  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (event.source === frame.contentWindow && data.source === 'classic-lyrics-preview') {
      if (data.kind === 'window') {
        if (data.width && data.height) { size = { width: data.width, height: data.height }; notice.textContent = ''; }
        if (data.title) title.textContent = data.title;
        if (data.background) win.style.setProperty('--win-bg', data.background);
        layout();
      } else if (data.kind === 'theme') {
        win.classList.toggle('dark', !!data.dark);
        win.classList.toggle('light', !data.dark);
      } else if (data.kind === 'notice' && NOTICES[data.notice]) {
        notice.textContent = NOTICES[data.notice];
      }
      return;
    }
    if ((event.source === window.parent || event.source === window) && data.type === 'portfolio:theme' && (data.theme === 'light' || data.theme === 'dark')) {
      shellTheme = data.theme;
      applyTheme();
    }
  });

  media.addEventListener('change', () => { if (!shellTheme) applyTheme(); });
  window.addEventListener('resize', layout);

  frame.addEventListener('load', () => {
    const main = frame.contentDocument && frame.contentDocument.querySelector('main');
    if (!main) return;
    const measure = () => { contentHeight = Math.ceil(main.getBoundingClientRect().height); layout(); };
    new frame.contentWindow.ResizeObserver(measure).observe(main);
    measure();
    applyTheme();
  });

  applyTheme();
  layout();
  frame.src = `app/index.html#theme=${systemTheme()}`;
})();
