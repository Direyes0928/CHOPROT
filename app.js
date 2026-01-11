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
let activeModeKey = 'none';
let patternMap = null; // { modeKey, bpm, steps: [{sliceIndex,startSample,endSample,beats}] }

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
    waveCtx.beginPath();
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
  drawWaveform();
}

// new 2026-01-10
function removeSlicePointAtIndex(idx) {
  if (idx < 0 || idx >= slicePoints.length) return;
  slicePoints.splice(idx, 1);
  drawWaveform();
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

  waveCanvas.addEventListener('mousedown', (e) => {
    if (!decodedBuffer) return;
    const x = canvasX(e);
    const idx = findMarkerNearX(x);
    draggingIdx = idx;
  });

  window.addEventListener('mousemove', (e) => {
    if (!decodedBuffer) return;
    if (draggingIdx < 0) return;

    const rect = waveCanvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (waveCanvas.width / rect.width));
    const s = xToSample(Math.max(0, Math.min(waveCanvas.width - 1, x)), waveCanvas.width);

    // keep markers away from extreme edges just a bit
    slicePoints[draggingIdx] = Math.max(0, Math.min(decodedBuffer.length - 1, s));
    slicePoints = uniqSorted(slicePoints);
    drawWaveform();
  });

  window.addEventListener('mouseup', () => {
    draggingIdx = -1;
  });

  // Double-click to add marker
  waveCanvas.addEventListener('dblclick', (e) => {
    if (!decodedBuffer) return;
    const x = canvasX(e);
    const s = xToSample(x, waveCanvas.width);
    addSlicePoint(s);
    setStatus('➕ Marker added. Drag to adjust.');
  });

  // Right-click marker to delete (context menu)
  waveCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!decodedBuffer) return;
    const x = canvasX(e);
    const idx = findMarkerNearX(x);
    if (idx >= 0) {
      removeSlicePointAtIndex(idx);
      setStatus('🗑 Marker removed.');
    }
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
}

// new 2026-01-10
function previewPattern() {
  if (!decodedBuffer) {
    setStatus('❌ Record audio first.');
    return;
  }

  if (!patternMap || !patternMap.steps || !patternMap.steps.length) {
    setStatus('⚠️ No pattern yet. Apply a mode first.');
    return;
  }

  stopPreview();

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
    }

    t += durSec;
  }

  _previewStop = () => {
    activeSources.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
  };

  setStatus(`▶ Previewing (${(CHOP_MODES[activeModeKey] || CHOP_MODES.none).label}) @ ${bpm} BPM`);
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

if (recordMicBtn) recordMicBtn.addEventListener('click', startMicRecording);
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

if (bpmEl) {
  bpmEl.addEventListener('input', () => {
    updateBpmLabel();
  });
}

// new 2026-01-10
// Init
updateSensitivityLabel();
updateModeHint();
updateBpmLabel();
setRecordingUI(false);
bindCanvasEvents();
drawWaveform();
setStatus('Ready. Record something nasty.');
