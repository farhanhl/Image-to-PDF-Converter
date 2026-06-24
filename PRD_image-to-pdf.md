# PRD: Image to PDF Converter
**Project Type:** Single-page web app (fully client-side)  
**Stack:** Vanilla HTML + CSS + JavaScript  
**PDF Engine:** jsPDF (CDN)  
**Target:** AI Agent Execution

---

## Overview

Sebuah website yang memungkinkan user mengupload ratusan gambar sekaligus, mengatur tata letak per halaman, margin, dan ukuran kertas, lalu menghasilkan file PDF langsung di browser tanpa backend.

---

## File Structure

```
image-to-pdf/
├── index.html        # Single HTML file, semua logic di sini
├── style.css         # Stylesheet terpisah
└── app.js            # JavaScript utama
```

> Semua dalam satu folder flat. Tidak ada build tool, tidak ada bundler.

---

## Tech Stack & Dependencies (CDN)

```html
<!-- jsPDF untuk generate PDF -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
```

Tidak ada dependency lain. Semua berjalan di browser modern (Chrome, Firefox, Edge, Safari).

---

## UI Layout

### Zona 1 — Upload Area
- Drag & drop zone besar di bagian atas
- Tombol "Pilih File" sebagai alternatif
- Input `accept="image/*"` dan `multiple`
- Mendukung format: JPG, PNG, WEBP, GIF, BMP
- Menampilkan jumlah file yang sudah diupload: `"127 gambar dipilih"`
- Preview thumbnail grid (lazy render, max tampil 50 thumbnail untuk performa)

### Zona 2 — Panel Pengaturan
Layout: grid 2 kolom (kiri: layout options, kanan: paper options)

**Kolom Kiri — Layout Gambar:**
| Setting | Tipe Input | Nilai Default | Nilai Valid |
|---|---|---|---|
| Gambar per halaman | Select atau number input | 1 | 1, 2, 4, 6, 9, 12 (atau custom) |
| Margin antar gambar (px/mm) | Number input | 5 mm | 0–50 mm |
| Margin ke tepi kertas (mm) | Number input (atau 4 input: atas/bawah/kiri/kanan) | 10 mm | 0–50 mm |

**Kolom Kanan — Kertas:**
| Setting | Tipe Input | Nilai Default |
|---|---|---|
| Ukuran kertas | Select | A4 |
| Orientasi | Radio/Toggle | Portrait |

Pilihan ukuran kertas yang tersedia:
- A4 (210 × 297 mm)
- A3 (297 × 420 mm)
- Letter (216 × 279 mm)
- Legal (216 × 356 mm)
- A5 (148 × 210 mm)

### Zona 3 — Preview & Action
- Tombol **"Generate PDF"** — besar, prominent
- Progress bar saat proses berlangsung: `"Memproses 45 / 127 gambar..."`
- Setelah selesai: tombol **"Download PDF"** muncul

---

## Fitur Utama

### 1. Upload Massal
- Mendukung hingga **500+ gambar** dalam satu sesi
- File diproses secara **sequential** menggunakan async/await untuk menghindari crash memori
- Gambar di-load ke memory hanya saat akan diproses ke PDF (tidak semua sekaligus)
- Urutan gambar bisa diatur ulang via drag-and-drop pada thumbnail grid

### 2. Layout Engine
Fungsi `calculateGrid(imagesPerPage, paperWidth, paperHeight, marginEdge, marginBetween)` menghitung:
- Jumlah kolom dan baris dari `imagesPerPage`
- Lebar dan tinggi tiap sel gambar
- Posisi X, Y tiap gambar dalam halaman

Mapping `imagesPerPage` → grid:
```
1  → 1×1
2  → 1×2
4  → 2×2
6  → 2×3
9  → 3×3
12 → 3×4
```

Gambar di-fit ke dalam sel dengan mode **contain** (aspect ratio dipertahankan, tidak dipotong, dicentrasi dalam sel).

### 3. PDF Generation dengan jsPDF
```javascript
// Pseudocode alur utama
const pdf = new jsPDF({ orientation, unit: 'mm', format: paperSize });

for (let i = 0; i < images.length; i++) {
  const pageIndex = Math.floor(i / imagesPerPage);
  const posInPage = i % imagesPerPage;

  if (posInPage === 0 && i !== 0) pdf.addPage();

  const { x, y, w, h } = getImageCell(posInPage, gridConfig);
  const imgData = await loadImageAsBase64(images[i]);
  const { drawX, drawY, drawW, drawH } = fitContain(imgData, w, h, x, y);

  pdf.addImage(imgData, 'JPEG', drawX, drawY, drawW, drawH);

  updateProgress(i + 1, images.length);
}

pdf.save('output.pdf');
```

### 4. Progress Feedback
- Progress bar HTML native (`<progress>`) atau CSS bar custom
- Text counter: `"Memproses 23 / 127..."`
- UI freeze dicegah dengan `await new Promise(r => setTimeout(r, 0))` tiap N iterasi untuk memberi napas ke event loop
- Tombol Generate di-disable saat proses berjalan

---

## Performa & Edge Cases

| Skenario | Penanganan |
|---|---|
| File bukan gambar | Skip dengan warning di UI |
| Gambar terlalu besar (>10MB per file) | Resize/compress otomatis via Canvas sebelum addImage |
| Browser kehabisan memori | Process batch per 20 gambar, release object URL setelah pakai |
| User upload ulang | Reset state dan thumbnail grid |
| 0 gambar saat klik Generate | Tampilkan error inline, tidak proses |

### Image Compression (opsional tapi disarankan)
Sebelum `pdf.addImage()`, resize gambar via Canvas API:
```javascript
function compressImage(file, maxWidth = 1920, quality = 0.85) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // hitung scale agar maxWidth tidak terlewati
      // canvas.toDataURL('image/jpeg', quality)
      resolve(dataURL);
    };
    img.src = URL.createObjectURL(file);
  });
}
```

---

## UI/UX Design Direction

**Estetika:** Clean, utilitarian, tool-first. Tidak perlu marketing copy — user datang untuk kerja.

**Warna:**
- Background: `#F8F9FA` (abu sangat terang)
- Surface card: `#FFFFFF`
- Accent utama: `#2563EB` (biru solid)
- Text primer: `#111827`
- Text sekunder: `#6B7280`
- Border: `#E5E7EB`

**Tipografi (Google Fonts CDN):**
- UI: `Inter` — weight 400, 500, 600
- Tidak ada display font, ini adalah tool bukan landing page

**Signature element:** Drop zone dengan border dashed animasi yang berubah warna dan "pulse" saat file di-drag ke atas halaman.

**Responsive:** Layout 2 kolom panel settings collapse ke 1 kolom di mobile (<768px).

---

## Acceptance Criteria

- [ ] User bisa upload 100+ gambar sekaligus tanpa browser crash
- [ ] Setting gambar per halaman (1/2/4/6/9/12) berfungsi dengan benar
- [ ] Margin antar gambar dan margin tepi kertas diterapkan akurat dalam PDF
- [ ] Semua ukuran kertas (A4/A3/Letter/Legal/A5) menghasilkan PDF dengan dimensi yang benar
- [ ] Progress bar terupdate live saat generate
- [ ] PDF bisa didownload setelah generate selesai
- [ ] Gambar maintain aspect ratio (tidak stretch/distort)
- [ ] Tidak ada request ke server — semua berjalan di browser

---

## Out of Scope (v1)

- Reorder gambar via drag-drop thumbnail (nice to have, bisa di v2)
- Preview halaman PDF sebelum download
- Watermark / text overlay
- Compress PDF output
- Login / cloud storage
