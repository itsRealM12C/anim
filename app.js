/* use UMD globals loaded from unpkg: FFmpeg and GIF */
const { createFFmpeg } = FFmpeg;
const GIF = window.GIF || window.gif;

const fileInput = document.getElementById("files");
const canvas = document.getElementById("canvas");
// keep preview canvas capable of transparency so "transparent" mode shows in preview
const ctx = canvas.getContext("2d", { alpha: true });
const thumbs = document.getElementById("thumbs");
const speedRange = document.getElementById("speed");
const speedVal = document.getElementById("speedVal");
const bgModeSelect = document.getElementById("bgMode");
const bgColorInput = document.getElementById("bgColor");
const playBtn = document.getElementById("play");
const pauseBtn = document.getElementById("pause");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const exportGifBtn = document.getElementById("exportGif");
const exportMp4Btn = document.getElementById("exportMp4");
const status = document.getElementById("status");

let frames = []; // {img:Image, url:string, w,h}
let current = 0;
let playing = false;
let fps = Number(speedRange.value);
let timer = null;

function setStatus(s){ status.textContent = s; }

function clearFrames(){
  frames.forEach(f=> URL.revokeObjectURL(f.url));
  frames = [];
  thumbs.innerHTML = "";
  current = 0;
  drawPlaceholder();
  setStatus("No frames loaded.");
}
function drawPlaceholder(){
  canvas.width = 640;
  canvas.height = 360;
  ctx.fillStyle = "#222";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = "#999";
  ctx.font = "18px system-ui";
  ctx.fillText("No frames", 12, 28);
}
function resizeCanvasToFrame(w,h){
  const maxW = Math.min(820, window.innerWidth-380);
  const scale = Math.min(1, maxW / w);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  return scale;
}

function getBackgroundStyleObj(){
  const mode = bgModeSelect.value;
  if(mode === 'transparent') return { mode: 'transparent', css: 'transparent' };
  if(mode === 'custom') return { mode: 'custom', css: bgColorInput.value };
  return { mode: 'black', css: '#000000' };
}

function renderFrame(index){
  if(!frames.length) return;
  index = ((index % frames.length) + frames.length) % frames.length;
  current = index;
  const f = frames[index];
  const scale = resizeCanvasToFrame(f.w, f.h);
  // compose background according to mode (also update canvas CSS background so transparency is visible)
  const bg = getBackgroundStyleObj();
  if (bg.mode === 'transparent') {
    canvas.style.background = 'transparent';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    canvas.style.background = bg.css;
    ctx.fillStyle = bg.css;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(f.img, 0, 0, f.w * scale, f.h * scale);
  updateThumbsActive();
  setStatus(`Frame ${index+1} / ${frames.length} â€¢ ${fps} fps`);
}

function updateThumbsActive(){
  Array.from(thumbs.children).forEach((el,i)=>{
    el.classList.toggle("active", i===current);
  });
}

function play(){
  if(!frames.length) return;
  if(playing) return;
  playing = true;
  const interval = 1000 / fps;
  timer = setInterval(()=> {
    current = (current+1) % frames.length;
    renderFrame(current);
  }, interval);
  setStatus(`Playing â€¢ ${fps} fps`);
}
function pause(){
  playing = false;
  if(timer) { clearInterval(timer); timer = null; }
  setStatus(`Paused â€¢ Frame ${current+1}/${frames.length}`);
}

speedRange.addEventListener("input", ()=>{
  fps = Number(speedRange.value);
  speedVal.textContent = fps;
  if(playing){
    pause();
    play();
  } else {
    if(frames.length) renderFrame(current);
  }
});

bgModeSelect.addEventListener("change", ()=>{
  const mode = bgModeSelect.value;
  bgColorInput.style.display = (mode === 'custom') ? 'inline-block' : 'inline-block';
  // re-render preview to show new background
  if(frames.length) renderFrame(current);
});
bgColorInput.addEventListener("input", ()=>{
  if(frames.length) renderFrame(current);
});

fileInput.addEventListener("change", async (e)=>{
  const rawFiles = Array.from(e.target.files || []);
  if(!rawFiles.length){
    clearFrames();
    return;
  }

  // reset
  clearFrames();
  setStatus("Scanning files...");

  // Accept by MIME image/* OR common extensions fallback
  const isLikelyImage = (file) => {
    if (file.type && file.type.startsWith('image/')) return true;
    const name = (file.name || '').toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(name);
  };

  const files = rawFiles.filter(isLikelyImage);
  const skipped = rawFiles.length - files.length;
  if (!files.length) {
    setStatus(`No supported image files found. Skipped ${skipped} file(s).`);
    return alert("No supported image files (png/jpg/gif/webp/etc) were selected.");
  }

  setStatus("Loading frames...");
  const loaded = [];
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await new Promise((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Image load failed'));
      });
      loaded.push({ img, url, w: img.naturalWidth, h: img.naturalHeight });
    } catch (err) {
      // skip files that fail to decode as images
      URL.revokeObjectURL(url);
      console.warn('Skipped a file that could not be loaded as image:', file.name);
    }
  }

  frames = loaded;
  const skippedTotal = skipped + (files.length - loaded.length);

  // create thumbs
  thumbs.innerHTML = "";
  frames.forEach((f, i)=>{
    const t = document.createElement("img");
    t.src = f.url;
    t.title = `Frame ${i+1}`;
    t.addEventListener("click", ()=>{ pause(); renderFrame(i); });
    thumbs.appendChild(t);
  });

  if (frames.length) {
    renderFrame(0);
    setStatus(`Loaded ${frames.length} frames. Skipped ${skippedTotal} file(s). ${fps} fps`);
  } else {
    drawPlaceholder();
    setStatus(`No valid image frames loaded. Skipped ${skippedTotal} file(s).`);
    alert("No valid image frames could be loaded.");
  }
});

playBtn.addEventListener("click", ()=>{ play(); });
pauseBtn.addEventListener("click", ()=>{ pause(); });
prevBtn.addEventListener("click", ()=>{ pause(); renderFrame(current - 1); });
nextBtn.addEventListener("click", ()=>{ pause(); renderFrame(current + 1); });

async function exportGIF(){
  if(!frames.length) return alert("No frames.");
  exportGifBtn.disabled = true;
  setStatus("Preparing GIF worker...");

  // Fetch gif.worker.js (use the UMD worker from unpkg to avoid loading ESM sources)
  let workerUrl = null;
  try {
    const res = await fetch('https://unpkg.com/gif.js.optimized/dist/gif.worker.js');
    if(!res.ok) throw new Error('fetch failed');
    const txt = await res.text();
    const blob = new Blob([txt], { type: 'application/javascript' });
    workerUrl = URL.createObjectURL(blob);
  } catch(e){
    console.warn('Worker fetch failed for unpkg', e);
  }

  if(!workerUrl){
    exportGifBtn.disabled = false;
    setStatus("Failed to load GIF worker.");
    return alert("Failed to load GIF worker script.");
  }

  setStatus("Rendering GIF...");
  const gif = new GIF({
    workers: 2,
    quality: 10,
    workerScript: workerUrl
  });

  // determine background for frames
  const outBg = getBackgroundStyleObj();
  for(const f of frames){
    const off = document.createElement("canvas");
    off.width = f.w;
    off.height = f.h;
    const ox = off.getContext("2d", { alpha: outBg.mode === 'transparent' });
    if (outBg.mode === 'transparent') {
      ox.clearRect(0, 0, f.w, f.h);
    } else {
      ox.fillStyle = outBg.css;
      ox.fillRect(0, 0, f.w, f.h);
    }
    ox.drawImage(f.img, 0, 0, f.w, f.h);
    gif.addFrame(off, { delay: 1000 / fps, copy: true });
  }

  gif.on('finished', (blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "animation.gif";
    a.click();
    URL.revokeObjectURL(url);
    // revoke the worker blob URL too
    try { URL.revokeObjectURL(workerUrl); } catch(e){}
    exportGifBtn.disabled = false;
    setStatus("GIF exported.");
  });

  gif.on('progress', p=>{
    setStatus(`Rendering GIF... ${(p*100).toFixed(0)}%`);
  });

  gif.render();
}

async function exportMP4(){
  if(!frames.length) return alert("No frames.");
  exportMp4Btn.disabled = true;
  setStatus("Loading FFmpeg (this may take a few seconds)...");
  const ffmpeg = createFFmpeg({
    log: true,
    // point corePath to a compatible bundle that exposes createFFmpegCore
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.1/dist/ffmpeg-core.js'
  });
  await ffmpeg.load();
  setStatus("Preparing frames for MP4...");

  // Write frames as PNG files into FFmpeg FS
  // Use zero-padded numeric names
  const pad = n => String(n).padStart(4, '0');
  const outBg = getBackgroundStyleObj();
  for(let i=0;i<frames.length;i++){
    const f = frames[i];
    // draw at original size into offscreen canvas then get blob
    const off = document.createElement("canvas");
    // For MP4 we must produce opaque frames (MP4 doesn't support alpha), so always draw into an opaque canvas.
    off.width = f.w;
    off.height = f.h;
    const ox = off.getContext("2d", { alpha: false });
    // If user selected transparent output, composite onto black for MP4 encoding (black is common fallback).
    if (outBg.mode === 'transparent') {
      ox.fillStyle = '#000000';
      ox.fillRect(0, 0, f.w, f.h);
    } else {
      ox.fillStyle = outBg.css;
      ox.fillRect(0, 0, f.w, f.h);
    }
    ox.drawImage(f.img, 0, 0, f.w, f.h);
    const blob = await new Promise(res => off.toBlob(res, "image/png"));
    const data = await blob.arrayBuffer();
    const name = `img${pad(i)}.png`;
    ffmpeg.FS('writeFile', name, new Uint8Array(data));
  }

  setStatus("Encoding MP4...");
  // Use ffmpeg to create mp4 at requested fps. -r before input sets input fps
  // Build input pattern img%04d.png
  const inputPattern = 'img%04d.png';
  // encode to mp4 with H.264 (libx264) if available in wasm build; otherwise use mpeg4
  try {
    await ffmpeg.run(
      '-framerate', String(fps),
      '-i', inputPattern,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '23',
      'out.mp4'
    );
  } catch(err){
    // fallback to mpeg4 if libx264 not available
    console.warn('libx264 failed, falling back to mpeg4', err);
    await ffmpeg.run(
      '-framerate', String(fps),
      '-i', inputPattern,
      '-c:v', 'mpeg4',
      '-q:v', '5',
      'out.mp4'
    );
  }

  const data = ffmpeg.FS('readFile', 'out.mp4');
  const blob = new Blob([data.buffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'animation.mp4';
  a.click();
  URL.revokeObjectURL(url);
  // clean up FS
  try {
    for(let i=0;i<frames.length;i++){
      ffmpeg.FS('unlink', `img${pad(i)}.png`);
    }
    ffmpeg.FS('unlink', 'out.mp4');
  } catch(e){}
  exportMp4Btn.disabled = false;
  setStatus("MP4 exported.");
}

exportGifBtn.addEventListener("click", exportGIF);
exportMp4Btn.addEventListener("click", exportMP4);

 // initial
drawPlaceholder();
speedVal.textContent = fps;
// ensure bgColor visibility according to default value
bgColorInput.style.display = (bgModeSelect.value === 'custom') ? 'inline-block' : 'inline-block';
