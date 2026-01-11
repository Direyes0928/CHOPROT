// new 2026-01-10
const advancedToggleBtn = document.getElementById('advancedToggleBtn');
const advancedPanel = document.getElementById('advancedPanel');

if (advancedToggleBtn && advancedPanel) {
  advancedToggleBtn.addEventListener('click', () => {
    advancedPanel.classList.toggle('hidden');
    advancedToggleBtn.textContent = 
      advancedPanel.classList.contains('hidden')
        ? '⚙ Advanced'
        : '⚙ Advanced (open)';
  });
}
// original 2026-01-10
// (replaced file with full CHOPROT engine)

// new 2026-01-10
// CHOPROT full engine: record (mic/screen), slice, waveform UI, draggable markers, export WAV/ZIP

let mediaRecorder = null;                // new 2026-01-10
let recordedChunks = [];                 // new 2026-01-10
let recordedBlob = null;                 // new 2026-01-10
let currentStream = null;                // new 2026-01-10

let decodedBuffer = null;                // new 2026-01-10
let slicePoints = [];                    // new 2026-01-10 (sample indices)
let waveformPeaks = [];                  // new 2026-01-10 (for drawing)
let draggingIdx = -1;                    // new 2026-01-10

// new 2026-01-10
// Single shared audio context (better stability)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// new 2026-01-10
// UI refs
const recordMicBtn = document.getElementById('recordMicBtn');
const recordScreenBtn = document.getElementById('recordScreenBtn');
const stopBtn = document.getElementById('stopBtn');
const sliceBtn = document.getElementById('sliceBtn');
const exportBtn = document.getElementById('exportBtn');

const sensitivityEl = document.getElementById('sensitivity');
const sensValEl = document.getElementById('sensVal');

const waveCanvas = document.getElementById('waveCanvas');
const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;

const statusText = document.getElementById('statusText');

// new 2026-01-10
const chopModeEl = document.getElementById('chopMode');
const applyModeBtn = document.getElementById('applyModeBtn');
const previewBtn = document.getElementById('previewBtn');
const exportMapBtn = document.getElementById('exportMapBtn');

const bpmEl = document.getElementById('bpm');
const bpmValEl = document.getElementById('bpmVal');
const modeHintEl = document.getElementById('modeHint');

// new 2026-01-10
const resetBtn = document.getElementById('resetBtn');
const revertModeBtn = document.getElementById('revertModeBtn');

// previous-mode snapshot for single-level revert
let _prevModeSnapshot = null;

// new 2026-01-10
// Mode-aware & playback-aware visualization state
let activeModeSliceSet = new Set();
// new 2026-01-10
let currentPreviewStepIndex = -1; // -1 = none, -2 = full-sample fallback
// new 2026-01-10
let _previewTimeouts = [];
// new 2026-01-10
// Audition (click-to-play) state
let currentAuditionSliceIndex = -1;
// new 2026-01-10
let _auditionSource = null;
// new 2026-01-10
let _auditionGain = null;
// new 2026-01-10
let _auditionTimeout = null;

// new 2026-01-10
let activeModeKey = 'none';
let patternMap = null; // { modeKey, bpm, steps: [{sliceIndex,startSample,endSample,beats}] }

// new 2026-01-10
// Canvas tool state: 'play' = audition slices, 'slice' = add/move/delete markers
let activeTool = 'play'; // 'play' | 'slice'
// Note: outer/main tool buttons removed from the page to avoid duplicates.
// Keep JS refs for them as null so existing checks are safe.
const toolPlayBtn = null;
const toolSliceBtn = null;
// top-right toolkit buttons (primary UI hooked to tool logic)
const toolPlayBtnTop = document.getElementById('toolPlayBtnTop');
const toolSliceBtnTop = document.getElementById('toolSliceBtnTop');
// loop toggle (plays preview continuously)
const toolLoopBtnTop = document.getElementById('toolLoopBtnTop');
// undo button (top toolkit)
const toolUndoBtnTop = document.getElementById('toolUndoBtnTop');

// loop state
let loopEnabled = false;
let _previewLoopRestartId = null;
// simple action history for undo (marker add/remove/move)
const actionHistory = [];
let dragSnapshotBefore = null;
// track active playback sources so we can stop them cleanly
let globalActiveSources = [];

// new 2026-01-10
function setStatus(msg) {
  if (statusText) statusText.textContent = msg;
}

// new 2026-01-10
function setRecordingUI(isRecording) {
  if (recordMicBtn) recordMicBtn.disabled = isRecording;
  if (recordScreenBtn) recordScreenBtn.disabled = isRecording;

  if (stopBtn) stopBtn.disabled = !isRecording;

  const hasAudio = !!recordedBlob;
  if (sliceBtn) sliceBtn.disabled = isRecording || !hasAudio;
  if (exportBtn) exportBtn.disabled = isRecording || !hasAudio;

  // new 2026-01-10
  if (applyModeBtn) applyModeBtn.disabled = isRecording || !hasAudio;
  if (previewBtn) previewBtn.disabled = isRecording || !hasAudio;
  if (exportMapBtn) exportMapBtn.disabled = isRecording || !hasAudio;
}

// new 2026-01-10
function stopAndCleanupStream() {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
}

// new 2026-01-10
function getSensitivity() {
  const v = sensitivityEl ? Number(sensitivityEl.value) : 0.25;
  return Number.isFinite(v) ? v : 0.25;
}

// new 2026-01-10
function updateSensitivityLabel() {
  if (sensValEl && sensitivityEl) sensValEl.textContent = Number(sensitivityEl.value).toFixed(2);
}

// new 2026-01-10
// ===== Recording =====

function pickMimeType() {
  const preferredTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4'
  ];
  for (const t of preferredTypes) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

// new 2026-01-10
function startRecorderWithStream(stream) {
  recordedChunks = [];
  recordedBlob = null;

  const chosenType = pickMimeType();
  mediaRecorder = chosenType ? new MediaRecorder(stream, { mimeType: chosenType }) : new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstart = () => {
    setStatus('🎙 Recording… (tap Stop when done)');
  };

  mediaRecorder.onstop = async () => {
    recordedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });

    stopAndCleanupStream();
    setRecordingUI(false);

    const kb = Math.round(recordedBlob.size / 1024);
    setStatus(`✅ Recorded (${kb} KB). Decoding…`);

    await decodeAndPrep(recordedBlob);

    setStatus(`✅ Ready. Auto Slice or drag markers.`);
  };

  mediaRecorder.start();
}

// new 2026-01-10
async function startMicRecording() {
  try {
    setStatus('Requesting microphone permission…');
    setRecordingUI(true);

    currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    startRecorderWithStream(currentStream);
  } catch (err) {
    console.error(err);
    stopAndCleanupStream();
    setRecordingUI(false);
    setStatus('❌ Mic recording failed. Check permissions and try again.');
  }
}

// new 2026-01-10
async function startScreenRecording() {
  const modal = document.getElementById('screenModal');
  if (!modal) {
    setStatus('❌ Modal not found in DOM.');
    return;
  }

  modal.classList.remove('hidden');
  // lock background scroll / interactions
  try { document.body.classList.add('modal-open'); } catch (e) {}

  // Bind modal handlers after modal is visible so elements exist and listeners attach reliably.
  // Use a short timeout to let the browser parse/paint the modal (very reliable).
  setTimeout(() => {
    try { bindScreenModalHandlers(); } catch (err) { console.warn('bindScreenModalHandlers failed', err); }
  }, 50);
}

// new 2026-01-10
async function confirmScreenRecording() {
  console.log('CONFIRM clicked'); // new 2026-01-10

  const modal = document.getElementById('screenModal');
  if (modal) modal.classList.add('hidden');
  try { document.body.classList.remove('modal-open'); } catch (e) {}

  try {
    setStatus('Requesting screen capture…');
    setRecordingUI(true);

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });

    currentStream = stream;
    startRecorderWithStream(stream);
  } catch (err) {
    console.error(err);
    setRecordingUI(false);
    setStatus('❌ Screen recording cancelled or failed.');
  }
}

// new 2026-01-10
function stopRecording() {
  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  } catch (err) {
    console.error(err);
    setStatus('❌ Stop failed. Try again.');
    setRecordingUI(false);
    stopAndCleanupStream();
  }
}

// new 2026-01-10
// ===== Decode + Waveform Prep =====

async function decodeAudio(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

// new 2026-01-10
async function decodeAndPrep(blob) {
  try {
    decodedBuffer = await decodeAudio(blob);
    slicePoints = []; // reset markers on new audio

    // Build waveform peaks for drawing
    waveformPeaks = buildPeaks(decodedBuffer, 1100);
    drawWaveform();
  } catch (e) {
    console.error(e);
    setStatus('❌ Could not decode audio. Try a different browser.');
  }
}

// new 2026-01-10
function buildPeaks(buffer, targetWidth) {
  const data = buffer.getChannelData(0);
  const len = data.length;
  const step = Math.max(1, Math.floor(len / targetWidth));

  const peaks = new Array(targetWidth).fill(0);
  for (let x = 0; x < targetWidth; x++) {
    const start = x * step;
    const end = Math.min(len, start + step);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
    peaks[x] = peak;
  }
  return peaks;
}

// new 2026-01-10
function clearCanvas() {
  if (!waveCtx || !waveCanvas) return;
  waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
}

// new 2026-01-10
function drawWaveform() {
  if (!waveCtx || !waveCanvas) return;

  clearCanvas();

  // Background
  waveCtx.fillStyle = '#070707';
  waveCtx.fillRect(0, 0, waveCanvas.width, waveCanvas.height);

  // Wave
  const mid = Math.floor(waveCanvas.height / 2);

  waveCtx.strokeStyle = '#e0e0e0';
  waveCtx.globalAlpha = 0.85;
  waveCtx.beginPath();

  const peaks = waveformPeaks || [];
  for (let x = 0; x < peaks.length; x++) {
    const p = peaks[x];
    const y = p * (mid - 8);
    waveCtx.moveTo(x, mid - y);
    waveCtx.lineTo(x, mid + y);
  }
  waveCtx.stroke();
  waveCtx.globalAlpha = 1;

  // Slice markers
  drawMarkers();

  // new 2026-01-10
  // Playback highlight: if a preview step is active, draw translucent overlay
  if (currentPreviewStepIndex !== -1 && decodedBuffer) {
    const w = waveCanvas.width;
    const h = waveCanvas.height;

    if (currentPreviewStepIndex === -2) {
      // full-sample fallback highlight
      waveCtx.fillStyle = 'rgba(11,218,143,0.06)';
      waveCtx.fillRect(0, 0, w, h);

      // brighten waveform across full range by redrawing peaks with a brighter stroke under a clip
      waveCtx.save();
      waveCtx.beginPath();
      waveCtx.rect(0, 0, w, h);
      waveCtx.clip();
      waveCtx.strokeStyle = '#7CFFB1';
      waveCtx.lineWidth = 1.6;
      waveCtx.globalAlpha = 0.9;
      waveCtx.beginPath();
      for (let x = 0; x < peaks.length; x++) {
        const p = peaks[x];
        const y = p * (mid - 8);
        waveCtx.moveTo(x, mid - y);
        waveCtx.lineTo(x, mid + y);
      }
      waveCtx.stroke();
      waveCtx.restore();
      waveCtx.globalAlpha = 1;
    } else if (patternMap && patternMap.steps && patternMap.steps[currentPreviewStepIndex]) {
      const st = patternMap.steps[currentPreviewStepIndex];
      if (st && st.startSample != null && st.endSample != null) {
        const x0 = sampleToX(st.startSample, waveCanvas.width);
        const x1 = sampleToX(st.endSample, waveCanvas.width);
        const wSeg = Math.max(2, x1 - x0);

        // translucent overlay for the active slice
        waveCtx.fillStyle = 'rgba(11,218,143,0.08)';
        waveCtx.fillRect(x0, 0, wSeg, h);

        // redraw brighter waveform clipped to that slice region
        waveCtx.save();
        waveCtx.beginPath();
        waveCtx.rect(x0, 0, wSeg, h);
        waveCtx.clip();
        waveCtx.strokeStyle = '#7CFFB1';
        waveCtx.lineWidth = 1.6;
        waveCtx.globalAlpha = 0.95;
        waveCtx.beginPath();
        for (let x = 0; x < peaks.length; x++) {
          const p = peaks[x];
          const y = p * (mid - 8);
          waveCtx.moveTo(x, mid - y);
          waveCtx.lineTo(x, mid + y);
        }
        waveCtx.stroke();
        waveCtx.restore();
        waveCtx.globalAlpha = 1;
      }
    }
  }

  // new 2026-01-10
  // Audition highlight: if a clicked slice is being auditioned, draw a brief highlight
  if (currentAuditionSliceIndex >= 0 && decodedBuffer) {
    const b = window._sliceBoundaries || [];
    const st = b[currentAuditionSliceIndex] != null ? { startSample: b[currentAuditionSliceIndex], endSample: b[currentAuditionSliceIndex + 1] ?? decodedBuffer.length } : null;
    if (st && st.startSample != null) {
      const x0 = sampleToX(st.startSample, waveCanvas.width);
      const x1 = sampleToX(st.endSample, waveCanvas.width);
      const wSeg = Math.max(2, x1 - x0);
      waveCtx.fillStyle = 'rgba(255,45,111,0.10)';
      waveCtx.fillRect(x0, 0, wSeg, waveCanvas.height);
    }
  }
}

// new 2026-01-10
function drawMarkers() {
  if (!waveCtx || !waveCanvas || !decodedBuffer) return;

  const w = waveCanvas.width;
  const h = waveCanvas.height;

  waveCtx.strokeStyle = '#0BDA8F'; // grungy green vibe
  waveCtx.lineWidth = 2;

  const sorted = [...slicePoints].sort((a, b) => a - b);

  for (const s of sorted) {
    const x = sampleToX(s, w);
    // new 2026-01-10
    // Determine the slice index associated with this marker (nearest boundary)
    const boundaries = window._sliceBoundaries || [];
    let sliceIdx = boundaries.indexOf(s);
    if (sliceIdx === -1) {
      // fallback: find nearest boundary index
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < boundaries.length; i++) {
        const d = Math.abs(boundaries[i] - s);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      sliceIdx = best;
    }

    const usedByMode = activeModeSliceSet && sliceIdx >= 0 && activeModeSliceSet.has(sliceIdx);

    // Visual style: used markers are thicker/brighter, unused are thinner/dimmer
    waveCtx.beginPath();
    waveCtx.lineWidth = usedByMode ? 3 : 1;
    waveCtx.strokeStyle = usedByMode ? '#0BDA8F' : '#4b4b4b';
    waveCtx.moveTo(x, 0);
    waveCtx.lineTo(x, h);
    waveCtx.stroke();
  }

  // Start/end guides (subtle)
  waveCtx.globalAlpha = 0.35;
  waveCtx.strokeStyle = '#3069CF';
  waveCtx.lineWidth = 1;

  waveCtx.beginPath();
  waveCtx.moveTo(0, 0);
  waveCtx.lineTo(0, h);
  waveCtx.stroke();

  waveCtx.beginPath();
  waveCtx.moveTo(w - 1, 0);
  waveCtx.lineTo(w - 1, h);
  waveCtx.stroke();

  waveCtx.globalAlpha = 1;
}

// new 2026-01-10
function sampleToX(sampleIdx, width) {
  if (!decodedBuffer) return 0;
  const t = sampleIdx / decodedBuffer.length;
  return Math.max(0, Math.min(width - 1, Math.floor(t * width)));
}

// new 2026-01-10
function xToSample(x, width) {
  if (!decodedBuffer) return 0;
  const t = x / width;
  return Math.max(0, Math.min(decodedBuffer.length - 1, Math.floor(t * decodedBuffer.length)));
}

// new 2026-01-10
function addSlicePoint(sampleIdx) {
  if (!decodedBuffer) return;
  const clamped = Math.max(0, Math.min(decodedBuffer.length - 1, sampleIdx));
  slicePoints.push(clamped);
  slicePoints = uniqSorted(slicePoints);
  try { buildSliceIndexListFromMarkers(); } catch (e) {}
  drawWaveform();
}

// new 2026-01-10
function removeSlicePointAtIndex(idx) {
  if (idx < 0 || idx >= slicePoints.length) return;
  slicePoints.splice(idx, 1);
  try { buildSliceIndexListFromMarkers(); } catch (e) {}
  drawWaveform();
}

// new 2026-01-10
// Helper: audition slice at a mouse event (uses existing playSliceByIndex)
function auditionSliceAtEvent(e) {
  // new 2026-01-10
  if (!decodedBuffer) return;
  const x = canvasX(e);
  const sample = xToSample(x, waveCanvas.width);

  const b = window._sliceBoundaries || [];
  if (!b || !b.length) return;

  let sliceIdx = -1;
  for (let i = 0; i < b.length; i++) {
    const start = b[i];
    const end = b[i + 1] ?? decodedBuffer.length;
    if (sample >= start && sample < end) { sliceIdx = i; break; }
  }
  if (sliceIdx >= 0) playSliceByIndex(sliceIdx);
}

// new 2026-01-10
// Helper: add slice at click event (for slice tool)
function addSliceAtEvent(e) {
  if (!decodedBuffer) return;
  const x = canvasX(e);
  const s = xToSample(x, waveCanvas.width);
  addSlicePoint(s);
  setStatus('➕ Marker added. Drag to adjust.');
  // record history for undo
  try { actionHistory.push({ type: 'add', sample: s }); updateUndoButtonState(); } catch (e) {}
}

// double-click to add a marker (convenience)
if (waveCanvas) {
  waveCanvas.addEventListener('dblclick', (e) => {
    if (!decodedBuffer) return;
    const x = canvasX(e);
    const s = xToSample(x, waveCanvas.width);
    addSlicePoint(s);
    // record history
    actionHistory.push({ type: 'add', sample: s });
    updateUndoButtonState();
    setStatus('➕ Marker added (dblclick).');
  });
}

// new 2026-01-10
// Helper: start dragging marker if click near one
function startDraggingMarker(e) {
  if (!decodedBuffer) return;
  const x = canvasX(e);
  const idx = findMarkerNearX(x);
  draggingIdx = idx;
  // capture a snapshot before the drag so we can record the move for undo
  try { dragSnapshotBefore = Array.isArray(slicePoints) ? [...slicePoints] : null; } catch (e) { dragSnapshotBefore = null; }
}

// new 2026-01-10
// Helper: delete marker at event (right-click)
function deleteMarkerAtEvent(e) {
  if (!decodedBuffer) return;
  const x = canvasX(e);
  const idx = findMarkerNearX(x);
  if (idx >= 0) {
    // record removal for undo
    try {
      const sample = slicePoints[idx];
      actionHistory.push({ type: 'remove', sample });
      updateUndoButtonState();
    } catch (err) {}
    removeSlicePointAtIndex(idx);
    setStatus('🗑 Marker removed.');
  }
}

// new 2026-01-10
// Stop any active audition (click-play) and clear visuals
function stopAudition() {
  try {
    if (_auditionSource) {
      try { _auditionSource.stop(); } catch (e) {}
      _auditionSource.disconnect();
      _auditionSource = null;
    }
  } catch (e) {}

  try {
    if (_auditionGain) {
      _auditionGain.disconnect();
      _auditionGain = null;
    }
  } catch (e) {}

  if (_auditionTimeout) { clearTimeout(_auditionTimeout); _auditionTimeout = null; }
  currentAuditionSliceIndex = -1;
  drawWaveform();
}

// new 2026-01-10
// Play a slice by its sliceIndex (based on window._sliceBoundaries). Adds a short fade in/out
function playSliceByIndex(sliceIndex) {
  // new 2026-01-10
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (!decodedBuffer) return;
  // Ensure nothing else is playing to avoid audio clashing
  try { stopAllPlayback(); } catch (e) {}
  const b = window._sliceBoundaries || [];
  if (!b || sliceIndex < 0 || sliceIndex >= b.length) return;

  // determine sample range
  const startSample = b[sliceIndex] ?? 0;
  const endSample = b[sliceIndex + 1] ?? decodedBuffer.length;
  if (endSample <= startSample) return;

  // stop previous audition if any
  stopAudition();

  const startSec = startSample / decodedBuffer.sampleRate;
  const durSec = Math.max(0.02, (endSample - startSample) / decodedBuffer.sampleRate);

  try {
    const src = audioCtx.createBufferSource();
    src.buffer = decodedBuffer;

    const g = audioCtx.createGain();
    // start near zero for fade-in
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);

    src.connect(g).connect(audioCtx.destination);

    // small fade in/out durations
    const fadeIn = 0.02; // 20ms
    const fadeOut = Math.min(0.12, durSec * 0.25); // up to 120ms or 25% of dur

    const now = audioCtx.currentTime;
    g.gain.linearRampToValueAtTime(0.9, now + fadeIn);
    const stopAt = now + 0.005 + durSec; // slight offset
    // schedule fade out
    g.gain.setValueAtTime(0.9, stopAt - fadeOut);
    g.gain.linearRampToValueAtTime(0.0001, stopAt);

    // start playback
    const startAt = now + 0.005;
    src.start(startAt, startSec, durSec);

    // set audition state
    _auditionSource = src;
    _auditionGain = g;
    // track this source globally so other actions can stop it
    try { globalActiveSources.push(src); } catch (e) {}
    currentAuditionSliceIndex = sliceIndex;
    drawWaveform();

    // cleanup when ended
    src.onended = () => {
      try { if (_auditionSource) { _auditionSource.disconnect(); _auditionSource = null; } } catch (e) {}
      try { if (_auditionGain) { _auditionGain.disconnect(); _auditionGain = null; } } catch (e) {}
      currentAuditionSliceIndex = -1;
      drawWaveform();
      if (_auditionTimeout) { clearTimeout(_auditionTimeout); _auditionTimeout = null; }
    };

    // safety timeout to clear state slightly after playback finishes
    _auditionTimeout = setTimeout(() => {
      try { if (_auditionSource) { _auditionSource.disconnect(); _auditionSource = null; } } catch (e) {}
      try { if (_auditionGain) { _auditionGain.disconnect(); _auditionGain = null; } } catch (e) {}
      currentAuditionSliceIndex = -1;
      drawWaveform();
      _auditionTimeout = null;
    }, Math.ceil(durSec * 1000) + 200);

  } catch (err) {
    console.error('playSliceByIndex failed', err);
    stopAudition();
  }
}

// new 2026-01-10
function uniqSorted(arr) {
  return [...new Set(arr)].sort((a, b) => a - b);
}

// new 2026-01-10
// ===== Auto Slice =====

function detectTransients(buffer, threshold = 0.25) {
  const channelData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;

  const points = [];
  let lastPeak = 0;

  // min gap between slices (seconds)
  const minGap = sampleRate * 0.12; // tighter than before for beat chops

  for (let i = 0; i < channelData.length; i++) {
    const amp = Math.abs(channelData[i]);
    if (amp > threshold && (i - lastPeak) > minGap) {
      points.push(i);
      lastPeak = i;
    }
  }
  return points;
}

// new 2026-01-10
async function autoSliceAudio() {
  if (!decodedBuffer) {
    setStatus('❌ No decoded audio. Record first.');
    return;
  }

  const threshold = getSensitivity();
  setStatus(`✂️ Slicing… (threshold ${threshold.toFixed(2)})`);

  try {
    const points = detectTransients(decodedBuffer, threshold);
    if (!points.length) {
      setStatus('⚠️ No strong transients found. Raise volume or lower threshold.');
      return;
    }

    slicePoints = uniqSorted(points);
    drawWaveform();

    setStatus(`✂️ Found ${slicePoints.length} slices. Drag markers or Export.`);
  } catch (err) {
    console.error(err);
    setStatus('❌ Slice failed.');
  }
}

// new 2026-01-10
// ===== WAV + Export =====

function bufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);

  let offset = 0;

  function writeString(s) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  }

  writeString('RIFF');
  view.setUint32(offset, length - 8, true); offset += 4;
  writeString('WAVE');
  writeString('fmt ');
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, numOfChan, true); offset += 2;
  view.setUint32(offset, buffer.sampleRate, true); offset += 4;
  view.setUint32(offset, buffer.sampleRate * 2 * numOfChan, true); offset += 4;
  view.setUint16(offset, numOfChan * 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString('data');
  view.setUint32(offset, length - offset - 4, true); offset += 4;

  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numOfChan; c++) {
      const sample = buffer.getChannelData(c)[i];
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

// new 2026-01-10
function sliceBufferBySamples(buffer, start, end) {
  const length = Math.max(0, end - start);
  const sliceBuf = audioCtx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c).slice(start, end);
    sliceBuf.copyToChannel(data, c);
  }

  return sliceBuf;
}

// new 2026-01-10
async function exportSlices() {
  if (!decodedBuffer) {
    setStatus('❌ Nothing to export. Record first.');
    return;
  }

  const points = uniqSorted(slicePoints);

  // If user never hit Auto Slice and never added markers, we can export whole sample as 1 file
  const exportPoints = points.length ? points : [0];

  setStatus('⬇️ Exporting…');

  try {
    // ZIP export removed: always export as individual WAV files

    // Non-ZIP: download each WAV
    for (let i = 0; i < exportPoints.length; i++) {
      const start = exportPoints[i];
      const end = exportPoints[i + 1] || decodedBuffer.length;

      const sliceBuf = sliceBufferBySamples(decodedBuffer, start, end);
      const wavBlob = bufferToWav(sliceBuf);

      const fileName = `choprot_slice_${String(i + 1).padStart(2, '0')}.wav`;
      triggerDownload(wavBlob, fileName);
    }

    setStatus(`✅ Exported ${exportPoints.length} WAV files.`);
  } catch (err) {
    console.error(err);
    setStatus('❌ Export failed.');
  }
}

// new 2026-01-10
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// new 2026-01-10
// ===== Marker Interactions (drag + dblclick add) =====

function findMarkerNearX(x, pxTolerance = 8) {
  if (!decodedBuffer) return -1;

  const w = waveCanvas.width;
  const sample = xToSample(x, w);

  // Find closest marker by x distance in pixels
  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = 0; i < slicePoints.length; i++) {
    const mx = sampleToX(slicePoints[i], w);
    const dist = Math.abs(mx - x);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return (bestDist <= pxTolerance) ? bestIdx : -1;
}

// new 2026-01-10
function canvasX(evt) {
  const rect = waveCanvas.getBoundingClientRect();
  return Math.floor((evt.clientX - rect.left) * (waveCanvas.width / rect.width));
}

// new 2026-01-10
function bindCanvasEvents() {
  if (!waveCanvas) return;
  // new 2026-01-10
  // Behavior depends on `activeTool`:
  // - 'play': click auditions slices only
  // - 'slice': click adds marker, mousedown+drag moves marker, right-click deletes

  // mousedown: begin dragging in slice tool OR if marker is used by current mode
  waveCanvas.addEventListener('mousedown', (e) => {
    if (!decodedBuffer) return;

    // detect nearest marker
    const x = canvasX(e);
    const idx = findMarkerNearX(x);
    if (idx < 0) return;

    // determine corresponding slice index in global boundaries
    const boundaries = window._sliceBoundaries || [];
    const markerSample = slicePoints[idx];
    const sliceIdx = boundaries.indexOf(markerSample);

    // allow dragging if user is in Slice tool, or marker is part of active mode
    if (activeTool === 'slice' || (sliceIdx >= 0 && activeModeSliceSet && activeModeSliceSet.has(sliceIdx))) {
      startDraggingMarker(e);
    }
  });

  // mousemove: if dragging a marker (slice tool), move it
  window.addEventListener('mousemove', (e) => {
    if (!decodedBuffer) return;
    if (draggingIdx < 0) return;
    // dragging was permitted at mousedown; continue handling movement regardless of activeTool

    const rect = waveCanvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (waveCanvas.width / rect.width));
    const s = xToSample(Math.max(0, Math.min(waveCanvas.width - 1, x)), waveCanvas.width);

    // keep markers away from extreme edges just a bit
    slicePoints[draggingIdx] = Math.max(0, Math.min(decodedBuffer.length - 1, s));
    slicePoints = uniqSorted(slicePoints);
    drawWaveform();
  });

  // mouseup: stop dragging
  window.addEventListener('mouseup', () => {
    // if a drag occurred and the slicePoints changed vs snapshot, record move in history
    try {
      if (dragSnapshotBefore && JSON.stringify(dragSnapshotBefore) !== JSON.stringify(slicePoints)) {
        actionHistory.push({ type: 'move', before: dragSnapshotBefore, after: [...slicePoints] });
        updateUndoButtonState();
      }
    } catch (e) {}
    draggingIdx = -1;
    dragSnapshotBefore = null;
  });

  // click: tool-dependent action
  waveCanvas.addEventListener('click', (e) => {
    if (!decodedBuffer) return;
    if (activeTool === 'play') {
      // audition
      auditionSliceAtEvent(e);
    } else if (activeTool === 'slice') {
      // add a marker at the click position
      addSliceAtEvent(e);
    }
  });

  // Right-click marker to delete (context menu) — only in slice tool
  // Right-click marker to delete (context menu) — allow in both Slice and Play tools
  waveCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!decodedBuffer) return;
    // only delete if user clicked near an existing marker
    const x = canvasX(e);
    const idx = findMarkerNearX(x);
    if (idx < 0) return;
    // Allow delete regardless of active tool (Play users can quickly remove markers)
    deleteMarkerAtEvent(e);
  });
}


// new 2026-01-10
// =======================
// CHOP MODES (Genre/Area)
// =======================

// new 2026-01-10
const CHOP_MODES = {
  none: {
    label: 'None (manual)',
    hint: 'Manual markers only.'
  },

  south: {
    label: 'South',
    hint: 'Space + bounce: fewer chops, more repeat, longer gaps.',
    density: 0.35,     // fewer unique slices used
    repeatBias: 0.80,  // strong repetition
    gapChance: 0.28,   // rests
    stepBeats: 1,      // 1 beat per step
    bars: 2            // preview length in bars
  },

  boombap: {
    label: 'Boom Bap',
    hint: 'Punchy call/response: moderate chops + structured feel.',
    density: 0.55,
    repeatBias: 0.55,
    gapChance: 0.15,
    stepBeats: 1,
    bars: 2
  },

  lofi: {
    label: 'Lo-Fi',
    hint: 'Drift + micro variation: more chops, occasional doubles.',
    density: 0.70,
    repeatBias: 0.40,
    gapChance: 0.10,
    stepBeats: 1,
    bars: 2,
    jitter: 0.04 // timing humanization (seconds-ish scaled)
  },

  trap: {
    label: 'Trap',
    hint: 'Sparse texture chops: fewer hits, longer air.',
    density: 0.30,
    repeatBias: 0.65,
    gapChance: 0.40,
    stepBeats: 2, // slower chops (2 beats)
    bars: 2
  },

  detroit: {
    label: 'Detroit',
    hint: 'Tight + repetitive: short loop, rapid repeats.',
    density: 0.40,
    repeatBias: 0.90,
    gapChance: 0.08,
    stepBeats: 1,
    bars: 1
  },

  drill: {
    label: 'Drill',
    hint: 'Dark + staggered: uneven feel, gaps + surprises.',
    density: 0.50,
    repeatBias: 0.60,
    gapChance: 0.25,
    stepBeats: 1,
    bars: 2,
    stagger: true
  }
};

// new 2026-01-10
function updateModeHint() {
  const key = chopModeEl ? chopModeEl.value : 'none';
  const m = CHOP_MODES[key] || CHOP_MODES.none;
  if (modeHintEl) modeHintEl.textContent = m.hint || '';
}

// new 2026-01-10
function getBpm() {
  const bpm = bpmEl ? Number(bpmEl.value) : 92;
  return Number.isFinite(bpm) ? bpm : 92;
}

// new 2026-01-10
function updateBpmLabel() {
  if (bpmValEl && bpmEl) bpmValEl.textContent = String(bpmEl.value);
}

// new 2026-01-10
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// new 2026-01-10
function pickSubset(arr, fraction) {
  const copy = [...arr];
  copy.sort(() => Math.random() - 0.5);
  const take = Math.max(1, Math.floor(copy.length * fraction));
  return copy.slice(0, take);
}

// new 2026-01-10
function weightedPick(arr, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

// new 2026-01-10
// Build a pattern using slice indices (not audio yet)
function generatePatternFromSlices(sliceIdxList, modeKey) {
  const mode = CHOP_MODES[modeKey] || CHOP_MODES.none;

  if (modeKey === 'none') {
    return {
      modeKey,
      steps: sliceIdxList.map(i => ({ sliceIndex: i, beats: 1 }))
    };
  }

  const bpm = getBpm();
  const bars = mode.bars || 2;
  const beatsPerBar = 4;
  const totalBeats = bars * beatsPerBar;
  const stepBeats = mode.stepBeats || 1;
  const stepsCount = Math.max(1, Math.floor(totalBeats / stepBeats));

  // choose fewer/more unique slices based on density
  const core = pickSubset(sliceIdxList, mode.density || 0.5);

  // build weights to encourage repetition (repeatBias)
  const weights = core.map((_, idx) => {
    const base = 1;
    const rep = (mode.repeatBias || 0.5) * (idx === 0 ? 1.7 : 1.0);
    return base + rep;
  });

  const steps = [];
  let last = null;

  for (let s = 0; s < stepsCount; s++) {
    const doGap = Math.random() < (mode.gapChance || 0);
    if (doGap) {
      steps.push({ sliceIndex: null, beats: stepBeats }); // rest
      continue;
    }

    // Sometimes repeat the last slice hard (Detroit/South)
    const forceRepeat = last !== null && Math.random() < (mode.repeatBias || 0.5);
    const pick = forceRepeat ? last : weightedPick(core, weights);

    steps.push({ sliceIndex: pick, beats: stepBeats });
    last = pick;

    // Drill stagger: occasional quick extra hit
    if (mode.stagger && Math.random() < 0.22) {
      steps.push({ sliceIndex: pick, beats: 0.5 });
    }
  }

  return { modeKey, bpm, steps };
}

// new 2026-01-10
// ===== Wire UI =====

// new 2026-01-10
function buildSliceIndexListFromMarkers() {
  if (!decodedBuffer) return [];

  // if user didn’t add markers, use auto slice points if available
  const points = (slicePoints && slicePoints.length) ? [...slicePoints] : [];

  // Always include start 0 to form segments cleanly
  if (!points.includes(0)) points.unshift(0);

  const sorted = [...new Set(points)].sort((a, b) => a - b);

  // Convert segment boundaries into slice indices (0..N-1)
  // Segment i is [sorted[i], sorted[i+1]) for i < last, and last is [sorted[last], end)
  const sliceIdxList = [];
  for (let i = 0; i < sorted.length; i++) sliceIdxList.push(i);

  // Store boundaries globally so we can map sliceIndex -> samples
  window._sliceBoundaries = sorted;

  return sliceIdxList;
}

// new 2026-01-10
function sliceIndexToSampleRange(sliceIndex) {
  const b = window._sliceBoundaries || [];
  if (!decodedBuffer || !b.length) return { start: 0, end: decodedBuffer.length };

  const start = b[sliceIndex] ?? 0;
  const end = b[sliceIndex + 1] ?? decodedBuffer.length;
  return { start, end };
}

// new 2026-01-10
function applyChopMode() {
  if (!decodedBuffer) {
    setStatus('❌ Record audio first.');
    return;
  }

  // snapshot current state so user can revert (include UI control values)
  _prevModeSnapshot = {
    slicePoints: Array.isArray(slicePoints) ? [...slicePoints] : [],
    patternMap: patternMap,
    activeModeKey: activeModeKey,
    chopModeValue: (chopModeEl && chopModeEl.value) ? chopModeEl.value : activeModeKey,
    bpmValue: (bpmEl && typeof bpmEl.value !== 'undefined') ? bpmEl.value : (getBpm()),
    sensitivityValue: (sensitivityEl && typeof sensitivityEl.value !== 'undefined') ? sensitivityEl.value : (getSensitivity())
  };
  if (revertModeBtn) revertModeBtn.disabled = false;

  const modeKey = chopModeEl ? chopModeEl.value : 'none';
  activeModeKey = modeKey;

  // build slice index list based on markers (or start-only fallback)
  const sliceIdxList = buildSliceIndexListFromMarkers();
  if (!sliceIdxList.length) {
    setStatus('❌ No slices available.');
    return;
  }

  // generate pattern
  const pattern = generatePatternFromSlices(sliceIdxList, modeKey);

  // Convert pattern steps -> sample ranges
  patternMap = {
    app: 'CHOPROT',
    version: '2026-01-10',
    modeKey,
    modeLabel: (CHOP_MODES[modeKey] || CHOP_MODES.none).label,
    bpm: getBpm(),
    steps: pattern.steps.map((st, idx) => {
      if (st.sliceIndex === null) {
        return { step: idx + 1, sliceIndex: null, startSample: null, endSample: null, beats: st.beats };
      }
      const r = sliceIndexToSampleRange(st.sliceIndex);
      return { step: idx + 1, sliceIndex: st.sliceIndex, startSample: r.start, endSample: r.end, beats: st.beats };
    })
  };

  // new 2026-01-10
  // derive the set of slice indices actually used by this mode
  try {
    activeModeSliceSet = new Set((patternMap.steps || [])
      .filter(st => st && typeof st.sliceIndex === 'number')
      .map(st => st.sliceIndex));
  } catch (e) {
    activeModeSliceSet = new Set();
  }

  // Visual: set markers to the boundaries used (already are), and repaint
  drawWaveform();

  setStatus(`🧬 Mode applied: ${(CHOP_MODES[modeKey] || CHOP_MODES.none).label}. Preview or Export Map.`);
}

// new 2026-01-10
let _previewStop = null;

function stopPreview() {
  if (_previewStop) {
    _previewStop();
    _previewStop = null;
  }
  if (_previewLoopRestartId) {
    clearTimeout(_previewLoopRestartId);
    _previewLoopRestartId = null;
  }
}

// Stop any audition/preview/active sources immediately
function stopAllPlayback() {
  try { stopAudition(); } catch (e) {}
  try { stopPreview(); } catch (e) {}

  // stop any global active sources not already handled
  try {
    globalActiveSources.forEach(s => {
      try { s.stop(); } catch (e) {}
      try { s.disconnect(); } catch (e) {}
    });
  } catch (e) {}
  globalActiveSources = [];
  // clear any preview timeouts
  try { _previewTimeouts.forEach(id => clearTimeout(id)); } catch (e) {}
  _previewTimeouts = [];
  if (_previewLoopRestartId) { clearTimeout(_previewLoopRestartId); _previewLoopRestartId = null; }
  setStatus('■ Playback stopped.');
}

// new 2026-01-10
function previewPattern() {
  // new 2026-01-10
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (!decodedBuffer) {
    setStatus('❌ Record audio first.');
    return;
  }

  stopPreview();

  // If no pattern applied yet, fall back to playing the full decoded sample once.
  if (!patternMap || !patternMap.steps || !patternMap.steps.length) {
    try {
      // ensure we stop anything else first to avoid stacking audio
      try { stopAllPlayback(); } catch (e) {}

      const src = audioCtx.createBufferSource();
      src.buffer = decodedBuffer;

      const g = audioCtx.createGain();
      g.gain.value = 0.95;

      src.connect(g).connect(audioCtx.destination);

      // if loop enabled, loop the buffer
      if (loopEnabled) src.loop = true;

      // start with a tiny lead-in for scheduling consistency
      const startAt = audioCtx.currentTime + 0.05;
      src.start(startAt);

      // track globally so stopAllPlayback can stop it
      globalActiveSources.push(src);

      const activeSources = [src];
      // new 2026-01-10
      // Mark UI as full-sample preview and schedule clearing when it ends
      currentPreviewStepIndex = -2;
      drawWaveform();

      _previewStop = () => {
        activeSources.forEach(s => { try { s.stop(); } catch (e) {} });
        // also clear from global list any sources we stopped
        try {
          globalActiveSources = globalActiveSources.filter(s => !activeSources.includes(s));
        } catch (e) {}
        _previewTimeouts.forEach(id => clearTimeout(id));
        _previewTimeouts = [];
        currentPreviewStepIndex = -1;
        drawWaveform();
      };

      // schedule UI clear when buffer ends (only if not looping)
      try {
        if (!loopEnabled) {
          const durMs = (src.buffer && src.buffer.duration ? src.buffer.duration * 1000 : 0);
          const clearId = setTimeout(() => {
            currentPreviewStepIndex = -1;
            _previewTimeouts = _previewTimeouts.filter(i => i !== clearId);
            drawWaveform();
          }, durMs + 60);
          _previewTimeouts.push(clearId);
        }
      } catch (e) {}

      setStatus('▶ Previewing (full sample)');
      return;
    } catch (err) {
      console.error('Preview fallback failed', err);
      setStatus('❌ Preview failed.');
      return;
    }
  }

  const bpm = getBpm();
  const beatSec = 60 / bpm;

  let t = audioCtx.currentTime + 0.05; // slight lead-in

  // optional humanization for lofi
  const mode = CHOP_MODES[activeModeKey] || CHOP_MODES.none;
  const jitter = mode.jitter ? mode.jitter : 0;

  const activeSources = [];

  for (const st of patternMap.steps) {
    const durSec = (st.beats || 1) * beatSec;

    if (st.sliceIndex !== null && st.startSample !== null) {
      const startSec = st.startSample / decodedBuffer.sampleRate;
      const endSec = st.endSample / decodedBuffer.sampleRate;
      const sliceDur = Math.max(0.02, endSec - startSec);

      const src = audioCtx.createBufferSource();
      src.buffer = decodedBuffer;

      const g = audioCtx.createGain();
      g.gain.value = 0.9;

      src.connect(g).connect(audioCtx.destination);

      const jt = jitter ? ((Math.random() * 2 - 1) * jitter) : 0;
      const playAt = Math.max(audioCtx.currentTime, t + jt);

      // play only as long as the beat step (or slice duration, whichever is smaller)
      const playLen = Math.max(0.02, Math.min(durSec, sliceDur));

      src.start(playAt, startSec, playLen);
      activeSources.push(src);
      // track globally so stopAllPlayback can stop any pattern sources
      try { globalActiveSources.push(src); } catch (e) {}
      // new 2026-01-10
      // schedule a UI update for this step so we can highlight the playing slice in real time
      try {
        const stepIndex = patternMap.steps.indexOf(st);
        const delay = Math.max(0, (playAt - audioCtx.currentTime) * 1000);
        const id = setTimeout(() => {
          currentPreviewStepIndex = stepIndex;
          drawWaveform();
        }, delay);
        _previewTimeouts.push(id);
      } catch (e) { /* non-fatal */ }
    }

    t += durSec;
  }

  _previewStop = () => {
    activeSources.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    // clear any UI timeouts and reset preview visual state
    try {
      // remove stopped sources from globalActiveSources
      globalActiveSources = globalActiveSources.filter(s => !activeSources.includes(s));
    } catch (e) {}
    _previewTimeouts.forEach(id => clearTimeout(id));
    _previewTimeouts = [];
    currentPreviewStepIndex = -1;
    drawWaveform();
  };

  setStatus(`▶ Previewing (${(CHOP_MODES[activeModeKey] || CHOP_MODES.none).label}) @ ${bpm} BPM`);
  // new 2026-01-10
  // schedule final clear of the preview UI state when pattern finishes
  try {
    const clearDelay = Math.max(0, (t - audioCtx.currentTime) * 1000);
    const clearId = setTimeout(() => {
      currentPreviewStepIndex = -1;
      _previewTimeouts = _previewTimeouts.filter(i => i !== clearId);
      drawWaveform();
    }, clearDelay);
    _previewTimeouts.push(clearId);
    // if looping is enabled, schedule a restart after the pattern finishes
    if (loopEnabled) {
      try {
        _previewLoopRestartId = setTimeout(() => {
          _previewLoopRestartId = null;
          try { previewPattern(); } catch (e) { /* ignore */ }
        }, clearDelay + 40);
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
}

// new 2026-01-10
function exportPatternMapJson() {
  if (!patternMap) {
    setStatus('❌ No pattern map. Apply a mode first.');
    return;
  }

  const blob = new Blob([JSON.stringify(patternMap, null, 2)], { type: 'application/json' });
  triggerDownload(blob, 'choprot_pattern_map.json');

  setStatus('🗺 Exported pattern map JSON.');
}

// new 2026-01-10
function resetProject() {
  // Stop any ongoing recording
  stopRecording();
  stopAndCleanupStream();

  // Stop any preview
  stopPreview();

  // Clear all data
  mediaRecorder = null;
  recordedChunks = [];
  recordedBlob = null;
  currentStream = null;
  decodedBuffer = null;
  slicePoints = [];
  waveformPeaks = [];
  draggingIdx = -1;
  patternMap = null;
  activeModeKey = 'none';

  // Reset UI
  setRecordingUI(false);
  clearCanvas();
  drawWaveform();

  // Reset controls to defaults
  if (sensitivityEl) sensitivityEl.value = 0.25;
  updateSensitivityLabel();

  if (bpmEl) bpmEl.value = 92;
  updateBpmLabel();

  if (chopModeEl) chopModeEl.value = 'none';
  updateModeHint();

  // Hide advanced panel if open
  if (advancedPanel) advancedPanel.classList.add('hidden');
  if (advancedToggleBtn) advancedToggleBtn.textContent = '⚙ Advanced';

  // Hide any open modals
  const modals = ['introModal', 'micModal', 'screenModal'];
  modals.forEach(id => {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
  });
  try { document.body.classList.remove('modal-open'); } catch (e) {}

  // new 2026-01-10
  // clear visualization state
  activeModeSliceSet.clear();
  currentPreviewStepIndex = -1;
  _previewTimeouts.forEach(id => clearTimeout(id));
  _previewTimeouts = [];

  // Show intro modal (original state)
  showIntroModal();

  setStatus('Ready. Record something nasty.');
}

if (recordMicBtn) recordMicBtn.addEventListener('click', (e) => {
  e.preventDefault();
  // show confirmation modal before starting mic recording
  const micModal = document.getElementById('micModal');
  if (!micModal) {
    // fallback: start immediately
    startMicRecording();
    return;
  }

  micModal.classList.remove('hidden');
  try { document.body.classList.add('modal-open'); } catch (err) {}

  // bind handlers after showing
  setTimeout(() => {
    try { bindMicModalHandlers(); } catch (err) { console.warn('bindMicModalHandlers failed', err); }
  }, 50);
});
if (recordScreenBtn) recordScreenBtn.addEventListener('click', startScreenRecording);
if (stopBtn) stopBtn.addEventListener('click', stopRecording);
if (sliceBtn) sliceBtn.addEventListener('click', autoSliceAudio);
if (exportBtn) exportBtn.addEventListener('click', exportSlices);

if (sensitivityEl) {
  sensitivityEl.addEventListener('input', () => {
    updateSensitivityLabel();
    if (decodedBuffer) {
      setStatus(`✂️ Sensitivity set to ${getSensitivity().toFixed(2)} (lower = more slices).`);
    }
  });
}

// new 2026-01-10
// Bind modal buttons dynamically when the modal is shown (prevents race when script runs
// before modal HTML is parsed). Safe to call multiple times.
function bindScreenModalHandlers() {
  const continueBtn = document.getElementById('screenContinueBtn');
  const cancelBtn = document.getElementById('screenCancelBtn');
  const modal = document.getElementById('screenModal');

  if (!continueBtn || !cancelBtn || !modal) {
    console.warn('[ScreenModal] Buttons/modal not found yet — skipping bind');
    return false;
  }

  // Remove old listeners by replacing the node (simple and robust)
  const newContinue = continueBtn.cloneNode(true);
  continueBtn.parentNode.replaceChild(newContinue, continueBtn);

  // re-acquire after clone
  const boundContinue = document.getElementById('screenContinueBtn');

  boundContinue.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('[DEBUG] CONTINUE clicked!');

    if (modal) modal.classList.add('hidden');
    try { document.body.classList.remove('modal-open'); } catch (e) {}

    try {
      setStatus('Requesting screen capture…');
      setRecordingUI(true);

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      console.log('[DEBUG] Screen stream acquired', stream);
      currentStream = stream;
      startRecorderWithStream(stream);
    } catch (err) {
      console.error('[DEBUG] getDisplayMedia failed:', err && err.name, err && err.message);
      setRecordingUI(false);
      setStatus('❌ Screen recording cancelled or failed.');
    }
  });

  // cancel button — ensure only one listener
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  const boundCancel = document.getElementById('screenCancelBtn');
  boundCancel.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('[DEBUG] CANCEL clicked');
    if (modal) modal.classList.add('hidden');
    try { document.body.classList.remove('modal-open'); } catch (e) {}
    setStatus('Screen recording cancelled.');
  });

  console.log('[ScreenModal] Buttons successfully bound!');
  return true;
}

// new 2026-01-10
// MIC CONFIRM modal binding
function bindMicModalHandlers() {
  const yes = document.getElementById('micYesBtn');
  const no = document.getElementById('micNoBtn');
  const modal = document.getElementById('micModal');

  if (!yes || !no || !modal) {
    console.warn('[MicModal] Elements not found — skipping');
    return false;
  }

  // remove old listeners by cloning
  const newYes = yes.cloneNode(true);
  yes.parentNode.replaceChild(newYes, yes);
  const boundYes = document.getElementById('micYesBtn');
  boundYes.addEventListener('click', (e) => {
    e.preventDefault();
    if (modal) modal.classList.add('hidden');
    try { document.body.classList.remove('modal-open'); } catch (err) {}
    startMicRecording();
  });

  no.replaceWith(no.cloneNode(true));
  const boundNo = document.getElementById('micNoBtn');
  boundNo.addEventListener('click', (e) => {
    e.preventDefault();
    if (modal) modal.classList.add('hidden');
    try { document.body.classList.remove('modal-open'); } catch (err) {}
    setStatus('Take your time. When you\'re ready — chop.');
  });

  console.log('[MicModal] bound');
  return true;
}

// new 2026-01-10
if (chopModeEl) {
  chopModeEl.addEventListener('change', () => {
    updateModeHint();
    activeModeKey = chopModeEl.value;
    setStatus(`🧬 Mode selected: ${(CHOP_MODES[activeModeKey] || CHOP_MODES.none).label}`);
  });
}

if (applyModeBtn) applyModeBtn.addEventListener('click', applyChopMode);
if (previewBtn) previewBtn.addEventListener('click', previewPattern);
if (exportMapBtn) exportMapBtn.addEventListener('click', exportPatternMapJson);

// new 2026-01-10
function setActiveTool(t) {
  activeTool = t === 'slice' ? 'slice' : 'play';
  if (toolPlayBtn) toolPlayBtn.classList.toggle('active', activeTool === 'play');
  if (toolSliceBtn) toolSliceBtn.classList.toggle('active', activeTool === 'slice');
  // new 2026-01-10
  // sync top toolkit buttons if present
  if (toolPlayBtnTop) toolPlayBtnTop.classList.toggle('active', activeTool === 'play');
  if (toolSliceBtnTop) toolSliceBtnTop.classList.toggle('active', activeTool === 'slice');
  // sync mini toolkit buttons
  try {
    const mPlay = document.getElementById('miniToolPlay');
    const mSlice = document.getElementById('miniToolSlice');
    if (mPlay) mPlay.classList.toggle('active', activeTool === 'play');
    if (mSlice) mSlice.classList.toggle('active', activeTool === 'slice');
  } catch (e) {}
  // new 2026-01-10
  // update canvas class so CSS can change cursor appropriately
  try {
    if (waveCanvas) {
      waveCanvas.classList.toggle('tool-play', activeTool === 'play');
      waveCanvas.classList.toggle('tool-slice', activeTool === 'slice');
    }
  } catch (e) { /* non-fatal */ }
  setStatus(activeTool === 'play' ? 'Tool: Play (click to audition slices)' : 'Tool: Slice (click to add, drag to move)');
}

// new 2026-01-10
// Only wire the top-right toolkit buttons (outer buttons removed from DOM)
if (toolPlayBtnTop) toolPlayBtnTop.addEventListener('click', (e) => { e.preventDefault(); setActiveTool('play'); });
if (toolSliceBtnTop) toolSliceBtnTop.addEventListener('click', (e) => { e.preventDefault(); setActiveTool('slice'); });
// loop toggle wiring
if (toolLoopBtnTop) {
  toolLoopBtnTop.addEventListener('click', (e) => {
    e.preventDefault();
    loopEnabled = !loopEnabled;
    toolLoopBtnTop.classList.toggle('active', loopEnabled);
    setStatus(loopEnabled ? 'Loop: ON' : 'Loop: OFF');

    // if enabling loop while a preview is active, restart preview to adopt looping behavior
    if (loopEnabled && _previewStop) {
      stopPreview();
      // small delay to ensure stop finishes
      setTimeout(() => { try { previewPattern(); } catch (e) {} }, 80);
    }
    if (!loopEnabled && _previewLoopRestartId) {
      clearTimeout(_previewLoopRestartId);
      _previewLoopRestartId = null;
    }
    // update mini toolkit loop button if present
    try { syncMiniLoopButton(); } catch (e) {}
  });
}
// If a mini toolkit exists, keep its loop button in sync
function syncMiniLoopButton() {
  try {
    const mLoop = document.getElementById('miniToolLoop');
    if (mLoop) mLoop.classList.toggle('active', loopEnabled);
  } catch (e) {}
}

// Undo support
function updateUndoButtonState() {
  try {
    if (toolUndoBtnTop) toolUndoBtnTop.disabled = actionHistory.length === 0;
    // sync mini toolkit undo button state
    try {
      const mUndo = document.getElementById('miniToolUndo');
      if (mUndo) mUndo.disabled = actionHistory.length === 0;
    } catch (e) {}
  } catch (e) {}
}

function undoLastAction() {
  if (!actionHistory || !actionHistory.length) return;
  const act = actionHistory.pop();
  try {
    if (act.type === 'add') {
      // remove the added sample
      const idx = slicePoints.indexOf(act.sample);
      if (idx === -1) {
        // try nearest
        let best = -1; let bestDist = Infinity;
        for (let i = 0; i < slicePoints.length; i++) {
          const d = Math.abs(slicePoints[i] - act.sample);
          if (d < bestDist) { bestDist = d; best = i; }
        }
        if (best >= 0) removeSlicePointAtIndex(best);
      } else {
        removeSlicePointAtIndex(idx);
      }
    } else if (act.type === 'remove') {
      // restore removed sample
      addSlicePoint(act.sample);
    } else if (act.type === 'move') {
      // restore before snapshot
      slicePoints = Array.isArray(act.before) ? [...act.before] : [];
      slicePoints = uniqSorted(slicePoints);
      try { buildSliceIndexListFromMarkers(); } catch (e) {}
      drawWaveform();
    }
  } catch (e) {
    console.warn('Undo failed', e);
  }
  updateUndoButtonState();
}

if (toolUndoBtnTop) {
  toolUndoBtnTop.addEventListener('click', (e) => { e.preventDefault(); undoLastAction(); });
}

// ensure undo button reflects initial state
updateUndoButtonState();

// ensure initial UI state
setActiveTool(activeTool);

if (revertModeBtn) revertModeBtn.addEventListener('click', revertMode);

function revertMode() {
  if (!_prevModeSnapshot) {
    setStatus('⚠️ Nothing to revert.');
    return;
  }

  // restore markers, pattern, and active mode
  slicePoints = Array.isArray(_prevModeSnapshot.slicePoints) ? [..._prevModeSnapshot.slicePoints] : [];
  patternMap = _prevModeSnapshot.patternMap || null;
  activeModeKey = _prevModeSnapshot.activeModeKey || 'none';

  // restore UI control values (dropdowns/sliders)
  try {
    if (chopModeEl && typeof _prevModeSnapshot.chopModeValue !== 'undefined') {
      chopModeEl.value = _prevModeSnapshot.chopModeValue || 'none';
    }
    if (bpmEl && typeof _prevModeSnapshot.bpmValue !== 'undefined') {
      bpmEl.value = _prevModeSnapshot.bpmValue;
      updateBpmLabel();
    }
    if (sensitivityEl && typeof _prevModeSnapshot.sensitivityValue !== 'undefined') {
      sensitivityEl.value = _prevModeSnapshot.sensitivityValue;
      updateSensitivityLabel();
    }
  } catch (e) {
    console.warn('Revert: failed to restore some UI values', e);
  }

  // clear snapshot and update UI
  _prevModeSnapshot = null;
  if (revertModeBtn) revertModeBtn.disabled = true;

  // rebuild global boundaries from restored markers and redraw
  try {
    buildSliceIndexListFromMarkers();
  } catch (e) { /* non-fatal */ }

  drawWaveform();
  updateModeHint();
  setStatus('↶ Reverted to previous state.');
  // new 2026-01-10
  // restore visualization set for the reverted pattern
  try {
    if (patternMap && patternMap.steps) {
      activeModeSliceSet = new Set((patternMap.steps || [])
        .filter(st => st && typeof st.sliceIndex === 'number')
        .map(st => st.sliceIndex));
    } else {
      activeModeSliceSet.clear();
    }
  } catch (e) {
    activeModeSliceSet.clear();
  }
}

if (bpmEl) {
  bpmEl.addEventListener('input', () => {
    updateBpmLabel();
  });
}

// new 2026-01-10
// Show reset confirmation modal rather than resetting immediately
if (resetBtn) {
  resetBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const modal = document.getElementById('resetModal');
    if (!modal) {
      // fallback: reset directly
      resetProject();
      return;
    }

    modal.classList.remove('hidden');
    try { document.body.classList.add('modal-open'); } catch (err) {}

    setTimeout(() => {
      try { bindResetModalHandlers(); } catch (err) { console.warn('bindResetModalHandlers failed', err); }
    }, 50);
  });
}

// Bind handlers for reset confirmation modal
function bindResetModalHandlers() {
  const confirmBtn = document.getElementById('resetConfirmBtn');
  const cancelBtn = document.getElementById('resetCancelBtn');
  const modal = document.getElementById('resetModal');

  if (!confirmBtn || !cancelBtn || !modal) {
    console.warn('[ResetModal] Elements not found — skipping');
    return false;
  }

  // replace nodes to remove old listeners
  const newConfirm = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
  const boundConfirm = document.getElementById('resetConfirmBtn');
  boundConfirm.addEventListener('click', (e) => {
    e.preventDefault();
    if (modal) modal.classList.add('hidden');
    try { document.body.classList.remove('modal-open'); } catch (err) {}
    // call existing reset logic
    resetProject();
  });

  cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  const boundCancel = document.getElementById('resetCancelBtn');
  boundCancel.addEventListener('click', (e) => {
    e.preventDefault();
    if (modal) modal.classList.add('hidden');
    try { document.body.classList.remove('modal-open'); } catch (err) {}
    setStatus('Reset cancelled.');
  });

  console.log('[ResetModal] bound');
  return true;
}

// new 2026-01-10
// Init
updateSensitivityLabel();
updateModeHint();
updateBpmLabel();
setRecordingUI(false);
bindCanvasEvents();
drawWaveform();
// add a small Stop Audio button near the waveform so users can stop playback immediately
(function createStopAudioButton(){
  try {
    const existing = document.getElementById('stopAudioBtnTop');
    if (existing) return;

    // inject modern styles for the button
    const styleId = 'stop-audio-btn-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        #stopAudioBtnTop { 
          position: fixed; 
          right: 12px; 
          bottom: 12px; 
          z-index: 9999; 
          padding: 10px 14px; 
          display: inline-flex; 
          align-items: center; 
          gap: 8px; 
          background: linear-gradient(135deg, #ff6b88 0%, #ff325d 60%); 
          color: #fff; 
          border: 1px solid rgba(255,255,255,0.08); 
          border-radius: 14px; 
          box-shadow: 0 6px 20px rgba(255,50,100,0.14), inset 0 -2px 6px rgba(0,0,0,0.12); 
          font-weight: 600; 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; 
          letter-spacing: 0.2px; 
          cursor: pointer; 
          transition: transform 160ms ease, box-shadow 160ms ease, opacity 120ms ease; 
          backdrop-filter: blur(6px) saturate(1.1);
        }
        #stopAudioBtnTop svg { width: 14px; height: 14px; display: block; }
        #stopAudioBtnTop:hover { transform: translateY(-3px); box-shadow: 0 10px 26px rgba(255,50,100,0.18); }
        #stopAudioBtnTop:active { transform: translateY(-1px) scale(0.99); }
      `;
      document.head.appendChild(style);
    }

    const btn = document.createElement('button');
    btn.id = 'stopAudioBtnTop';
    btn.setAttribute('aria-label', 'Stop any playing audio');
    btn.title = 'Stop any playing audio';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="3" fill="white" opacity="0.12"/>
        <rect x="7" y="7" width="10" height="10" rx="2" fill="#fff"/>
      </svg>
      <span style="font-size:13px;line-height:1;">Stop Audio</span>
    `;
    btn.addEventListener('click', (e) => { e.preventDefault(); try { stopAllPlayback(); } catch (err) {} });
    document.body.appendChild(btn);
  } catch (e) { /* non-fatal */ }
})();

// Create a small floating mini-toolkit for quick access: Play / Slice / Undo / Loop
(function createMiniToolkit(){
  try {
    if (document.getElementById('miniToolKit')) return;

    // inject styles for mini toolkit
    const styleId = 'mini-toolkit-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        #miniToolKit {
          position: fixed;
          right: 12px;
          bottom: 72px; /* above the Stop button */
          z-index: 9998;
          display: flex;
          gap: 8px;
          align-items: center;
          background: rgba(12,12,12,0.55);
          padding: 8px;
          border-radius: 12px;
          box-shadow: 0 6px 22px rgba(10,10,10,0.45);
          backdrop-filter: blur(6px) saturate(1.1);
        }
        #miniToolKit button {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
          color: #fff;
          cursor: pointer;
          transition: transform 140ms ease, box-shadow 140ms ease, background 120ms ease;
        }
        #miniToolKit button.active { box-shadow: 0 6px 16px rgba(11,218,143,0.12); transform: translateY(-3px); }
        #miniToolKit button:disabled { opacity: 0.45; cursor: default; }
        #miniToolKit svg { width: 18px; height: 18px; display:block; }
      `;
      document.head.appendChild(style);
    }

    const kit = document.createElement('div');
    kit.id = 'miniToolKit';

    // Play button
    const bPlay = document.createElement('button');
    bPlay.id = 'miniToolPlay';
    bPlay.title = 'Play (audition)';
    bPlay.innerHTML = `<svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M8 5v14l11-7z' fill='white'/></svg>`;
    bPlay.addEventListener('click', (e) => { e.preventDefault(); setActiveTool('play'); });

    // Slice button
    const bSlice = document.createElement('button');
    bSlice.id = 'miniToolSlice';
    bSlice.title = 'Slice (add/move markers)';
    bSlice.innerHTML = `<svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M3 17v2h18v-2H3zm14-9l-4 4-4-4 4-4 4 4z' fill='white'/></svg>`;
    bSlice.addEventListener('click', (e) => { e.preventDefault(); setActiveTool('slice'); });

    // Undo button
    const bUndo = document.createElement('button');
    bUndo.id = 'miniToolUndo';
    bUndo.title = 'Undo last marker action';
    bUndo.innerHTML = `<svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 5V1L7 6l5 5V7c3.86 0 7 3.14 7 7 0 1.1-.24 2.14-.67 3.06l1.52 1.22C21.7 17.2 22 15.63 22 14c0-5.52-4.48-10-10-10z' fill='white'/></svg>`;
    bUndo.addEventListener('click', (e) => { e.preventDefault(); undoLastAction(); });

    // Loop toggle
    const bLoop = document.createElement('button');
    bLoop.id = 'miniToolLoop';
    bLoop.title = 'Loop preview';
    bLoop.innerHTML = `<svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M7 7h10v3l4-4-4-4v3H5c-1.1 0-2 .9-2 2v10h2V7zM17 17H7v-3l-4 4 4 4v-3h12c1.1 0 2-.9 2-2V9h-2v8z' fill='white'/></svg>`;
    bLoop.addEventListener('click', (e) => {
      e.preventDefault();
      loopEnabled = !loopEnabled;
      bLoop.classList.toggle('active', loopEnabled);
      if (toolLoopBtnTop) toolLoopBtnTop.classList.toggle('active', loopEnabled);
      setStatus(loopEnabled ? 'Loop: ON' : 'Loop: OFF');
      if (loopEnabled && _previewStop) {
        stopPreview();
        setTimeout(() => { try { previewPattern(); } catch (e) {} }, 80);
      }
      if (!loopEnabled && _previewLoopRestartId) { clearTimeout(_previewLoopRestartId); _previewLoopRestartId = null; }
    });

    kit.appendChild(bPlay);
    kit.appendChild(bSlice);
    kit.appendChild(bUndo);
    kit.appendChild(bLoop);
    document.body.appendChild(kit);

    // initialize mini button states
    setActiveTool(activeTool);
    updateUndoButtonState();
    try { bLoop.classList.toggle('active', loopEnabled); } catch (e) {}
  } catch (e) { /* non-fatal */ }
})();

// Remove the existing in-container/top toolkit buttons if present so the mini toolkit is the single control
(function removeContainerToolkit(){
  try {
    const ids = ['toolPlayBtnTop','toolSliceBtnTop','toolLoopBtnTop','toolUndoBtnTop'];
    ids.forEach(id => {
      try {
        const el = document.getElementById(id);
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
          console.log('[UI] removed in-container toolkit button:', id);
        }
      } catch (e) { /* ignore per-button errors */ }
    });

    // If the parent container (commonly .toolkit) is now empty, remove it as well to clean up visual clutter
    try {
      const possible = document.querySelectorAll('.toolkit, #toolkit, .top-toolkit');
      possible.forEach(p => {
        try {
          if (p && p.childElementCount === 0 && p.parentNode) p.parentNode.removeChild(p);
        } catch (e) {}
      });
    } catch (e) {}
  } catch (e) { /* non-fatal */ }
})();

// Style the existing Reset button to match the new modern/edgy controls
(function styleResetButton(){
  try {
    const reset = document.getElementById('resetBtn');
    if (!reset) return;

    // inject shared modern control styles if missing
    const sharedId = 'modern-control-styles';
    if (!document.getElementById(sharedId)) {
      const s = document.createElement('style');
      s.id = sharedId;
      s.textContent = `
        .modernControl {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 12px;
          background: linear-gradient(135deg,#2b2b2b 0%, #141414 100%);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.04);
          box-shadow: 0 6px 18px rgba(0,0,0,0.45), inset 0 -2px 6px rgba(255,255,255,0.02);
          font-weight: 600;
          cursor: pointer;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
          transition: transform 140ms ease, box-shadow 140ms ease;
        }
        .modernControl:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(11,218,143,0.06); }
        .modernControl svg { width: 14px; height: 14px; display:block; }
      `;
      document.head.appendChild(s);
    }

    // rewrite reset button content to use compact SVG + label
    reset.classList.add('modernControl');
    reset.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5 0 .7-.15 1.36-.41 1.96l1.45 1.16C18.76 15.02 19 14.03 19 13c0-3.87-3.13-7-7-7z" fill="#fff" opacity="0.9"/>
        <path d="M6 12c0-1.1.9-2 2-2h1v2H8v6h6v-1h2v2c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2v-6z" fill="#fff" opacity="0.06"/>
      </svg>
      <span style="font-size:13px;line-height:1;">Reset</span>
    `;

    // keep existing listeners; if there are none, ensure click still triggers resetProject
    // (some pages bind later, but this preserves existing wiring)
    if (!reset.onclick && !reset._has_reset_listener) {
      reset.addEventListener('click', (e) => { /* preserve original behavior: show modal */ });
      reset._has_reset_listener = true;
    }
  } catch (e) { /* non-fatal */ }
})();
// new 2026-01-10
// INTRO MODAL LOGIC

const introModal = document.getElementById('introModal');
const introYesBtn = document.getElementById('introYesBtn');
const introNoBtn = document.getElementById('introNoBtn');

// Show modal on first load
function showIntroModal() {
  if (!introModal) return;
  introModal.classList.remove('hidden');
  try { document.body.classList.add('modal-open'); } catch (e) {}
}

// Hide modal
function hideIntroModal() {
  if (!introModal) return;
  introModal.classList.add('hidden');
  try { document.body.classList.remove('modal-open'); } catch (e) {}
}

// Button handlers
if (introYesBtn) {
  introYesBtn.addEventListener('click', () => {
    hideIntroModal();
    setStatus('Ready. Record something nasty.');
  });
}

if (introNoBtn) {
  introNoBtn.addEventListener('click', () => {
    hideIntroModal();
    setStatus('Take your time. When you\'re ready — chop.');
  });
}

// show intro
showIntroModal();

setStatus('Ready. Record something nasty.');
