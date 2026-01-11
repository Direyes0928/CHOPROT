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
const zipToggleEl = document.getElementById('zipToggle');

const waveCanvas = document.getElementById('waveCanvas');
const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;

const statusText = document.getElementById('statusText');

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
  try {
    setStatus('Requesting screen capture…');
    setRecordingUI(true);

    // NOTE: System audio support varies by browser/OS
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });

    currentStream = stream;

    // We only need audio; video track exists but is fine
    startRecorderWithStream(stream);
  } catch (err) {
    console.error(err);
    stopAndCleanupStream();
    setRecordingUI(false);
    setStatus('❌ Screen recording failed (system audio may not be supported in this browser).');
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
    const useZip = !!(zipToggleEl && zipToggleEl.checked);

    if (useZip) {
      if (!window.JSZip) {
        setStatus('❌ JSZip not loaded. Check your index.html script tag.');
        return;
      }

      const zip = new JSZip();

      for (let i = 0; i < exportPoints.length; i++) {
        const start = exportPoints[i];
        const end = exportPoints[i + 1] || decodedBuffer.length;

        const sliceBuf = sliceBufferBySamples(decodedBuffer, start, end);
        const wavBlob = bufferToWav(sliceBuf);

        const arrBuf = await wavBlob.arrayBuffer();
        const fileName = `choprot_slice_${String(i + 1).padStart(2, '0')}.wav`;
        zip.file(fileName, arrBuf);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerDownload(zipBlob, 'choprot_slices.zip');

      setStatus(`
        <span style="display: inline-flex; align-items: center; gap: 0.4em;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="vertical-align: middle;"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2l4-4"/></svg>
          Exported ZIP (${exportPoints.length} slices).
        </span>
      `);
      return;
    }

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
// ===== Wire UI =====

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
// Init
updateSensitivityLabel();
setRecordingUI(false);
bindCanvasEvents();
drawWaveform();
setStatus('Ready. Record something nasty.');
