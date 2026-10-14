/* Wexpand video interview - camera/mic detection fix (2026-10-14)
   Replaces startCamera(): progressive fallbacks, device picker, friendly errors, in-app browser warning. */
(function () {
  var UA = navigator.userAgent || '';
  var IN_APP = /FBAN|FBAV|Instagram|LinkedInApp|WhatsApp|Line\/|Snapchat|MicroMessenger|TikTok|; wv\)/i.test(UA);
  var camSel = null, micSel = null;

  function el(id) { return document.getElementById(id); }
  function setErr(msg) { var e = el('setupErr'); if (e) e.textContent = msg || ''; }
  function setMsg(msg) { var e = el('stageMsg'); if (e) e.textContent = msg || ''; }
  function stopStream() { try { if (window.__camFixStream) window.__camFixStream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} }

  function friendly(e) {
    var n = (e && e.name) || '';
    if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError')
      return 'El navegador no tiene permiso para usar tu cámara o micrófono. Toca el candado (o el icono de cámara) junto a la dirección de la página, elige "Permitir" en Cámara y Micrófono y pulsa "Reintentar".';
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError')
      return 'No detectamos una cámara o micrófono disponible. Revisa que estén conectados y habilitados, elige otro dispositivo en la lista si aparece, y pulsa "Reintentar".';
    if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError')
      return 'Tu cámara o micrófono está siendo usado por otra aplicación o pestaña (Zoom, Teams, Meet, WhatsApp Web, etc.). Cierrala y pulsa "Reintentar".';
    return 'No pudimos acceder a tu cámara o micrófono. Pulsa "Reintentar" o prueba abrir este enlace en Chrome (computadora) o Safari (iPhone).';
  }

  function addRetry() {
    var host = el('setupErr'); if (!host || el('camRetryBtn')) return;
    var b = document.createElement('button');
    b.id = 'camRetryBtn'; b.type = 'button'; b.textContent = 'Reintentar';
    b.style.cssText = 'display:block;margin:10px 0 0;padding:9px 18px;border:0;border-radius:9px;background:#0653A1;color:#fff;font-weight:700;cursor:pointer';
    b.onclick = function () { window.startCamera(); };
    host.parentNode.insertBefore(b, host.nextSibling);
  }
  function removeRetry() { var b = el('camRetryBtn'); if (b) b.remove(); }

  async function tryGet(c) { try { return await navigator.mediaDevices.getUserMedia(c); } catch (e) { return { __err: e }; } }

  async function acquire(videoId, audioId) {
    var attempts = [];
    var v = videoId ? { deviceId: { exact: videoId } } : null;
    var a = audioId ? { deviceId: { exact: audioId } } : true;
    if (v) {
      attempts.push({ video: Object.assign({ width: { ideal: 960 }, height: { ideal: 720 } }, v), audio: a });
      attempts.push({ video: v, audio: a });
    } else {
      attempts.push({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' }, audio: a });
      attempts.push({ video: { facingMode: 'user' }, audio: a });
      attempts.push({ video: true, audio: a });
    }
    var lastErr = null;
    for (var i = 0; i < attempts.length; i++) {
      var r = await tryGet(attempts[i]);
      if (r && !r.__err) return r;
      lastErr = r.__err;
      if (lastErr && (lastErr.name === 'NotAllowedError' || lastErr.name === 'SecurityError')) break;
    }
    // last resort: try every detected camera one by one
    if (!videoId && lastErr && lastErr.name !== 'NotAllowedError') {
      try {
        var devs = (await navigator.mediaDevices.enumerateDevices()).filter(function (d) { return d.kind === 'videoinput'; });
        for (var j = 0; j < devs.length; j++) {
          if (!devs[j].deviceId) continue;
          var r2 = await tryGet({ video: { deviceId: { exact: devs[j].deviceId } }, audio: a });
          if (r2 && !r2.__err) return r2;
          lastErr = r2.__err || lastErr;
        }
      } catch (_) {}
    }
    var err = lastErr || new Error('sin dispositivos'); throw err;
  }

  async function renderPicker() {
    try {
      var devs = await navigator.mediaDevices.enumerateDevices();
      var cams = devs.filter(function (d) { return d.kind === 'videoinput'; });
      var mics = devs.filter(function (d) { return d.kind === 'audioinput'; });
      var stage = el('stage'); if (!stage || !stage.parentNode) return;
      var box = el('camPicker');
      if (!box) {
        box = document.createElement('div'); box.id = 'camPicker';
        box.style.cssText = 'margin:12px 0;display:grid;gap:8px;font-size:13px';
        stage.parentNode.insertBefore(box, stage.nextSibling);
      }
      var cur = (window.__camFixStream && window.__camFixStream.getVideoTracks()[0] && window.__camFixStream.getVideoTracks()[0].getSettings().deviceId) || '';
      var curA = (window.__camFixStream && window.__camFixStream.getAudioTracks()[0] && window.__camFixStream.getAudioTracks()[0].getSettings().deviceId) || '';
      function opts(list, sel, label) { return list.map(function (d, i) { return '<option value="' + d.deviceId + '"' + (d.deviceId === sel ? ' selected' : '') + '>' + ((d.label || (label + ' ' + (i + 1))).replace(/</g, '&lt;')) + '</option>'; }).join(''); }
      box.innerHTML = '<label>Cámara <select id="camSel" style="width:100%;padding:8px;border-radius:8px">' + opts(cams, cur, 'Cámara') + '</select></label>' +
        '<label>Micrófono <select id="micSel" style="width:100%;padding:8px;border-radius:8px">' + opts(mics, curA, 'Micrófono') + '</select></label>' +
        '<button type="button" id="camRedetect" style="padding:8px 14px;border:1px solid #c9d6e2;border-radius:8px;background:#fff;cursor:pointer">¿No ves tu cámara? Volver a detectar</button>';
      camSel = el('camSel'); micSel = el('micSel');
      var change = function () { start(camSel.value, micSel.value); };
      camSel.onchange = change; micSel.onchange = change;
      el('camRedetect').onclick = function () { start(); };
    } catch (_) {}
  }

  async function start(videoId, audioId) {
    removeRetry(); setErr(''); setMsg('Conectando con tu cámara…');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMsg('Tu navegador no permite usar la cámara.');
      setErr('Abre este enlace en Chrome (computadora/Android) o Safari (iPhone). Si lo abriste desde WhatsApp, Instagram o LinkedIn, usa "Abrir en el navegador".');
      addRetry(); return;
    }
    if (IN_APP && !videoId) setErr('Estás dentro de la app de otra red social: ahí la cámara suele fallar. Si no funciona, abre este enlace en Chrome o Safari ("Abrir en el navegador").');
    stopStream();
    try {
      var s = await acquire(videoId, audioId);
      window.__camFixStream = s; cameraStream = s;
      mountStage();
      var cont = el('setupContinue'); if (cont) cont.disabled = false;
      if (!IN_APP) setErr('');
      setMsg('');
      renderPicker();
    } catch (e) {
      cameraStream = null;
      setMsg('No pudimos acceder a tu cámara/micrófono.');
      setErr(friendly(e) + ' (' + ((e && (e.name || e.message)) || 'error') + ')');
      addRetry(); renderPicker();
    }
  }

  window.startCamera = function () { return start(); };
  try { navigator.mediaDevices.addEventListener('devicechange', function () { if (el('camPicker')) renderPicker(); }); } catch (_) {}
})();
