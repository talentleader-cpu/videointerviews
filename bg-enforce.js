/* Wexpand video interview - virtual background ENFORCEMENT (2026-11-12) */
(function () {
  var BG = { ready: false, failed: false, lastFrame: 0, errs: 0, waiting: false, altBase: false, loadTimer: null };
  window.__bgState = BG;
  var PRIMARY = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/';
  var ALT = 'https://unpkg.com/@mediapipe/selfie_segmentation/';
  var IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  BG.slow = false; BG.everReady = false;
  var IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  function el(id) { return document.getElementById(id); }
  function msgHost() { return el('setupErr') || el('qErr'); }
  function showMsg(t) { var h = msgHost(); if (h) h.textContent = t || ''; }
  function removeBtn() { var b = el('bgRetryBtn'); if (b) b.remove(); }
  function addBtn() {
    var h = msgHost(); if (!h || el('bgRetryBtn')) return;
    var b = document.createElement('button');
    b.id = 'bgRetryBtn'; b.type = 'button'; b.textContent = 'Reintentar fondo virtual';
    b.style.cssText = 'display:block;margin:10px auto 0;padding:9px 18px;border:0;border-radius:9px;background:#0653A1;color:#fff;font-weight:700;cursor:pointer';
    b.onclick = function () { retry(); };
    h.parentNode.insertBefore(b, h.nextSibling);
  }
  function fail(why) {
    BG.failed = true; BG.ready = false;
    try { stopSegLoop(); } catch (_) {}
    var how = IS_IOS
      ? 'En iPhone/iPad: 1) pulsa "Reintentar fondo virtual", 2) actualiza iOS (15 o superior) y desactiva el Modo de bajo consumo, 3) cierra otras apps y pestañas y vuelve a abrir el enlace. En iPhone todos los navegadores usan el mismo motor, así que cambiar a Chrome no ayuda; si sigue fallando, abre el enlace en una computadora o en un teléfono Android, o escribe a tu reclutador.'
      : 'Prueba: 1) pulsa "Reintentar fondo virtual", 2) recarga la página, 3) abre el enlace en Chrome actualizado (computadora o Android), sin extensiones que bloqueen contenido y con buena conexión. Si no se resuelve, escribe a tu reclutador.';
    showMsg('No pudimos aplicar el fondo virtual de Wexpand, y es obligatorio para grabar tu entrevista. ' + how + (why ? ' (' + why + ')' : ''));
    addBtn();
  }
  function retry() {
    removeBtn(); showMsg(''); BG.failed = false; BG.ready = false; BG.errs = 0;
    BG.altBase = !BG.altBase; BG.slow = true; segmenter = null;
    try { mountStage(); } catch (_) {}
  }
  function loadLib() {
    if (window.SelfieSegmentation) return Promise.resolve(true);
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = ALT + 'selfie_segmentation.js';
      s.onload = function () { BG.altBase = true; res(!!window.SelfieSegmentation); };
      s.onerror = function () { res(false); };
      document.head.appendChild(s);
    });
  }
  function onResults(results) {
    onSegResults(results);
    BG.lastFrame = Date.now(); BG.everReady = true;
    if (!BG.ready) { BG.ready = true; BG.failed = false; removeBtn(); showMsg(''); if (BG.loadTimer) { clearTimeout(BG.loadTimer); BG.loadTimer = null; } }
  }
  window.startSegLoop = function (video) {
    BG.ready = false; BG.failed = false; BG.lastFrame = 0; BG.errs = 0;
    removeBtn();
    if (BG.loadTimer) clearTimeout(BG.loadTimer);
    BG.loadTimer = setTimeout(function () { if (!BG.ready) fail('tiempo agotado'); }, 25000);
    loadLib().then(function (ok) {
      if (!ok) { fail('no cargó la librería'); return; }
      try {
        if (!segmenter) {
          var base = BG.altBase ? ALT : PRIMARY;
          segmenter = new SelfieSegmentation({ locateFile: function (f) { return base + f; } });
          segmenter.setOptions({ modelSelection: 1 });
          segmenter.onResults(onResults);
        }
      } catch (e) { segmenter = null; fail('no se pudo iniciar'); return; }
      var token = { stop: false }; segRAF = token;
      (async function loop() {
        if (token.stop) return;
        try { await segmenter.send({ image: video }); }
        catch (e) { BG.errs++; if (BG.errs > 40 && !BG.ready) { fail('error de segmentación'); return; } }
        if (token.stop) return;
        if (IS_MOBILE) setTimeout(function () { requestAnimationFrame(loop); }, BG.slow ? 140 : 60); else requestAnimationFrame(loop);
      })();
    });
  };
  window.drawFallback = function () { fail('sin segmentación'); };
  window.pickRecordSource = function () {
    if (state.bg !== 'bg1' && state.bg !== 'bg2') state.bg = 'bg1';
    if (!(canvasEl && canvasEl.captureStream)) return null;
    var cs = canvasEl.captureStream(24);
    return new MediaStream(cs.getVideoTracks().concat(cameraStream.getAudioTracks()));
  };
  var origMount = window.mountStage;
  window.mountStage = function () {
    if (state.bg !== 'bg1' && state.bg !== 'bg2') state.bg = 'bg1';
    BG.ready = false;
    return origMount.apply(this, arguments);
  };
  var origStart = window.startRecording;
  window.startRecording = function () {
    if (!BG.ready || !currentStreamOk()) { return; }
    return origStart.apply(this, arguments);
  };
  function currentStreamOk() { return !!(canvasEl && canvasEl.captureStream); }
  var origRun = window.runRecordPhase;
  window.runRecordPhase = function () {
    var self = this, args = arguments;
    if (BG.ready && currentStreamOk()) { BG.waiting = false; return origRun.apply(self, args); }
    if (BG.waiting) return;
    BG.waiting = true;
    try { clearInterval(countdownInterval); clearTimeout(phaseTimer); } catch (_) {}
    var t0 = Date.now();
    showMsg('Aplicando tu fondo virtual… la grabación empezará en cuanto esté listo.');
    (function poll() {
      if (BG.ready && currentStreamOk()) { BG.waiting = false; showMsg(''); origRun.apply(self, args); return; }
      if (BG.failed || Date.now() - t0 > 25000) { BG.waiting = false; fail('no se aplicó a tiempo'); return; }
      setTimeout(poll, 200);
    })();
  };
  var origRender = window.render;
  window.render = function (step, extra) {
    if ((step === 'practiceIntro') && !BG.ready) { showMsg('Espera a que se aplique tu fondo virtual para continuar.'); return; }
    return origRender.apply(this, arguments);
  };
  setInterval(function () {
    var c = el('setupContinue');
    if (c && state.step === 'setup') {
      if (!BG.ready) { if (!c.disabled) c.disabled = true; if (c.textContent.indexOf('Aplicando') < 0 && !BG.failed) c.textContent = 'Aplicando tu fondo virtual…'; }
      else if (cameraStream && c.disabled) { c.disabled = false; c.textContent = 'Continuar →'; }
    }
  }, 150);

  // ---- Monitoreo de foco: registra cuándo el candidato sale de la pestaña/ventana (no descarta nada) ----
  var EV = []; var AW = null;
  function qNow() { try { return state.qIndex + 1; } catch (_) { return null; } }
  function isRec() { try { return !!(recorder && recorder.state === 'recording'); } catch (_) { return false; } }
  function leave(type) { if (AW) return; AW = { t: Date.now(), type: type, rec: isRec(), q: qNow() }; }
  function back() {
    if (!AW) return;
    EV.push({ q: AW.q, type: AW.type, recording: AW.rec, secs: Math.round((Date.now() - AW.t) / 1000), at: new Date(AW.t).toISOString() });
    AW = null;
  }
  window.__focusEvents = function () { return EV.slice(); };
  document.addEventListener('visibilitychange', function () { if (document.hidden) leave('tab_hidden'); else back(); });
  window.addEventListener('blur', function () { setTimeout(function () { if (!document.hasFocus() && !document.hidden) leave('window_blur'); }, 600); });
  window.addEventListener('focus', function () { back(); });
  window.addEventListener('pagehide', function () { back(); });

  function focusFor(a) { var q = a && a.order; var mine = EV.filter(function (x) { return x.q === q; }); return { tab_switches: mine.length, focus_events: mine, focus_total: EV.length }; }
  // Marca cada respuesta enviada como grabada con fondo obligatorio (el servidor lo guarda en bg_status)
  try {
    var _rpc = sb.rpc.bind(sb);
    sb.rpc = function (name, args) {
      if (name === 'submit_interview_public' && args && Array.isArray(args.p_answers) && BG.everReady) {
        args = Object.assign({}, args, { p_answers: args.p_answers.map(function (a) { return Object.assign({}, a, { bg_enforced: true, bg_v: 1 }, focusFor(a)); }) });
      }
      return _rpc(name, args);
    };
  } catch (_) {}
})();
