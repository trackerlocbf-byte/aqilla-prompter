# AQILLA PROMPTER V1.1 — Voice Follow + Remote Desview P8

Web teleprompter statis (tanpa server dan tanpa database) untuk digunakan dari Chrome/Edge.

## Baru di V1.1: Dukungan remote Bluetooth Desview P8

**Tampilan V1.0 sama persis.** Seluruh struktur panel, font, dan stylesheet `style.css` tidak diubah. Penambahan hanya adaptor `remote.js` dan `remote.css` (CSS-nya hanya aktif ketika dialog remote dibuka), plus sedikit fungsi kontrol di `app.js`.

### Cara menghubungkan remote ke Windows

1. Pastikan PC/laptop mempunyai Bluetooth. Jika PC tidak memiliki Bluetooth, diperlukan USB Bluetooth adapter.
2. Nyalakan remote Desview P8 lalu buka **Windows Settings → Bluetooth & devices → Add device → Bluetooth**.
3. Pilih remote saat muncul (pada beberapa varian bernama **Desview**) dan selesaikan pairing. Tutup aplikasi lain yang sedang menggunakan remote.
4. Buka AQILLA PROMPTER di Chrome atau Edge. Fokuskan halaman web dengan mengeklik area teks.
5. Tekan tombol remote. Jika varian remote mengirim event keyboard standar, respons bisa langsung bekerja menggunakan profil di bawah.
6. Untuk menyesuaikan tombol remote fisik, tekan **Ctrl + Alt + B** atau **?** saat tidak sedang mengetik naskah. Panel kalibrasi muncul **sementara** di atas tampilan. Klik **Rekam tombol** di salah satu aksi, lalu tekan tombol fisik remote. Ulangi untuk setiap tombol. Setelah itu klik **Selesai**.

### Profil tombol default ketika mode Desview aktif

| Input keyboard dari remote | Aksi |
|---|---|
| Spasi, Enter, Media Play/Pause | Putar/jeda scroll manual |
| Panah atas / Page Up | Mundur sekitar 9 kata |
| Panah bawah / Page Down | Maju sekitar 9 kata |
| Panah kiri / Volume Down | Perlambat scroll manual 10 px/detik |
| Panah kanan / Volume Up | Percepat scroll manual 10 px/detik |

Perintah di atas berlaku pada keyboard biasa juga jika fokus berada di luar kolom ketik. Tombol asli remote bisa memiliki kode berbeda, jadi gunakan panel kalibrasi untuk menyesuaikan. Tersedia juga aksi opsional untuk Voice Follow, Mirror, dan ke awal naskah. **Voice Follow tidak menggunakan pengaturan kecepatan manual**, karena mengikuti hasil pengenalan ucapan.

**Batas kompatibilitas penting:** browser web tidak dapat melakukan pairing Bluetooth HID (remote keyboard) secara langsung menggunakan Web Bluetooth. Pairing dilakukan di Windows, dan situs menerima input keyboard jika remote mengirimkannya ke browser. Sebagian varian remote dapat memakai protokol khusus aplikasi resmi Desview atau mengirim tombol yang diambil alih sistem operasi; dalam kasus ini, pemetaan website saja tidak cukup. Jika dialog 'Rekam tombol' tidak menangkap **satu pun** tombol, jangan menganggap perangkat sudah terhubung ke aplikasi: uji pairing di Windows dan kirim detail model/tombol untuk diagnosa lebih lanjut.

### Update repository GitHub Pages yang sudah ada

1. Unduh dan ekstrak ZIP V1.1.
2. Masuk ke repository `aqilla-prompter` → **Add file → Upload files**.
3. Upload semua **7 file** dari akar folder (`index.html`, `style.css`, `app.js`, `remote.js`, `remote.css`, `README.md`, `.nojekyll`). Untuk nama yang sudah ada, GitHub akan mengganti konten file setelah commit.
4. Commit. Jika GitHub Pages sudah aktif, tidak perlu setup Pages ulang; tunggu deploy, refresh web dengan `Ctrl + F5`.
5. Naskah tidak perlu diupload ke GitHub. Naskah lokal yang telah tersimpan di browser/perangkat yang sama dipertahankan karena storage key V1.0 tetap digunakan, selama data situs belum dihapus.

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
