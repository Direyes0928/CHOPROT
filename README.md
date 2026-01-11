# CHOPROT
Capture. Chop. Rot.

# CHOPROT

Grimy browser-based sound sampler for fast idea capture and aggressive audio chopping.

**Capture. Chop. Let it rot.**

---

## What is CHOPROT?

CHOPROT is a **local-only web sampler** that lets you:

- Record audio from your mic
- Capture screen + system audio (browser supported)
- Automatically slice sounds into beat-ready chops
- Manually adjust slice markers
- Export WAV slices or a ZIP pack
- Drop them straight into your DAW

No accounts.  
No cloud.  
No data leaves your machine.

---

##  Features

### Recording
- Microphone recording
- Screen + system audio capture (Chrome/Edge desktop recommended)
- Real-time status feedback
- Clean permission handling

### Slicing
- Automatic transient detection
- Sensitivity slider (control slice aggressiveness)
- Interactive waveform display
- Draggable slice markers
- Double-click to add markers
- Right-click to delete markers

### Export
- Individual WAV downloads
- ZIP batch export (JSZip)
- Clean sequential file naming
- DAW-ready audio files

---

##  How to Use

1. Click **Record Mic** or **Record Screen**
2. Make some noise
3. Press **Stop**
4. Click **Auto Slice**
5. Adjust markers if needed
6. Choose:
   - WAV export
   - ZIP export
7. Load files into your DAW

---

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript
- Web Audio API
- MediaRecorder API
- Canvas waveform renderer
- JSZip (for ZIP exports)

---

## ⚠ Browser Notes

| Browser | Mic | Screen Audio |
|---------|-----|--------------|
| Chrome (Desktop) | yes | yes |
| Edge (Desktop) | yes | yes |
| Firefox | yes | ⚠ Partial |
| Safari | yes | No |
| Mobile Browsers | ⚠ | No |

System audio support depends on OS + browser security policies.

---

## Supported Workflows

Works with:
- Ableton Live
- FL Studio
- Logic Pro
- MPC Software
- Reason
- Any DAW that accepts WAV files

---

## Philosophy

CHOPROT is built for:
- Fast idea capture
- Dirty sound design
- Late-night creativity
- No friction
- No bullshit

---

## Roadmap

- MIDI export
- Tempo detection
- Drum rack layouts
- Preset slicing modes
- Offline install (PWA)

---

## License

TBD

---

## 🖤 Credits

Built by **Diego Reyes**  
For producers, beatmakers, and audio degenerates.
