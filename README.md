# Voice To Text Studio

Web app: upload video dài → cắt tự động thành các đoạn ~1 phút → nhận diện giọng nói
(speech-to-text) thành transcript + file SRT cho mỗi đoạn → chọn giọng và tạo lại audio
bằng [Resona.live](https://resona.live) (text-to-speech) → **ghép giọng mới vào video, giữ
nguyên nhạc nền gốc** thành 1 video hoàn chỉnh. Có thêm trang "Voice to Text" độc lập để
chuyển 1 file audio/video ngắn thành văn bản ngay.

## Kiến trúc

- **Backend**: Node.js (Express) + [BullMQ](https://docs.bullmq.io/) (hàng đợi job chạy trên Redis) + ffmpeg + faster-whisper (STT) + Resona API client (TTS).
- **Frontend**: React (Vite) + Bootstrap 5 (dark mode, theme vàng-đen qua `--bs-*` override + màu `warning`).
- **Redis**: chỉ còn vai trò hàng đợi — BullMQ queue cho 4 bước xử lý nặng (cắt video, transcribe, gọi TTS + polling Resona, ghép video) và cache kết quả `GET /api/v2/voices`. Chạy nền hoàn toàn độc lập với request HTTP (worker xử lý ẩn, không cần giữ tab trình duyệt mở).
- **SQLite** (`better-sqlite3`): lưu trữ bền vững cho `jobs` và `segments` — lịch sử job, transcript, trạng thái từng đoạn. File DB nằm ở `backend/storage/voicetext.sqlite3`, không cần chạy server DB riêng.

Pipeline video:

```
upload video → [videoQueue] ffmpeg cắt đoạn N giây (mặc định 60s)
             → mỗi đoạn vào [transcribeQueue]: ffmpeg trích audio wav 16kHz
               → faster-whisper transcribe → ghi file .srt + transcriptText
             → người dùng xem/sửa transcript, nghe thử giọng, chọn voice_id (Resona)
               (từng đoạn, hoặc "tạo hàng loạt" cho tất cả đoạn cùng lúc)
             → [ttsQueue] (concurrency 1): gọi Resona riêng cho từng cue SRT, giữ start/end
               từng cue và căn audio vào timeline đoạn video
             → [mergeQueue]: trộn track voice đã căn SRT với audio gốc (nhạc nền giữ ở volume
               thấp), rồi nối các đoạn lại thành 1 video
```

Toàn bộ 4 bước nặng chạy trong BullMQ worker — tiến trình nền độc lập với request HTTP,
không chặn server và không cần giữ trình duyệt mở; `jobs`/`segments` trong SQLite được cập
nhật dần, frontend chỉ poll `GET /api/jobs/:id` để đọc trạng thái mới nhất.

## Yêu cầu hệ thống

- Node.js 18+ (đã test với Node 22)
- Python 3.9+ (đã test với 3.13) — cho faster-whisper (STT)
- `ffmpeg` + `ffprobe` (cài qua `brew install ffmpeg`)
- `redis-server` (cài qua `brew install redis`)

## Cài đặt

### 1. Redis

```bash
redis-server            # hoặc: brew services start redis
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env    # rồi điền RESONA_API_KEY khi có

# venv riêng cho faster-whisper
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

Trong `backend/.env`, đặt:
```
WHISPER_PYTHON=./.venv/bin/python
```

SQLite không cần cài đặt hay chạy server riêng — file DB tự tạo ở
`backend/storage/voicetext.sqlite3` khi backend khởi động lần đầu.

Chạy backend (server + 4 worker BullMQ trong cùng 1 process):
```bash
npm run dev     # http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
npm install
```

### 4. Chạy backend + frontend cùng lúc

Ở thư mục gốc (`TOOLVOICETOTECH/`):

```bash
npm install   # cài concurrently (chỉ cần 1 lần)
npm run dev   # chạy backend (:4000) + frontend (:5173) cùng lúc
```

Mở `http://localhost:5173`. Nhấn `Ctrl+C` để dừng cả hai.

(Vẫn có thể chạy riêng từng cái bằng `npm run dev` trong `backend/` hoặc `frontend/` nếu muốn.)

## Resona API key

Tạo access token tại trang Cài đặt tài khoản trên resona.live (bản v2, không dùng key tạo
trước đó vì sẽ bị lỗi `insufficient_scope`), rồi điền vào `backend/.env`:

```
RESONA_API_KEY=xxx
```

Không có key, trang "Voices" và nút "Tạo giọng nói" sẽ trả lỗi rõ ràng
(`RESONA_API_KEY chưa được cấu hình`); phần upload video/audio → transcript/SRT vẫn chạy
bình thường vì không phụ thuộc Resona.

## Giới hạn / điểm cần biết

- `scripts/transcribe.py` load lại model whisper mỗi lần gọi (đơn giản nhưng chậm khi
  nhiều job cùng lúc) — muốn nhanh hơn thì tách thành một Python service chạy thường trực.
- Cắt video dùng `-c copy` (không re-encode) nên ranh giới đoạn có thể lệch vài trăm ms
  theo keyframe gần nhất, không chính xác tuyệt đối 4:00.
- Mỗi đoạn được Whisper tự nhận diện ngôn ngữ; phụ đề/ngữ liệu voice được dịch sang tiếng Việt
  bằng `deep-translator` (Google Translate) nếu ngôn ngữ nguồn không phải tiếng Việt. Cài thư viện
  bằng `pip install -r backend/requirements.txt`. Dịch cần Internet và có thể bị giới hạn bởi
  Google Translate. SRT toàn video cộng timestamp theo vị trí đoạn.
- Resona request timeout mặc định là 120 giây (`RESONA_REQUEST_TIMEOUT_MS` trong `backend/.env`),
  để các lần gửi văn bản dài không bị ngắt ở mốc 30 giây.
- Ghép video: nhạc nền gốc được giữ lại ở volume thấp (25%) làm nền, giọng mới làm chủ đạo;
  độ dài mỗi đoạn sau ghép luôn bằng độ dài video gốc (giọng mới bị cắt bớt nếu dài hơn,
  hoặc có khoảng lặng nếu ngắn hơn).
- `npm audit` còn vài cảnh báo moderate ở frontend (`vite`/`react-router`, chủ yếu liên
  quan dev-server CORS và SSR) — chấp nhận được cho chạy local, nên chạy
  `npm audit fix --force` + kiểm tra lại trước khi deploy ra ngoài.
