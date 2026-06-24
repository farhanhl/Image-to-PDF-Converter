'use strict';

/* ============================================================
   Image to PDF Converter — app.js
   Fully client-side. Sequential processing untuk hemat memori.
   ============================================================ */

// ---- Konstanta ----
const PAPER_SIZES = {
  // dimensi dalam mm (portrait: width x height)
  a4:     { w: 210, h: 297 },
  a3:     { w: 297, h: 420 },
  letter: { w: 216, h: 279 },
  legal:  { w: 216, h: 356 },
  a5:     { w: 148, h: 210 },
};

const GRID_MAP = {
  1:  { cols: 1, rows: 1 },
  2:  { cols: 1, rows: 2 },
  4:  { cols: 2, rows: 2 },
  6:  { cols: 2, rows: 3 },
  9:  { cols: 3, rows: 3 },
  12: { cols: 3, rows: 4 },
};

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
const MAX_THUMBNAILS = 50;
const COMPRESS_MAX_WIDTH = 1920;
const COMPRESS_MAX_HEIGHT = 1920;
const COMPRESS_QUALITY = 0.85;
const BATCH_YIELD = 5; // beri napas ke event loop tiap N gambar

// ---- State ----
let images = [];          // array of File
let lastPdfBlobUrl = null;

// ---- DOM ----
const dropzone     = document.getElementById('dropzone');
const fileInput    = document.getElementById('fileInput');
const pickBtn      = document.getElementById('pickBtn');
const resetBtn     = document.getElementById('resetBtn');
const fileCount    = document.getElementById('fileCount');
const warnings     = document.getElementById('warnings');
const thumbGrid    = document.getElementById('thumbGrid');
const thumbMore    = document.getElementById('thumbMore');
const generateBtn  = document.getElementById('generateBtn');
const downloadBtn  = document.getElementById('downloadBtn');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const actionError  = document.getElementById('actionError');

// ============================================================
// Upload handling
// ============================================================

pickBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = ''; // izinkan pilih file sama lagi
});

// Drag & drop pada seluruh halaman, highlight dropzone
['dragenter', 'dragover'].forEach(evt => {
  document.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
});
['dragleave', 'drop'].forEach(evt => {
  document.addEventListener(evt, (e) => {
    e.preventDefault();
    // hanya hapus highlight jika benar-benar keluar window / setelah drop
    if (evt === 'drop' || e.relatedTarget === null) {
      dropzone.classList.remove('is-dragover');
    }
  });
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('is-dragover');
  if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
});

resetBtn.addEventListener('click', resetState);

function addFiles(fileList) {
  const incoming = Array.from(fileList);
  const skipped = [];

  for (const file of incoming) {
    const okType = ACCEPTED_TYPES.includes(file.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
    if (!okType) {
      skipped.push(file.name);
      continue;
    }
    images.push(file);
  }

  renderWarnings(skipped);
  renderFileCount();
  renderThumbnails();
  hideAction();
}

function resetState() {
  images = [];
  if (lastPdfBlobUrl) { URL.revokeObjectURL(lastPdfBlobUrl); lastPdfBlobUrl = null; }
  revokeThumbnails();
  thumbGrid.innerHTML = '';
  warnings.hidden = true;
  warnings.innerHTML = '';
  thumbMore.hidden = true;
  resetBtn.hidden = true;
  renderFileCount();
  hideAction();
  hideProgress();
}

// ============================================================
// Rendering UI
// ============================================================

function renderFileCount() {
  if (images.length === 0) {
    fileCount.textContent = 'Belum ada gambar dipilih';
    resetBtn.hidden = true;
  } else {
    fileCount.textContent = `${images.length} gambar dipilih`;
    resetBtn.hidden = false;
  }
}

function renderWarnings(skipped) {
  if (!skipped || skipped.length === 0) return;
  warnings.hidden = false;
  const list = skipped.slice(0, 10).map(n => `<li>${escapeHtml(n)}</li>`).join('');
  const extra = skipped.length > 10 ? `<li>…dan ${skipped.length - 10} file lainnya</li>` : '';
  warnings.innerHTML = `<strong>${skipped.length} file bukan gambar dilewati:</strong><ul>${list}${extra}</ul>`;
}

function revokeThumbnails() {
  thumbGrid.querySelectorAll('img[data-url]').forEach(img => URL.revokeObjectURL(img.dataset.url));
}

function renderThumbnails() {
  revokeThumbnails();
  thumbGrid.innerHTML = '';

  const shown = Math.min(images.length, MAX_THUMBNAILS);
  const frag = document.createDocumentFragment();

  for (let i = 0; i < shown; i++) {
    const url = URL.createObjectURL(images[i]);
    const cell = document.createElement('div');
    cell.className = 'thumb';
    cell.innerHTML = `<span class="thumb__idx">${i + 1}</span>`;
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = url;
    img.dataset.url = url;
    img.alt = images[i].name;
    cell.appendChild(img);
    frag.appendChild(cell);
  }
  thumbGrid.appendChild(frag);

  if (images.length > MAX_THUMBNAILS) {
    thumbMore.hidden = false;
    thumbMore.textContent = `Menampilkan ${MAX_THUMBNAILS} dari ${images.length} gambar (semua tetap diproses).`;
  } else {
    thumbMore.hidden = true;
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============================================================
// Layout engine
// ============================================================

/**
 * Hitung konfigurasi grid untuk satu halaman.
 * Mengembalikan { cols, rows, cells: [{x,y,w,h}, ...] } dalam mm.
 */
function calculateGrid(imagesPerPage, paperWidth, paperHeight, marginEdge, marginBetween) {
  const { cols, rows } = GRID_MAP[imagesPerPage] || { cols: 1, rows: 1 };

  const usableW = paperWidth  - marginEdge * 2;
  const usableH = paperHeight - marginEdge * 2;

  const cellW = (usableW - marginBetween * (cols - 1)) / cols;
  const cellH = (usableH - marginBetween * (rows - 1)) / rows;

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = marginEdge + c * (cellW + marginBetween);
      const y = marginEdge + r * (cellH + marginBetween);
      cells.push({ x, y, w: cellW, h: cellH });
    }
  }
  return { cols, rows, cells };
}

/**
 * Fit gambar ke dalam sel dengan mode contain (aspect ratio dipertahankan, dicentrasi).
 */
function fitContain(imgW, imgH, cell) {
  const scale = Math.min(cell.w / imgW, cell.h / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const drawX = cell.x + (cell.w - drawW) / 2;
  const drawY = cell.y + (cell.h - drawH) / 2;
  return { drawX, drawY, drawW, drawH };
}

// ============================================================
// Image compression / loading
// ============================================================

/**
 * Load file gambar, resize via canvas, return { dataURL, width, height }.
 * width/height adalah dimensi piksel setelah resize.
 */
function compressImage(file, maxWidth = COMPRESS_MAX_WIDTH, maxHeight = COMPRESS_MAX_HEIGHT, quality = COMPRESS_QUALITY) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (!width || !height) {
          URL.revokeObjectURL(url);
          reject(new Error(`Dimensi gambar tidak valid: ${file.name}`));
          return;
        }
        // batasi sisi terpanjang agar canvas tidak meledak (mempertahankan rasio)
        const scale = Math.min(1, maxWidth / width, maxHeight / height);
        if (scale < 1) {
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // background putih untuk PNG transparan / GIF
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataURL = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(url);
        resolve({ dataURL, width, height });
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Gagal memuat gambar: ${file.name}`));
    };
    img.src = url;
  });
}

// ============================================================
// PDF generation
// ============================================================

generateBtn.addEventListener('click', generatePDF);

async function generatePDF() {
  hideError();

  if (images.length === 0) {
    showError('Belum ada gambar untuk diproses. Upload dulu, ya.');
    return;
  }

  // baca settings
  const imagesPerPage = parseInt(document.getElementById('imagesPerPage').value, 10);
  const marginBetween = clampNum(document.getElementById('marginBetween').value, 0, 50, 5);
  const marginEdge    = clampNum(document.getElementById('marginEdge').value, 0, 50, 10);
  const paperKey      = document.getElementById('paperSize').value;
  const orientation   = document.querySelector('input[name="orientation"]:checked').value;

  const paper = PAPER_SIZES[paperKey];
  const paperWidth  = orientation === 'landscape' ? paper.h : paper.w;
  const paperHeight = orientation === 'landscape' ? paper.w : paper.h;

  const grid = calculateGrid(imagesPerPage, paperWidth, paperHeight, marginEdge, marginBetween);

  // UI: lock
  setBusy(true);
  showProgress();
  if (lastPdfBlobUrl) { URL.revokeObjectURL(lastPdfBlobUrl); lastPdfBlobUrl = null; }
  downloadBtn.hidden = true;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation, unit: 'mm', format: paperKey });

  try {
    for (let i = 0; i < images.length; i++) {
      const posInPage = i % imagesPerPage;
      if (posInPage === 0 && i !== 0) pdf.addPage();

      const cell = grid.cells[posInPage];

      let imgData;
      try {
        imgData = await compressImage(images[i]);
      } catch (err) {
        console.warn(err);
        updateProgress(i + 1, images.length);
        continue; // skip gambar rusak
      }

      const { drawX, drawY, drawW, drawH } = fitContain(imgData.width, imgData.height, cell);
      pdf.addImage(imgData.dataURL, 'JPEG', drawX, drawY, drawW, drawH);

      updateProgress(i + 1, images.length);

      // beri napas ke event loop agar UI tidak freeze
      if ((i + 1) % BATCH_YIELD === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    const blob = pdf.output('blob');
    lastPdfBlobUrl = URL.createObjectURL(blob);
    downloadBtn.hidden = false;
    progressText.textContent = `Selesai — ${images.length} gambar diproses.`;
  } catch (err) {
    console.error(err);
    showError('Terjadi kesalahan saat membuat PDF: ' + err.message);
    hideProgress();
  } finally {
    setBusy(false);
  }
}

downloadBtn.addEventListener('click', () => {
  if (!lastPdfBlobUrl) return;
  const a = document.createElement('a');
  a.href = lastPdfBlobUrl;
  a.download = 'dini-jelek.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
});

// ============================================================
// Helpers UI state
// ============================================================

function clampNum(val, min, max, fallback) {
  let n = parseFloat(val);
  if (isNaN(n)) n = fallback;
  return Math.min(max, Math.max(min, n));
}

function setBusy(busy) {
  generateBtn.disabled = busy;
  resetBtn.disabled = busy;
  generateBtn.textContent = busy ? 'Memproses…' : 'Generate PDF';
}

function showProgress() {
  progressWrap.hidden = false;
  progressFill.style.width = '0%';
  progressText.textContent = 'Memproses 0 / ' + images.length + '...';
}
function hideProgress() { progressWrap.hidden = true; }

function updateProgress(done, total) {
  const pct = Math.round((done / total) * 100);
  progressFill.style.width = pct + '%';
  progressText.textContent = `Memproses ${done} / ${total} gambar...`;
}

function hideAction() {
  downloadBtn.hidden = true;
  hideProgress();
}

function showError(msg) {
  actionError.hidden = false;
  actionError.textContent = msg;
}
function hideError() { actionError.hidden = true; actionError.textContent = ''; }
