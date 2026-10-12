# AQILLA PROMPTER — Voice Follow Teleprompter

Web teleprompter statis (tanpa server dan tanpa database) untuk digunakan dari Chrome/Edge.

## Fitur

- Voice Follow: menggerakkan teks setelah ucapan dikenali melalui Web Speech API, dengan hasil sementara dan hasil final, toleransi beberapa kata terlewat, serta pemulihan setelah layanan suara berhenti.
- Pengaturan ukuran font besar, jarak baris, lebar teks, posisi garis baca, dan font (default **Nunito ExtraBold**, pendekatan visual dari contoh).
- Tulisan tebal putih pada latar hitam. Mirror horizontal dan vertikal.
- Fullscreen, scroll otomatis berbasis kecepatan, klik kata untuk menentukan posisi, loncat paragraf, kontrol keyboard.
- Impor PDF (PDF yang memiliki teks), DOCX, TXT, atau Markdown.
- Autosave **naskah dan pengaturan hanya di localStorage browser perangkat**, bukan GitHub.

## Cara mengunggah ke GitHub Pages (gratis)

1. Masuk ke https://github.com dan buat repository baru bernama `aqilla-prompter` (pilih **Public** untuk GitHub Free).
2. Masuk ke repository > **Add file** > **Upload files**.
3. Ekstrak ZIP, lalu unggah seluruh *isi folder* ini ke akar repository: `index.html`, `style.css`, `app.js`, `.nojekyll`, `README.md` (bukan file ZIP-nya saja, bukan folder pembungkus). Klik **Commit changes**.
4. Buka repository > **Settings** > **Pages**.
5. Pada **Build and deployment** pilih **Deploy from a branch**, branch **main**, folder **/(root)**, lalu **Save**.
6. Setelah Pages menyelesaikan deployment, buka `https://USERNAME.github.io/aqilla-prompter/` (ganti USERNAME dengan akun GitHub Anda).
7. Buka lewat Chrome atau Edge, klik **Mulai Voice Follow**, izinkan mikrofon, lalu bacakan naskah.

## Catatan penting tentang Voice Follow

Fitur ini **bukan** salinan teknologi VoiceGlide milik Teleprompter.com, melainkan implementasi terbuka di browser menggunakan `SpeechRecognition`. Pengenalan suara bekerja hanya pada browser yang mendukung fitur ini. Beberapa browser mengirim audio ke layanan speech recognition mereka; jadi **naskah disimpan lokal**, tapi **audio pengenalan suara mungkin diproses layanan browser**, dan koneksi internet mungkin diperlukan. Tidak dijanjikan akurasi 100%, terutama untuk nama unik, suara bising, ucapan berbeda dari teks, atau layanan yang terputus.

Chrome/Edge di desktop paling direkomendasikan. Untuk PDF hasil scan (gambar), aplikasi tidak menyediakan OCR. File PDF/Word diurai di browser menggunakan pustaka pihak ketiga dari CDN; dibutuhkan koneksi untuk memuat pustaka tersebut dan font Nunito dari Google Fonts.

## Tombol pintas

- `V`: mulai/stop Voice Follow
- `Spasi`: mulai/jeda scroll otomatis
- `←` / `→`: paragraf sebelumnya/berikutnya
- `M`: mirror horizontal
- `F`: fullscreen
- `+` / `-`: perbesar/perkecil teks
- `Esc`: keluar fullscreen (termasuk lewat kontrol browser)

## Pengujian singkat

1. Tempel naskah dan lihat apakah muncul di layar kanan.
2. Geser ukuran teks, jarak baris, dan aktifkan Mirror ↔. Pastikan tulisan pada preview terbalik.
3. Tekan `V`, beri izin mikrofon, ucapkan beberapa kalimat tepat seperti naskah. Teks maju saat dikenali, berhenti saat diam.
4. Impor satu PDF berbasis teks dan satu TXT untuk memastikan parsing berfungsi.
5. Gunakan Fullscreen dan Esc lalu periksa tetap bisa mengontrol naskah.

## Lisensi

Untuk penggunaan pribadi. Jangan mengunggah skrip rahasia ke repository publik; repository hanya perlu berisi **kode situs**, tidak perlu berisi teks naskah pribadi.
