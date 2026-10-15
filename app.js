(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ids = [
    'app','sidebarShade','toggleSidebar','closeSidebar','scriptName','scriptInput','scriptDisplay',
    'topScriptName','saveStatus','wordCount','durationEstimate','importBtn','fileInput','pasteBtn','clearBtn',
    'sizeRange','sizeValue','lineRange','lineValue','widthRange','widthValue','cueRange','cueValue',
    'fontSelect','mirrorHorizontal','mirrorVertical','cueVisible','smoothScroll','resetStyle',
    'languageSelect','speedRange','speedValue','viewport','prompterFrame','cueLine','progressLabel',
    'liveDot','modeLabel','headerTip','readingBadge','voiceBar','voiceTitle','heardText','voiceTag',
    'voiceBtn','voiceBtnLabel','voiceIcon','manualBtn','manualLabel','manualIcon','backBtn','nextBtn',
    'resetPositionBtn','fullscreenBtn','toast','cloudLabel'
  ];
  const el = Object.fromEntries(ids.map(id => [id, $(id)]));
  const STORAGE_KEY = 'aqilla-prompter-v1';
  const SAMPLE = `Sekarang kita ikuti kejadian yang dialami Ardi, mulai dari persiapan sebelum berangkat.\n\nAwalnya semua terlihat biasa saja. Tapi ternyata, ada satu hal aneh yang belum disadari oleh Ardi.\n\nDan dari sinilah, cerita sebenarnya dimulai.\n\nTunggu sampai akhir, karena ada sebuah kejutan yang sama sekali tidak terduga.`;
  const DEFAULTS = {
    name: 'Naskah Baru', script: SAMPLE, size: 62, line: 1.35, width: 90,
    cue: 42, font: 'Nunito', mirrorX: false, mirrorY: false, cueVisible: true,
    smooth: true, lang: 'id-ID', speed: 40
  };
  const VALID_FONTS = ['Nunito','Inter','Arial','Trebuchet MS','Verdana'];
  let settings = { ...DEFAULTS };
  let displayWords = []; // { element, text, firstToken, lastToken, paragraph }
  let matchTokens = []; // { normalized, wordIndex }
  let paragraphStarts = [];
  let committed = 0; // number of voice tokens finished
  let projected = 0; // tentative position while recognizing interim speech
  let saveTimer = 0;
  let rebuildTimer = 0;
  let toastTimer = 0;
  let targetScroll = 0;
  let scrollProgrammatically = false;
  let manualPlaying = false;
  let voiceWanted = false;
  let recognition = null;
  let processedFinals = new Set();
  let recognitionStarting = false;
  let voiceRetryTimer = 0;
  let voiceBackoff = 400;
  let scrollFrame = 0;
  let lastFrameAt = 0;
  let fullscreenFallback = false;
  let saveFailed = false;
  // V1.3 low-latency voice assist (no interface changes).
  let paintedCurrent = -1;
  let paintedReadThrough = -1;
  let recognitionCursor = 0;
  let recognizerEverMatched = false;
  let voiceEstimate = 0;
  let lastRecognitionProgressAt = 0;
  let segmentAnchors = new Map();
  let microphoneStream = null;
  let audioContext = null;
  let audioAnalyser = null;
  let audioSamples = null;
  let audioLastPollAt = 0;
  let audioFloor = 0.007;
  let voiceEnergySince = 0;
  let voiceEnergyUntil = 0;
  let audioAssistGeneration = 0;
  let audioAssistAvailable = false;
  let micMoveSaveAt = 0;
  let speechWasActive = false;
  let exclusiveMicFallbackTried = false;
  let lastForcedVoiceRestartAt = 0;

  function clamp(n, low, high) { return Math.min(high, Math.max(low, n)); }
  function visibleMessage(msg, ms = 3600) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
  }
  function numWords(text) { return (text.match(/\S+/gu) || []).length; }
  function save() {
    clearTimeout(saveTimer);
    try {
      const data = { ...settings, cursor: committed };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      el.saveStatus.textContent = 'Tersimpan lokal';
      el.cloudLabel.textContent = 'Simpan otomatis';
      saveFailed = false;
    } catch (error) {
      saveFailed = true;
      el.saveStatus.textContent = 'Gagal menyimpan';
      el.cloudLabel.textContent = 'Penyimpanan penuh';
      visibleMessage('Penyimpanan browser tidak tersedia. Salin naskah Anda untuk cadangan.');
    }
  }
  function queueSave() {
    el.saveStatus.textContent = 'Menyimpan…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
  }
  function load() {
    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (existing && typeof existing === 'object') {
        Object.keys(DEFAULTS).forEach(key => {
          if (typeof existing[key] === typeof DEFAULTS[key]) settings[key] = existing[key];
        });
        if (Number.isInteger(existing.cursor)) committed = Math.max(0, existing.cursor);
      }
    } catch (_) { /* bad browser storage; fall back to defaults */ }
    settings.size = clamp(settings.size, 24, 120);
    settings.line = clamp(settings.line, 1.05, 2);
    settings.width = clamp(settings.width, 54, 100);
    settings.cue = clamp(settings.cue, 18, 75);
    settings.speed = clamp(settings.speed, 12, 170);
    if (!VALID_FONTS.includes(settings.font)) settings.font = DEFAULTS.font;
    if (!['id-ID','en-US','en-GB','ms-MY'].includes(settings.lang)) settings.lang = 'id-ID';
  }
  function setUiFromSettings() {
    el.scriptName.value = settings.name;
    el.scriptInput.value = settings.script;
    el.sizeRange.value = settings.size;
    el.lineRange.value = settings.line;
    el.widthRange.value = settings.width;
    el.cueRange.value = settings.cue;
    el.fontSelect.value = settings.font;
    el.mirrorHorizontal.checked = settings.mirrorX;
    el.mirrorVertical.checked = settings.mirrorY;
    el.cueVisible.checked = settings.cueVisible;
    el.smoothScroll.checked = settings.smooth;
    el.languageSelect.value = settings.lang;
    el.speedRange.value = settings.speed;
    applyStyle();
    updateTitleAndStats();
  }
  function applyStyle() {
    el.sizeValue.textContent = `${settings.size} px`;
    el.lineValue.textContent = `${Number(settings.line).toFixed(2)}×`;
    el.widthValue.textContent = `${settings.width}%`;
    el.cueValue.textContent = `${settings.cue}%`;
    el.speedValue.textContent = `${settings.speed} px/detik`;
    const style = el.app.style;
    style.setProperty('--font-size', settings.size + 'px');
    style.setProperty('--line-height', settings.line);
    style.setProperty('--reader-width', settings.width + '%');
    style.setProperty('--cue-pos', settings.cue + '%');
    style.setProperty('--mirror-x', settings.mirrorX ? '-1' : '1');
    style.setProperty('--mirror-y', settings.mirrorY ? '-1' : '1');
    style.setProperty('--font-face', `'${settings.font.replaceAll("'", '')}','Arial Rounded MT Bold','Trebuchet MS',sans-serif`);
    el.cueLine.hidden = !settings.cueVisible;
    el.prompterFrame.classList.toggle('mirrored-vertical', settings.mirrorY);
    updateReaderPadding();
  }
  function updateReaderPadding() {
    const top = Math.max(22, el.viewport.clientHeight * (settings.cue / 100) - settings.size * settings.line * .4);
    el.scriptDisplay.style.paddingTop = Math.round(top) + 'px';
    el.scriptDisplay.style.paddingBottom = Math.max(130, Math.round(el.viewport.clientHeight * .75)) + 'px';
  }
  function updateTitleAndStats() {
    el.topScriptName.textContent = settings.name.trim() || 'Naskah Baru';
    const words = numWords(settings.script);
    el.wordCount.textContent = `${words.toLocaleString('id-ID')} kata`;
    el.durationEstimate.textContent = `±${Math.max(1, Math.round(words / 135))} menit baca`;
  }
  const SPEECH_EQUIVALENTS = Object.freeze({
    'aqilla':'akila','aqila':'akila','akilla':'akila',
    'nggak':'tidak','ngga':'tidak','enggak':'tidak','gak':'tidak','ga':'tidak',
    'engga':'tidak','ndak':'tidak', 'gw':'gue', 'gua':'gue', 'aku':'aku'
  });
  const NUMBER_UNITS = ['nol','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas'];
  function numberIndonesian(n) {
    if (n < 12) return NUMBER_UNITS[n];
    if (n < 20) return numberIndonesian(n - 10) + ' belas';
    if (n < 100) return numberIndonesian(Math.floor(n/10)) + ' puluh' + (n%10 ? ' ' + numberIndonesian(n%10) : '');
    if (n < 200) return 'seratus' + (n%100 ? ' ' + numberIndonesian(n%100) : '');
    if (n < 1000) return numberIndonesian(Math.floor(n/100)) + ' ratus' + (n%100 ? ' ' + numberIndonesian(n%100) : '');
    if (n < 2000) return 'seribu' + (n%1000 ? ' ' + numberIndonesian(n%1000) : '');
    if (n < 10000) return numberIndonesian(Math.floor(n/1000)) + ' ribu' + (n%1000 ? ' ' + numberIndonesian(n%1000) : '');
    return String(n);
  }
  function tokensFromText(input) {
    return String(input || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('id')
      .replace(/(\d+)(?:[.,](\d+))?/g, (whole, integral, decimal) => {
        if (settings.lang !== 'id-ID' || integral.length > 4 || Number(integral) > 9999) return whole;
        const base = numberIndonesian(Number(integral));
        return decimal ? `${base} koma ${decimal.split('').map(d=>numberIndonesian(Number(d))).join(' ')}` : base;
      })
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map(s => SPEECH_EQUIVALENTS[s] || s);
  }
  function buildScript() {
    const text = settings.script.replace(/\r\n?/g, '\n');
    const fragment = document.createDocumentFragment();
    displayWords = [];
    matchTokens = [];
    paragraphStarts = [];
    const paragraphs = text.split('\n');
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const line = document.createElement('div');
      line.className = 'script-line';
      const matches = paragraph.match(/\S+|\s+/gu) || [];
      let hasWord = false;
      paragraphStarts.push(matchTokens.length);
      matches.forEach(part => {
        if (/^\s+$/u.test(part)) { line.append(document.createTextNode(part)); return; }
        hasWord = true;
        const span = document.createElement('span');
        span.className = 'word future';
        span.textContent = part;
        const wordIndex = displayWords.length;
        span.dataset.index = String(wordIndex);
        const firstToken = matchTokens.length;
        const t = tokensFromText(part);
        t.forEach(normalized => matchTokens.push({ normalized, wordIndex }));
        displayWords.push({ element: span, text: part, firstToken, lastToken: matchTokens.length, paragraph: paragraphIndex });
        line.append(span);
      });
      if (!hasWord) { line.classList.add('empty-line'); line.textContent = '\u00a0'; }
      fragment.append(line);
    });
    if (!text.trim()) {
      fragment.replaceChildren();
      const welcome = document.createElement('div');
      welcome.className = 'empty-message';
      welcome.textContent = 'Tempel naskah di panel kiri untuk mulai membaca.';
      fragment.append(welcome);
    }
    el.scriptDisplay.replaceChildren(fragment);
    paintedCurrent = -1;
    paintedReadThrough = -1;
    committed = clamp(committed, 0, matchTokens.length);
    projected = committed;
    updateReaderPadding();
    updateReadState(true);
  }
  function positionToWord(tokenIndex) {
    if (!displayWords.length) return null;
    if (tokenIndex >= matchTokens.length) return displayWords.at(-1);
    return displayWords[matchTokens[clamp(tokenIndex,0,matchTokens.length-1)].wordIndex];
  }
  function targetForToken(tokenIndex) {
    const word = positionToWord(tokenIndex);
    if (!word) return 0;
    // Measurements are limited to the active word, not every word in a long script.
    const span = word.element;
    const viewportRect = el.viewport.getBoundingClientRect();
    const textRect = span.getBoundingClientRect();
    const delta = settings.mirrorY
      ? (viewportRect.top + viewportRect.height * (1-settings.cue/100) - textRect.bottom)
      : (textRect.top - (viewportRect.top + viewportRect.height * settings.cue/100));
    // Move *within* a text line as well as at line breaks. Previously nothing
    // visibly scrolled until the reader reached the next wrapped line.
    // offsetLeft is independent of horizontal mirror transforms.
    const leftProgress = clamp(span.offsetLeft / Math.max(1,el.scriptDisplay.clientWidth), 0, 1);
    const glidingPixels = leftProgress * settings.size * settings.line * .6;
    return clamp(el.viewport.scrollTop + (settings.mirrorY ? -delta - glidingPixels : delta + glidingPixels),
      0, Math.max(0, el.viewport.scrollHeight - el.viewport.clientHeight));
  }
  function moveToToken(token, immediate = false) {
    targetScroll = targetForToken(token);
    if (immediate || !settings.smooth || document.hidden) {
      scrollProgrammatically = true;
      el.viewport.scrollTop = targetScroll;
      scrollProgrammatically = false;
    }
  }
  function updateReadState(immediate = false) {
    const shown = clamp(Math.floor(projected), 0, matchTokens.length);
    const current = positionToWord(shown);
    const currentIndex = shown < matchTokens.length && current ? matchTokens[shown].wordIndex : -1;
    let readThrough = paintedReadThrough;
    // Advance or rewind the highlight incrementally instead of rewriting the
    // className & ARIA on *every word* for every mic/recognition update.
    while (readThrough + 1 < displayWords.length &&
      displayWords[readThrough + 1].lastToken <= shown) {
      readThrough++;
    }
    while (readThrough >= 0 && displayWords[readThrough].lastToken > shown) readThrough--;
    if (paintedCurrent >= 0 && paintedCurrent !== currentIndex && displayWords[paintedCurrent]) {
      const previous = displayWords[paintedCurrent].element;
      previous.className = 'word ' + (paintedCurrent <= readThrough ? 'read' : 'future');
      previous.removeAttribute('aria-current');
    }
    if (readThrough > paintedReadThrough) {
      for (let i=paintedReadThrough+1;i<=readThrough;i++) displayWords[i].element.className='word read';
    } else if (readThrough < paintedReadThrough) {
      for (let i=readThrough+1;i<=paintedReadThrough;i++) displayWords[i].element.className='word future';
    }
    if (currentIndex >= 0) {
      const node=displayWords[currentIndex].element;
      node.className='word current';
      node.setAttribute('aria-current','true');
    }
    paintedReadThrough = readThrough;
    paintedCurrent = currentIndex;
    const percent = matchTokens.length ? Math.round(committed / matchTokens.length * 100) : 0;
    el.progressLabel.textContent = percent + '% naskah';
    if (!manualPlaying) moveToToken(shown, immediate);
    if (matchTokens.length && committed >= matchTokens.length) {
      el.readingBadge.textContent = 'SELESAI ✓';
      if (voiceWanted) stopVoice(false);
    } else {
      el.readingBadge.textContent = voiceWanted ? 'MENGIKUTI SUARA' : manualPlaying ? 'SCROLL OTOMATIS' : 'SIAP DIBACA';
    }
  }
  function manualNavigate(delta) {
    stopManual();
    if (!displayWords.length) return;
    const at = clamp(committed,0,matchTokens.length);
    let paragraph = 0;
    for (let i=0;i<paragraphStarts.length;i++) {
      if (paragraphStarts[i] <= at) paragraph=i;
    }
    let target = clamp(paragraph+delta,0,paragraphStarts.length-1);
    if (delta > 0) {
      while (target < paragraphStarts.length-1 && paragraphStarts[target] <= at) target++;
    } else if (delta < 0 && paragraphStarts[paragraph] < at) {
      target=paragraph;
    }
    committed = paragraphStarts[target];
    projected = committed;
    updateReadState(true);
    queueSave();
  }
  function seekWord(wordIndex) {
    stopManual();
    committed = displayWords[wordIndex]?.firstToken ?? 0;
    projected = committed;
    el.heardText.textContent = 'Posisi baca dipindah secara manual';
    updateReadState(true);
    queueSave();
  }
  function equalTokens(a, b) {
    if (a === b) return true;
    if (a.length < 5 || b.length < 5 || Math.abs(a.length-b.length) > 1) return false;
    // A single recognition typo in a distinctive word should not freeze the script.
    if (a.length === b.length) {
      let errors = 0;
      for (let i=0;i<a.length;i++) if (a[i] !== b[i] && ++errors > 1) return false;
      return true;
    }
    const short = a.length < b.length ? a : b;
    const long = a.length < b.length ? b : a;
    let i=0,j=0,errors=0;
    while (i<short.length && j<long.length) {
      if (short[i] === long[j]) {i++;j++;} else { if (++errors > 1) return false; j++; }
    }
    return true;
  }
  /**
   * A forward-only, gap-tolerant matcher. Every anchor is scored in a small window around
   * the current location. Requires stronger evidence for larger jumps to prevent frequent
   * filler words ("yang", "dan", "di") from sending the script ahead unexpectedly.
   */
  function alignSpoken(base, transcript) {
    const spoken = tokensFromText(transcript);
    if (!spoken.length || !matchTokens.length) return base;
    const lower = Math.max(0, base-9);
    const upper = Math.min(matchTokens.length-1, base+105);
    let bestScore = -Infinity;
    let bestEnd = base;
    let bestHits = 0;
    let bestAdjacent = 0;
    for (let start = lower; start <= upper; start++) {
      for (let offset=0;offset<Math.min(4,spoken.length);offset++) {
        if (!equalTokens(matchTokens[start].normalized,spoken[offset])) continue;
        let end = start;
        let hits = 1;
        let adjacent = 0;
        let missedScript = 0;
        let ignoredSpeech = offset;
        let lastSpoken = offset;
        let previous = start;
        for (let k=offset+1;k<spoken.length;k++) {
          let found = -1;
          const maxCheck = Math.min(matchTokens.length-1, end+7, upper+2);
          for (let j=end+1;j<=maxCheck;j++) {
            if (equalTokens(matchTokens[j].normalized,spoken[k])) { found=j; break; }
          }
          if (found < 0) { ignoredSpeech++; continue; }
          missedScript += found - end - 1;
          if (found === previous+1 && k === lastSpoken+1) adjacent++;
          previous = found;
          lastSpoken = k;
          end = found;
          hits++;
        }
        const forward = end + 1 - base;
        if (forward <= 0) continue;
        if (hits === 1 && (spoken.length > 2 || forward > 2)) continue;
        if (forward > 8 && hits < 3) continue;
        if (forward > 18 && (hits < 4 || adjacent < 1)) continue;
        if (forward > 32 && hits < 6) continue;
        if (forward > 55 && (hits < 8 || adjacent < 2)) continue;
        const wordLengthBonus = Math.min(1.7, spoken.filter(s => s.length > 5).length*.19);
        const score = hits*2.7 + adjacent*1.8 + wordLengthBonus
          - ignoredSpeech*.62 - missedScript*.52
          - Math.max(0,start-base)*.17 - Math.max(0,base-start)*.34
          - Math.max(0,forward-8)*.075;
        if (score > bestScore || (score === bestScore && hits > bestHits)) {
          bestScore = score;
          bestEnd = end+1;
          bestHits = hits;
          bestAdjacent = adjacent;
        }
      }
    }
    if (bestHits === 0) return base;
    if (bestHits === 1 && bestScore < 1.65) return base;
    if (bestEnd - base > 15 && bestAdjacent < 1) return base;
    return Math.max(base,bestEnd);
  }
  function status(kind, label, tag, subtitle) {
    el.modeLabel.textContent = label;
    el.liveDot.className = 'live-dot' + (kind === 'active'?' active':kind === 'warning'?' warning':'');
    el.voiceTag.textContent = tag;
    el.voiceBar.classList.toggle('listening', kind === 'active' && voiceWanted);
    if (subtitle !== undefined) el.heardText.textContent = subtitle;
  }
  function isSupported() { return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition); }
  function clearVoiceTimer() { clearTimeout(voiceRetryTimer); voiceRetryTimer = 0; }
  function speechErrorMessage(errorCode) {
    const messages = {
      'not-allowed': 'Akses mikrofon ditolak. Klik ikon gembok di samping alamat web lalu izinkan Mikrofon.',
      'service-not-allowed': 'Layanan pengenal suara ditolak browser. Gunakan Chrome atau Edge yang mendukung Speech Recognition.',
      'audio-capture': 'Mikrofon tidak ditemukan. Periksa mikrofon dan pengaturan suara Windows.',
      'network': 'Layanan pengenal suara gagal terhubung. Periksa koneksi internet dan pengaturan browser.',
      'language-not-supported': 'Bahasa ini belum didukung layanan suara. Coba Bahasa Indonesia di Chrome / Edge.',
      'no-speech': 'Belum terdengar ucapan. Menunggu suara…',
      'aborted': 'Pengenalan suara dihentikan.'
    };
    return messages[errorCode] || `Pengenalan suara mengalami gangguan (${errorCode}).`;
  }
  async function startAudioAssist() {
    // The analyser works locally: no extra servers, no recording or upload.
    // If the browser denies a second mic capture, regular recognition still works.
    const generation=++audioAssistGeneration;
    audioAssistAvailable=false;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext && !window.webkitAudioContext) return;
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:{
        echoCancellation:true, noiseSuppression:true, autoGainControl:true
      }});
      if (!voiceWanted || generation !== audioAssistGeneration) {
        stream.getTracks().forEach(t=>t.stop()); return;
      }
      const AudioCtx=window.AudioContext || window.webkitAudioContext;
      const ctx=new AudioCtx({latencyHint:'interactive'});
      const source=ctx.createMediaStreamSource(stream);
      const analyser=ctx.createAnalyser();
      analyser.fftSize=1024;
      analyser.smoothingTimeConstant=.15;
      source.connect(analyser);
      if (ctx.state === 'suspended') await ctx.resume();
      if (!voiceWanted || generation !== audioAssistGeneration) {
        stream.getTracks().forEach(t=>t.stop()); await ctx.close(); return;
      }
      microphoneStream=stream;
      audioContext=ctx;
      audioAnalyser=analyser;
      audioSamples=new Uint8Array(analyser.fftSize);
      audioFloor=.007;
      audioLastPollAt=0;
      audioAssistAvailable=true;
    } catch (_) {
      audioAssistAvailable=false;
    }
  }
  function stopAudioAssist() {
    ++audioAssistGeneration;
    if (microphoneStream) microphoneStream.getTracks().forEach(t=>t.stop());
    microphoneStream=null;
    if (audioContext) {try { audioContext.close(); } catch (_) {}}
    audioContext=null;
    audioAnalyser=null;
    audioSamples=null;
    audioAssistAvailable=false;
    speechWasActive=false;
    voiceEnergySince=0;
    voiceEnergyUntil=0;
  }
  function pollAudioAssist(now) {
    if (!voiceWanted || !audioAssistAvailable || !audioAnalyser || document.hidden) return;
    if (now - audioLastPollAt < 55) return;
    const dt = audioLastPollAt ? Math.min(.12,(now-audioLastPollAt)/1000) : 0;
    audioLastPollAt=now;
    audioAnalyser.getByteTimeDomainData(audioSamples);
    let energy=0;
    for (let i=0;i<audioSamples.length;i++) {
      const v=(audioSamples[i]-128)/128;
      energy += v*v;
    }
    const rms=Math.sqrt(energy/audioSamples.length);
    const above = rms > Math.max(.013, audioFloor*2.6);
    if (!above) audioFloor=clamp(audioFloor*.985+rms*.015,.003,.03);
    if (above) {
      if (!voiceEnergySince) voiceEnergySince=now;
      voiceEnergyUntil=now+200;
    } else if (now>voiceEnergyUntil) voiceEnergySince=0;
    const speaking=Boolean(voiceEnergySince && now-voiceEnergySince > 110 && now<voiceEnergyUntil);
    speechWasActive=speaking;
    if (!speaking) return;
    // If the browser silently stops transcribing speech, rotate the recognizer.
    // Do this rarely: repeated restarts themselves cause lost words.
    if (recognition && !recognitionStarting &&
        now-lastRecognitionProgressAt>7500 && now-lastForcedVoiceRestartAt>8500) {
      lastForcedVoiceRestartAt=now;
      status('warning','MEMULIHKAN PENGENAL SUARA','MENCOBA LAGI',
        'Mikrofon mendengar suara, tetapi pengenal kata tertunda. Menyambungkan ulang…');
      try { recognition.abort(); } catch (_) {}
    }
    // Fast, bounded motion whenever speech has *audible* energy. The browser's
    // transcript takes over and corrects the exact script location when ready.
    const gap = now - lastRecognitionProgressAt;
    const maxAhead = recognizerEverMatched ? (gap > 1600 ? 13 : 7) : 3;
    const cap=recognitionCursor + maxAhead;
    voiceEstimate = Math.min(cap,Math.max(voiceEstimate, recognitionCursor) + 2.55*dt);
    const tentative=Math.min(matchTokens.length,Math.floor(voiceEstimate));
    if (tentative > projected) {
      projected=tentative;
      updateReadState();
      if (gap > 1600 && now-micMoveSaveAt>3500) {
        el.heardText.textContent='Suara terdeteksi · menunggu hasil pengenal kata…';
        micMoveSaveAt=now;
      }
    }
  }
  function acceptVoiceTranscript(base, transcript) {
    let candidate=alignSpoken(base, transcript);
    if (candidate <= recognitionCursor) {
      // Long interim phrases or backend edits sometimes repeat earlier words.
      const fragments=tokensFromText(transcript);
      if (fragments.length>=5) {
        const tail=fragments.slice(-Math.min(16,fragments.length));
        candidate=Math.max(candidate,alignSpoken(Math.max(0,recognitionCursor-3),tail.join(' ')));
      }
    }
    if (candidate > recognitionCursor) {
      recognitionCursor=candidate;
      recognizerEverMatched=true;
      lastRecognitionProgressAt=performance.now();
      voiceEstimate=Math.max(voiceEstimate,candidate);
      committed=Math.max(committed,candidate);
    }
    return candidate;
  }
  function startVoice() {
    if (!settings.script.trim()) { visibleMessage('Masukkan skrip terlebih dahulu.'); return; }
    if (!isSupported()) {
      status('warning','BROWSER TIDAK MENDUKUNG','TIDAK TERSEDIA', 'Voice Follow membutuhkan Chrome / Edge yang mendukung Web Speech API.');
      visibleMessage('Voice Follow tidak tersedia di browser ini. Coba Google Chrome atau Microsoft Edge.', 6500);
      return;
    }
    stopManual();
    if (committed >= matchTokens.length) { committed=0; projected=0; updateReadState(true); }
    voiceWanted = true;
    recognitionCursor = committed;
    voiceEstimate = committed;
    recognizerEverMatched = false;
    lastRecognitionProgressAt=performance.now();
    speechWasActive=false;
    exclusiveMicFallbackTried=false;
    lastForcedVoiceRestartAt=0;
    startAudioAssist();
    el.voiceBtn.classList.add('running');
    el.voiceBtnLabel.textContent = 'Hentikan Voice Follow';
    el.voiceIcon.textContent = '■';
    el.voiceTitle.textContent = 'Voice Follow aktif';
    voiceBackoff = 400;
    status('warning','MENYAMBUNGKAN MIKROFON','MENYAMBUNG', 'Tunggu izin mikrofon, lalu mulai membaca naskah.');
    launchRecognition();
  }
  function launchRecognition() {
    if (!voiceWanted || recognitionStarting) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    clearVoiceTimer();
    recognitionStarting = true;
    const rec = new Recognition();
    recognition = rec;
    processedFinals = new Set();
    segmentAnchors = new Map();
    rec.lang = settings.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      if (recognition !== rec) return;
      recognitionStarting = false;
      voiceBackoff = 400;
      status('active','VOICE FOLLOW AKTIF','MENDENGARKAN','Mikrofon aktif · bacakan kata-kata di naskah');
      updateReadState();
    };
    rec.onspeechstart = () => {
      if (recognition === rec && voiceWanted) status('active','VOICE FOLLOW AKTIF','MENDENGARKAN');
    };
    rec.onresult = (event) => {
      if (recognition !== rec || !voiceWanted) return;
      let interim = '';
      let newestFinal = '';
      // Align each recognizer segment to the position where its first interim
      // was heard. Interim phrases can grow and be revised several times.
      for (let i=0;i<event.results.length;i++) {
        const result = event.results[i];
        const words = result[0]?.transcript?.trim() || '';
        if (!words) continue;
        if (!segmentAnchors.has(i)) segmentAnchors.set(i, recognitionCursor);
        const anchor=segmentAnchors.get(i);
        if (result.isFinal) {
          if (!processedFinals.has(i)) {
            processedFinals.add(i);
            acceptVoiceTranscript(anchor,words);
            newestFinal=words;
          }
        } else {
          // Process interim immediately; don't wait for a final phrase boundary.
          acceptVoiceTranscript(anchor,words);
          interim += (interim ? ' ' : '') + words;
        }
      }
      projected=Math.max(projected,committed);
      el.heardText.textContent = interim ? `Terdengar: “${interim.slice(-125)}”`
        : newestFinal ? `Terbaca: “${newestFinal.slice(-125)}”` : 'Menunggu kalimat berikutnya…';
      updateReadState();
      if (!interim) queueSave();
    };
    rec.onerror = (event) => {
      if (recognition !== rec || !voiceWanted) return;
      const code = event.error || 'unknown';
      if (code === 'audio-capture' && audioAssistAvailable && !exclusiveMicFallbackTried) {
        // Some phones cannot share mic capture between Web Audio and Web Speech.
        // Release the optional analyser; onend will restart recognizer alone.
        exclusiveMicFallbackTried=true;
        stopAudioAssist();
        voiceBackoff=400;
        status('warning','MENCOBA MIKROFON UTAMA','MENCOBA LAGI',
          'Melepas detektor suara tambahan agar pengenal kata dapat memakai mikrofon.');
        try {rec.abort();}catch (_){}
      } else if (['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(code)) {
        visibleMessage(speechErrorMessage(code),6000);
        stopVoice(false);
        status('warning','MICROFON TIDAK TERSEDIA','PERLU TINDAKAN',speechErrorMessage(code));
      } else if (code === 'network') {
        voiceBackoff = Math.min(Math.max(voiceBackoff*2,650),3200);
        status('warning','GANGGUAN KONEKSI','MENCOBA LAGI',speechErrorMessage(code));
      } else if (code === 'no-speech') {
        status('warning','MENUNGGU UCAPAN','MENCOBA LAGI',speechErrorMessage(code));
      }
    };
    rec.onend = () => {
      if (recognition !== rec) return;
      recognitionStarting = false;
      recognition = null;
      projected = Math.max(projected,committed);
      updateReadState();
      if (voiceWanted) {
        status('warning','MENYAMBUNGKAN ULANG','MENCOBA LAGI', 'Koneksi suara terputus sesaat, menyambungkan ulang otomatis…');
        clearVoiceTimer();
        voiceRetryTimer = setTimeout(launchRecognition,Math.min(voiceBackoff,1600));
        voiceBackoff = Math.min(Math.round(voiceBackoff*1.3),3200);
      }
    };
    try { rec.start(); }
    catch (error) {
      recognitionStarting = false;
      recognition = null;
      stopVoice(false);
      visibleMessage('Mikrofon tidak dapat dinyalakan: ' + (error.message || 'tidak diketahui'));
    }
  }
  function stopVoice(showMessage = true) {
    voiceWanted = false;
    stopAudioAssist();
    clearVoiceTimer();
    recognitionStarting = false;
    const prev = recognition;
    recognition = null;
    if (prev) { prev.onend = null; prev.onerror = null; try { prev.abort(); } catch (_) {} }
    projected = committed;
    el.voiceBtn.classList.remove('running');
    el.voiceBtnLabel.textContent = 'Mulai Voice Follow';
    el.voiceIcon.textContent = '◉';
    el.voiceTitle.textContent = 'Voice Follow';
    status('idle','SIAP MEMBACA','NONAKTIF', 'Voice Follow tidak aktif');
    updateReadState();
    if (showMessage) visibleMessage('Voice Follow dihentikan.');
    queueSave();
  }
  function stopManual(syncPosition = true) {
    if (manualPlaying && syncPosition && displayWords.length) {
      committed = nearestTokenAtCue();
      projected = committed;
    }
    manualPlaying = false;
    el.manualIcon.textContent = '▶';
    el.manualLabel.textContent = 'Scroll manual';
    if (!voiceWanted) { el.modeLabel.textContent = 'SIAP MEMBACA'; updateReadState(); }
    if (syncPosition) queueSave();
  }
  function toggleManual() {
    if (!settings.script.trim()) { visibleMessage('Masukkan naskah terlebih dahulu.'); return; }
    if (voiceWanted) stopVoice(false);
    if (!manualPlaying && committed >= matchTokens.length) resetPosition();
    if (manualPlaying) {
      committed = nearestTokenAtCue();
      projected = committed;
    }
    manualPlaying = !manualPlaying;
    el.manualIcon.textContent = manualPlaying ? 'Ⅱ' : '▶';
    el.manualLabel.textContent = manualPlaying ? 'Jeda scroll' : 'Scroll manual';
    el.modeLabel.textContent = manualPlaying ? 'SCROLL OTOMATIS' : 'SIAP MEMBACA';
    el.liveDot.className = manualPlaying ? 'live-dot active' : 'live-dot';
    updateReadState();
  }
  function nearestTokenAtCue() {
    if (!displayWords.length) return 0;
    const rect = el.viewport.getBoundingClientRect();
    const aim = rect.top + rect.height*(settings.mirrorY ? 1-settings.cue/100 : settings.cue/100);
    let low=0, high=displayWords.length-1;
    // Binary search avoids thousands of layout measurements on long scripts.
    const wordY = (i) => {
      const bounds = displayWords[i].element.getBoundingClientRect();
      return (bounds.top+bounds.bottom)/2;
    };
    while (low <= high) {
      const mid = (low+high)>>1;
      const y = wordY(mid);
      const moveRight = settings.mirrorY ? y > aim : y < aim;
      if (moveRight) low = mid+1;
      else high = mid-1;
    }
    const candidates = [clamp(low-1,0,displayWords.length-1),clamp(low,0,displayWords.length-1)];
    const found = candidates.reduce((best,i) =>
      Math.abs(wordY(i)-aim)<Math.abs(wordY(best)-aim) ? i : best,candidates[0]);
    return displayWords[found].firstToken;
  }
  function animationLoop(now) {
    pollAudioAssist(now);
    const seconds = Math.min(0.06, Math.max(0,(now-lastFrameAt)/1000 || 0));
    lastFrameAt = now;
    if (manualPlaying) {
      scrollProgrammatically = true;
      el.viewport.scrollTop += (settings.mirrorY ? -1 : 1)*settings.speed*seconds;
      scrollProgrammatically = false;
      targetScroll = el.viewport.scrollTop;
      if (now % 260 < 24) {
        committed = nearestTokenAtCue();
        projected = committed;
        const progress = matchTokens.length ? Math.round(committed/matchTokens.length*100) : 0;
        el.progressLabel.textContent = progress+'% naskah';
      }
      const stopEdge = settings.mirrorY ? el.viewport.scrollTop <= 0 :
        el.viewport.scrollTop >= el.viewport.scrollHeight - el.viewport.clientHeight - 1;
      if (stopEdge) stopManual();
    } else if (Math.abs(el.viewport.scrollTop-targetScroll) > .8) {
      const difference = targetScroll - el.viewport.scrollTop;
      scrollProgrammatically = true;
      el.viewport.scrollTop += settings.smooth ? (Math.sign(difference)*Math.max(.8, Math.abs(difference)*Math.min(.27,seconds*11))) : difference;
      scrollProgrammatically = false;
    }
    scrollFrame=requestAnimationFrame(animationLoop);
  }
  function resetPosition() {
    if (voiceWanted) stopVoice(false);
    if (manualPlaying) stopManual();
    committed = 0;
    projected = 0;
    updateReadState(true);
    save();
    visibleMessage('Naskah kembali ke awal.');
  }
  async function toggleFullscreen() {
    if (document.fullscreenElement || fullscreenFallback) {
      fullscreenFallback = false;
      if (document.fullscreenElement && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch (_) { /* fallback */ }
      }
      el.app.classList.remove('fullscreen-reading');
    } else {
      el.app.classList.add('fullscreen-reading');
      if (document.documentElement.requestFullscreen) {
        try { await document.documentElement.requestFullscreen(); }
        catch (_) { fullscreenFallback = true; }
      } else fullscreenFallback = true;
    }
    requestAnimationFrame(() => { updateReaderPadding(); moveToToken(projected,true); });
  }
  function toggleSidebar() {
    const collapsed = el.app.classList.toggle('collapsed');
    el.sidebarShade.hidden = collapsed;
    requestAnimationFrame(() => setTimeout(() => { updateReaderPadding(); moveToToken(projected,true); },275));
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 30*1024*1024) { visibleMessage('File terlalu besar. Batas maksimum impor 30 MB.'); return; }
    const ext = (file.name.split('.').at(-1) || '').toLowerCase();
    el.importBtn.disabled = true;
    el.importBtn.textContent = 'Mengimpor naskah…';
    try {
      let text = '';
      if (['txt','md'].includes(ext)) text = await file.text();
      else if (ext === 'docx') {
        if (!window.mammoth) throw new Error('Pustaka DOCX tidak termuat. Periksa internet lalu muat ulang halaman.');
        const extracted = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        text = extracted.value;
      } else if (ext === 'pdf') {
        if (!window.pdfjsLib) throw new Error('Pustaka PDF tidak termuat. Periksa internet lalu muat ulang halaman.');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
        const pages = [];
        for (let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          let built = '';
          for (const item of content.items) {
            if (!('str' in item)) continue;
            built += item.str;
            built += item.hasEOL ? '\n' : ' ';
          }
          pages.push(built.trim());
        }
        text = pages.join('\n\n');
        await pdf.destroy();
      } else throw new Error('Format belum didukung. Gunakan PDF, DOCX, TXT, atau MD.');
      if (!text.trim()) throw new Error('Naskah tidak berisi teks yang bisa dibaca. Untuk PDF hasil scan/foto, gunakan OCR terlebih dahulu.');
      if (settings.script.trim() && settings.script !== SAMPLE && !confirm('Ganti naskah saat ini dengan isi file ini? Naskah sebelumnya akan terganti.')) return;
      if (voiceWanted) stopVoice(false);
      stopManual();
      settings.script = text.trim().replace(/\r\n?/g,'\n');
      settings.name = file.name.replace(/\.(pdf|docx|txt|md)$/i,'').slice(0,90);
      committed = 0;
      projected = 0;
      el.scriptName.value = settings.name;
      el.scriptInput.value = settings.script;
      updateTitleAndStats();
      buildScript();
      updateReadState(true);
      save();
      visibleMessage(`Berhasil mengimpor “${file.name}” (${numWords(text)} kata).`,5200);
      if (matchMedia('(max-width:720px)').matches) toggleSidebar();
    } catch (err) { visibleMessage('Gagal impor: '+(err.message || 'Terjadi kesalahan'),6500); }
    finally { el.importBtn.disabled=false; el.importBtn.innerHTML='<span aria-hidden="true">↥</span> Impor PDF / DOCX / TXT'; el.fileInput.value=''; }
  }
  function isTyping(event) {
    const node = event.target;
    return Boolean(node?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(node?.tagName));
  }
  function initEventListeners() {
    el.toggleSidebar.addEventListener('click',toggleSidebar);
    el.closeSidebar.addEventListener('click',toggleSidebar);
    el.sidebarShade.addEventListener('click',toggleSidebar);
    el.scriptInput.addEventListener('input',() => {
      settings.script=el.scriptInput.value;
      stopManual(false);
      committed=0; projected=0;
      if (voiceWanted) stopVoice(false);
      updateTitleAndStats();
      clearTimeout(rebuildTimer);
      rebuildTimer=setTimeout(() => { buildScript(); updateReadState(true); },180);
      queueSave();
    });
    el.scriptName.addEventListener('input',() => { settings.name=el.scriptName.value; updateTitleAndStats(); queueSave(); });
    const inputs = [
      ['sizeRange','size',Number], ['lineRange','line',Number],['widthRange','width',Number],
      ['cueRange','cue',Number],['speedRange','speed',Number],
      ['fontSelect','font',String],['mirrorHorizontal','mirrorX',v=>v],
      ['mirrorVertical','mirrorY',v=>v],['cueVisible','cueVisible',v=>v],
      ['smoothScroll','smooth',v=>v],['languageSelect','lang',String]
    ];
    inputs.forEach(([id,key,cast]) => {
      const node=el[id];
      const evt=node.type === 'checkbox' ? 'change':'input';
      node.addEventListener(evt,() => {
        settings[key]=cast(node.type === 'checkbox' ? node.checked : node.value);
        if (id==='languageSelect' && voiceWanted) {
          stopVoice(false);
          visibleMessage('Bahasa diganti. Tekan Mulai Voice Follow untuk memakai bahasa baru.');
        }
        applyStyle();
        if (id==='mirrorVertical') moveToToken(projected,true);
        else requestAnimationFrame(()=>moveToToken(projected,true));
        queueSave();
      });
    });
    el.resetStyle.addEventListener('click',() => {
      const preserved = {script:settings.script,name:settings.name,lang:settings.lang};
      settings={...DEFAULTS,...preserved};
      setUiFromSettings();
      buildScript();
      updateReadState(true);
      save();
      visibleMessage('Tampilan dikembalikan ke pengaturan awal.');
    });
    el.importBtn.addEventListener('click',()=>el.fileInput.click());
    el.fileInput.addEventListener('change',e=>importFile(e.target.files?.[0]));
    el.pasteBtn.addEventListener('click',async()=>{
      try {
        const value=await navigator.clipboard.readText();
        if(!value.trim()) {visibleMessage('Clipboard kosong.');return;}
        el.scriptInput.value=value;
        el.scriptInput.dispatchEvent(new Event('input',{bubbles:true}));
        visibleMessage('Teks dari clipboard sudah ditempel.');
      } catch(_) {visibleMessage('Browser menolak akses clipboard. Gunakan Ctrl+V pada kolom naskah.');}
    });
    el.clearBtn.addEventListener('click',()=>{
      if(!el.scriptInput.value || confirm('Hapus seluruh naskah yang sedang ditampilkan?')) {
        el.scriptInput.value='';
        el.scriptInput.dispatchEvent(new Event('input',{bubbles:true}));
      }
    });
    el.scriptDisplay.addEventListener('click',event=>{
      const span=event.target.closest('.word');
      if (span) seekWord(Number(span.dataset.index));
    });
    el.voiceBtn.addEventListener('click',()=>voiceWanted?stopVoice():startVoice());
    el.manualBtn.addEventListener('click',toggleManual);
    el.backBtn.addEventListener('click',()=>manualNavigate(-1));
    el.nextBtn.addEventListener('click',()=>manualNavigate(1));
    el.resetPositionBtn.addEventListener('click',resetPosition);
    el.fullscreenBtn.addEventListener('click',toggleFullscreen);
    el.readingBadge.addEventListener('click',()=>{
      if (el.app.classList.contains('fullscreen-reading')) toggleFullscreen();
    });
    el.viewport.addEventListener('wheel',()=>{
      if (manualPlaying) stopManual();
      requestAnimationFrame(()=> { targetScroll=el.viewport.scrollTop; });
    },{passive:true});
    el.viewport.addEventListener('touchstart',()=>{ if(manualPlaying)stopManual();targetScroll=el.viewport.scrollTop; },{passive:true});
    el.viewport.addEventListener('scroll',()=>{
      if (!scrollProgrammatically && !manualPlaying && !voiceWanted) targetScroll=el.viewport.scrollTop;
    },{passive:true});
    window.addEventListener('keydown',ev=>{
      if(isTyping(ev) || ev.ctrlKey || ev.altKey || ev.metaKey) return;
      if (ev.key==='Escape' && fullscreenFallback) { ev.preventDefault(); toggleFullscreen(); return; }
      const key=ev.key.toLowerCase();
      if (ev.key===' '){ev.preventDefault();toggleManual();}
      else if (key==='v') {ev.preventDefault();voiceWanted?stopVoice():startVoice();}
      else if (key==='m') {ev.preventDefault();el.mirrorHorizontal.click();}
      else if (key==='f') {ev.preventDefault();toggleFullscreen();}
      else if (ev.key==='ArrowLeft') {ev.preventDefault();manualNavigate(-1);}
      else if (ev.key==='ArrowRight') {ev.preventDefault();manualNavigate(1);}
      else if (ev.key==='+' || ev.key==='=') {ev.preventDefault();el.sizeRange.value=clamp(settings.size+2,24,120);el.sizeRange.dispatchEvent(new Event('input'));}
      else if (ev.key==='-' || ev.key==='_') {ev.preventDefault();el.sizeRange.value=clamp(settings.size-2,24,120);el.sizeRange.dispatchEvent(new Event('input'));}
    });
    document.addEventListener('fullscreenchange',()=>{
      if (!document.fullscreenElement && !fullscreenFallback) {
        el.app.classList.remove('fullscreen-reading');
        setTimeout(()=>{ updateReaderPadding();moveToToken(projected,true); },80);
      }
    });
    document.addEventListener('visibilitychange',()=>{ lastFrameAt=performance.now(); });
    window.addEventListener('pagehide',save);
    if ('ResizeObserver' in window) new ResizeObserver(()=>{
      updateReaderPadding();
      if (!manualPlaying) requestAnimationFrame(()=>moveToToken(projected,true));
    }).observe(el.viewport);
    window.addEventListener('resize',()=>{updateReaderPadding();if(!manualPlaying)moveToToken(projected,true);});
  }
  function init() {
    load();
    setUiFromSettings();
    buildScript();
    initEventListeners();
    if (window.innerWidth<=720) {el.app.classList.add('collapsed');el.sidebarShade.hidden=true;}
    updateReadState(true);
    if (!isSupported()) {
      el.voiceTag.textContent='TIDAK TERSEDIA';
      el.voiceTitle.textContent='Voice Follow (browser tidak mendukung)';
      el.heardText.textContent='Gunakan Chrome / Edge untuk fitur mengikuti suara.';
    }
    lastFrameAt=performance.now();
    scrollFrame=requestAnimationFrame(animationLoop);
  }
  init();
  // Public controls used by a separate, optional remote adapter.
  // Deliberately leave the original keyboard shortcuts and interface untouched.
  function nudgeWords(delta) {
    if (!matchTokens.length) return;
    if (manualPlaying) stopManual(false);
    committed = clamp(committed + delta, 0, matchTokens.length);
    projected = committed;
    updateReadState(true);
    queueSave();
  }
  function adjustRemoteSpeed(delta) {
    settings.speed = clamp(settings.speed + delta, 12, 170);
    el.speedRange.value = settings.speed;
    el.speedRange.dispatchEvent(new Event('input', { bubbles: true }));
    visibleMessage(`Kecepatan scroll ${settings.speed} px/detik`, 1700);
  }
  window.AqillaPrompter = Object.freeze({
    get state() { return {committed,projected,recognitionCursor,audioAssistAvailable,speechWasActive,tokenCount:matchTokens.length,voiceWanted,manualPlaying,saveFailed,scrollSpeed:settings.speed}; },
    get visibleWords() { return displayWords.length; },
    remote: Object.freeze({
      playPause: toggleManual,
      previous: () => nudgeWords(-9),
      next: () => nudgeWords(9),
      speedUp: () => adjustRemoteSpeed(10),
      speedDown: () => adjustRemoteSpeed(-10),
      voice: () => voiceWanted ? stopVoice() : startVoice(),
      mirror: () => el.mirrorHorizontal.click(),
      start: resetPosition
    })
  });
})();
