/* AQILLA PROMPTER — Remote Edition
 * Bluetooth pairing is performed by the OS, because Bluetooth HID keyboard
 * profiles are not available through generic Web Bluetooth GATT scanning.
 * An HID keyboard-style remote reaches the page as keydown events.
 * Codes can be learned on the user's actual Desview P8 remote.
 */
(() => {
  'use strict';
  const core = window.AqillaPrompter?.remote;
  if (!core) return;

  const STORAGE = 'aqilla-prompter-desview-remote-v1';
  const LABELS = {
    playPause: 'Putar / Jeda scroll',
    previous: 'Naik / Mundur teks',
    next: 'Turun / Maju teks',
    speedUp: 'Percepat scroll',
    speedDown: 'Perlambat scroll'
  };
  const OPTIONAL_LABELS = {
    voice: 'Mulai / Hentikan Voice Follow',
    mirror: 'Mirror horizontal',
    start: 'Kembali ke awal naskah'
  };
  const ACTIONS = Object.keys({ ...LABELS, ...OPTIONAL_LABELS });
  const defaults = {
    ' ': 'playPause', Enter: 'playPause', NumpadEnter: 'playPause',
    MediaPlayPause: 'playPause', MediaPlay: 'playPause', MediaPause: 'playPause',
    ArrowUp: 'previous', PageUp: 'previous',
    ArrowDown: 'next', PageDown: 'next',
    ArrowLeft: 'speedDown', ArrowRight: 'speedUp',
    AudioVolumeUp: 'speedUp', AudioVolumeDown: 'speedDown'
  };
  let custom = {};
  let enabled = true;
  let learning = null;
  let lastAction = null;
  let lastActionAt = 0;
  let overlay = null;
  let details = null;

  function load() {
    try {
      const obj = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (!obj || typeof obj !== 'object') return;
      enabled = obj.enabled !== false;
      if (obj.custom && typeof obj.custom === 'object') {
        for (const action of ACTIONS) {
          const val = obj.custom[action];
          if (val && typeof val === 'object' &&
              typeof val.key === 'string' && typeof val.code === 'string') {
            custom[action] = {
              key: val.key.slice(0, 50), code: val.code.slice(0, 60),
              ctrl: Boolean(val.ctrl), alt: Boolean(val.alt),
              shift: Boolean(val.shift), meta: Boolean(val.meta)
            };
          }
        }
      }
    } catch (_) { /* nothing saved yet */ }
  }
  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify({ enabled, custom })); }
    catch (_) { /* remote stays functional until page closes */ }
  }
  const fingerprint = (ev) => ({
    key: ev.key || '', code: ev.code || '',
    ctrl: ev.ctrlKey, alt: ev.altKey, shift: ev.shiftKey, meta: ev.metaKey
  });
  function sameInput(saved, event) {
    // Prefer the semantic key (works despite OS keyboard layout changes),
    // but retain code as a fallback for hardware that only reports 'Unidentified'.
    if (saved.ctrl !== event.ctrlKey || saved.alt !== event.altKey ||
        saved.shift !== event.shiftKey || saved.meta !== event.metaKey) return false;
    const meaningful = k => k && k !== 'Unidentified' && k !== 'Process' && k !== 'Dead';
    if (meaningful(saved.key) && meaningful(event.key)) return saved.key === event.key;
    return Boolean(saved.code && saved.code === event.code);
  }
  function labelInput(saved) {
    if (!saved) return 'Belum direkam · pakai default';
    const modifiers = [saved.ctrl && 'Ctrl',saved.alt && 'Alt',
      saved.shift && 'Shift',saved.meta && 'Meta'].filter(Boolean);
    return [...modifiers, saved.key === ' ' ? 'Spasi' : (saved.key || saved.code)].join(' + ');
  }
  function plainInput(ev) {
    return !ev.ctrlKey && !ev.altKey && !ev.metaKey && !ev.shiftKey;
  }
  function typing(ev) {
    const node = ev.target;
    return Boolean(node?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(node?.tagName));
  }
  function perform(action) {
    if (!core[action]) return;
    core[action]();
    lastAction = action;
    lastActionAt = Date.now();
    if (overlay && !overlay.hidden) renderDetails();
  }
  function determineAction(ev) {
    // Learned keys take precedence over the built-in Desview profile.
    for (const [action, saved] of Object.entries(custom)) {
      if (sameInput(saved,ev)) return action;
    }
    if (!plainInput(ev)) return null;
    if (defaults[ev.key]) return defaults[ev.key];
    if (defaults[ev.code]) return defaults[ev.code];
    return null;
  }
  function openPanel() {
    ensurePanel();
    overlay.hidden = false;
    learning = null;
    renderDetails();
    overlay.querySelector('#remote-close').focus();
  }
  function closePanel() {
    if (!overlay) return;
    overlay.hidden = true;
    learning = null;
    document.getElementById('viewport')?.focus({ preventScroll: true });
  }
  function keydown(ev) {
    // Shortcut for the panel; also '?' for convenience. Not used while typing.
    if (!typing(ev) && ((ev.key.toLowerCase() === 'b' && ev.ctrlKey && ev.altKey) ||
        (ev.key === '?' && !ev.ctrlKey && !ev.altKey && !ev.metaKey))) {
      ev.preventDefault();ev.stopImmediatePropagation();
      if (overlay && !overlay.hidden) closePanel(); else openPanel();
      return;
    }
    if (overlay && !overlay.hidden) {
      if (learning) {
        if (ev.key === 'Escape') {
          ev.preventDefault();ev.stopImmediatePropagation();
          learning = null; renderDetails();return;
        }
        if (['Shift','Alt','Control','Meta'].includes(ev.key) || ev.repeat) {
          ev.preventDefault();ev.stopImmediatePropagation();return;
        }
        ev.preventDefault();ev.stopImmediatePropagation();
        const saved = fingerprint(ev);
        if (saved.key === 'Unidentified' && !saved.code) {
          details.textContent = 'Tombol tidak dikenali oleh browser. Coba tombol lain atau periksa pairing Windows.';
          return;
        }
        // One physical key may control at most one action.
        for (const [action, previous] of Object.entries(custom)) {
          if (action !== learning && sameInput(previous,ev)) delete custom[action];
        }
        custom[learning] = saved;
        learning = null;
        save();renderDetails();return;
      }
      if (ev.key === 'Escape') {ev.preventDefault();ev.stopImmediatePropagation();closePanel();return;}
      // Never move the prompter while the dialog is open. Keep Tab and
      // focused button Enter/Space for accessible dialog navigation.
      const activateButton = ev.target?.tagName === 'BUTTON' && [' ','Enter'].includes(ev.key);
      if (ev.key !== 'Tab' && !activateButton) {
        ev.stopImmediatePropagation();
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter','PageUp','PageDown'].includes(ev.key)) ev.preventDefault();
      }
      return;
    }
    if (!enabled || typing(ev) || ev.repeat) return;
    const action = determineAction(ev);
    if (!action) return;
    // Prevent the original keyboard handler from executing a second action,
    // or Windows/Chrome scrolling the page using arrow keys or Space.
    ev.preventDefault();ev.stopImmediatePropagation();
    perform(action);
  }
  function ensurePanel() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'remote-dialog-backdrop';
    overlay.id = 'remote-dialog';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="remote-dialog" role="dialog" aria-modal="true" aria-labelledby="remote-title">
        <div class="remote-dialog-head"><div><h2 id="remote-title">Remote Desview P8</h2>
          <p>Pengaturan remote · tanpa mengubah tampilan teleprompter</p></div>
          <button type="button" id="remote-close" aria-label="Tutup pengaturan">✕</button></div>
        <div class="remote-dialog-content">
          <p class="remote-help"><strong>1.</strong> Di Windows, buka <b>Settings → Bluetooth &amp; devices → Add device</b>.
          Pair remote yang muncul (sering bernama <b>Desview</b>). Fokuskan tab AQILLA PROMPTER.
          <br><strong>2.</strong> Klik <b>Rekam tombol</b> lalu tekan tombol fisik remote satu kali.
          Jika browser menerima tombolnya, pemetaan tersimpan otomatis.</p>
          <label class="remote-switch"><input type="checkbox" id="remote-enabled"> Aktifkan kontrol remote / profil tombol Desview</label>
          <div id="remote-action-list" class="remote-action-list"></div>
          <p id="remote-details" class="remote-details" aria-live="polite"></p>
          <div class="remote-footer"><button type="button" id="remote-reset">Reset semua pemetaan</button>
          <button type="button" id="remote-done">Selesai</button></div>
          <p class="remote-caveat">Browser tidak bisa memasangkan remote HID langsung atau menjamin semua model mengirim input keyboard.
          Jika tombol sama sekali tidak terdeteksi, fungsi remote memerlukan pemeriksaan perangkat lebih lanjut.</p>
        </div>
      </section>`;
    document.body.append(overlay);
    details = overlay.querySelector('#remote-details');
    overlay.querySelector('#remote-enabled').addEventListener('change', e => { enabled=e.target.checked;save();renderDetails(); });
    overlay.querySelector('#remote-close').addEventListener('click',closePanel);
    overlay.querySelector('#remote-done').addEventListener('click',closePanel);
    overlay.querySelector('#remote-reset').addEventListener('click',()=> {
      custom={};learning=null;save();renderDetails();
    });
    overlay.addEventListener('click', ev => { if (ev.target === overlay) closePanel(); });
    overlay.querySelector('#remote-action-list').addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-record]');
      if (!btn) return;
      const action=btn.dataset.record;
      if (!ACTIONS.includes(action)) return;
      learning=action;
      renderDetails();
      // Explicitly focus the dialog, not a page input, for hardware key capture.
      overlay.querySelector('#remote-close').focus();
    });
  }
  function renderDetails() {
    if (!overlay) return;
    overlay.querySelector('#remote-enabled').checked = enabled;
    const list=overlay.querySelector('#remote-action-list');
    list.replaceChildren();
    for (const [action,label] of Object.entries({ ...LABELS,...OPTIONAL_LABELS })) {
      const row=document.createElement('div');
      row.className='remote-action';
      const text=document.createElement('span');
      const name=document.createElement('strong');name.textContent=label;
      const key=document.createElement('small');key.textContent=labelInput(custom[action]);
      text.append(name,key);
      const button=document.createElement('button');
      button.type='button';button.dataset.record=action;
      button.textContent=learning===action?'Tekan tombol remote…':'Rekam tombol';
      if (learning===action) button.classList.add('learning');
      row.append(text,button);list.append(row);
    }
    details.textContent=learning
      ? `Mendengarkan tombol untuk: ${({ ...LABELS,...OPTIONAL_LABELS })[learning]}. Tekan ESC untuk batal.`
      : lastAction && Date.now()-lastActionAt < 30000
        ? `Kontrol terdeteksi · perintah terakhir: ${({ ...LABELS,...OPTIONAL_LABELS })[lastAction]}`
        : 'Profil standar: Spasi/Enter = Play, ↑/↓ = gulir naskah, ←/→ = kecepatan. Tekan ? untuk membuka lagi.';
  }
  load();
  window.addEventListener('keydown',keydown,true);
  // Public status exposed only for lightweight smoke tests. Connection status
  // cannot be determined reliably from web keyboard events.
  window.AqillaRemote = Object.freeze({
    open: openPanel,
    get state() { return { enabled, learning, custom: { ...custom }, panelOpen: Boolean(overlay&&!overlay.hidden) }; }
  });
})();
