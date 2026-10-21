ài liệu API
Truy cập trực tiếp khả năng tạo nội dung của Resona thông qua HTTP API.

URL cơ sở
https://resona.live
Xác thực
Tất cả các yêu cầu API đều cần Bearer Token. Bạn có thể tạo access token tùy chỉnh từ trang Cài đặt tài khoản.

Header
Authorization: Bearer YOUR_ACCESS_TOKEN
Cấp lại API key cho v2
API key tạo trước v2 chỉ có quyền v1 và sẽ nhận lỗi 403 insufficient_scope khi gọi v2. Hãy tạo lại key trong phần Cài đặt để có quyền truy cập v2.

GET
/api/v2/voices
Tìm kiếm và liệt kê các giọng nói có sẵn. Trả về giọng nói công khai và giọng nói clone của bạn với bộ lọc, sắp xếp và phân trang.

Ví dụ cURL
curl "https://resona.live/api/v2/voices?gender=female&sort=usage_count" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
Tham số truy vấn
Tên	Kiểu	Mặc định	Mô tả
search	string	—	Lọc theo tên, giọng hoặc thẻ
gender	string	—	Lọc theo giới tính giọng. Một trong: male | female | neutral
category	string	—	Lọc theo loại giọng. Một trong: cloned (giọng nói của bạn) | public
sort	string	created_at	Trường sắp xếp kết quả. Một trong: created_at | name | usage_count
sort_direction	string	desc	Thứ tự sắp xếp. Một trong: asc | desc
page_size	integer	20	Số kết quả mỗi trang (tối đa 100)
next_page_token	string	—	Token phân trang từ phản hồi trước
voice_ids	string	—	Danh sách Voice ID cách nhau bởi dấu phẩy (tối đa 100)
include_total_count	boolean	true	Có trả về total_count hay không (mặc định: true)
Phản hồi
{
  "voices": [
    {
      "voice_id": "abc123",
      "name": "Sarah",
      "gender": "female",
      "accent": "American",
      "tags": ["conversational", "warm"],
      "category": "public",
      "preview_url": "https://storage.googleapis.com/.../preview.wav",
      "quality": 85,
      "is_featured": true,
      "is_owner": false,
      "usage_count": 1250,
      "created_at_unix": 1711929600,
      "updated_at_unix": 1711929600
    }
  ],
  "has_more": true,
  "total_count": 42,
  "next_page_token": "MjA="
}
POST
/api/v2/generate-text
Tạo cuộc hội thoại tự nhiên giữa nhiều người nói dựa trên prompt.

Ví dụ cURL
curl -X POST "https://resona.live/api/v2/generate-text" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a short conversation about renewable energy",
    "speaker_profiles": [
      {
        "name": "Thanh Nga",
        "gender": "female",
        "description": "Environmental scientist"
      },
      {
        "name": "Thành Long",
        "gender": "male",
        "description": "Policy expert"
      }
    ],
    "temperature": 0.7,
    "topic": "Renewable energy",
    "style": "casual"
  }'
Nội dung yêu cầu
{
  "prompt": "Create a short conversation about renewable energy",
  "speaker_profiles": [
    {
      "name": "Thanh Nga",
      "gender": "female",
      "description": "Environmental scientist"
    },
    {
      "name": "Thành Long",
      "gender": "male",
      "description": "Policy expert"
    }
  ],
  "temperature": 0.7,
  "topic": "Renewable energy",
  "style": "casual"
}
Phản hồi
{
  "text": "Speaker 1: ... \nSpeaker 2: ...",
  "format": [
    { "speaker": 1, "text": "..." },
    { "speaker": 2, "text": "..." }
  ],
  "speaker_profiles": [
    { "speaker": 1, "name": "Thanh Nga", "gender": "female", "description": "Environmental scientist" },
    { "speaker": 2, "name": "Thành Long", "gender": "male", "description": "Policy expert" }
  ],
  "language": "vi",
  "topic": "Renewable energy",
  "style": "casual",
  "num_turns": 2,
  "usage": {
    "prompt_tokens": 120,
    "completion_tokens": 80,
    "total_tokens": 200,
    "credits_used": 125
  }
}
Trường usage trả về số token/credit thực tế đã dùng, theo snake_case.

Để xử lý tự động, dùng mảng format thay vì chuỗi text đã gộp: mỗi phần tử gồm speaker (số thứ tự người nói, khớp với nhãn Speaker N trong text) và text. Ghép format[].speaker với speaker_profiles[].speaker để lấy tên và thuộc tính người nói. Các trường language, num_turns cung cấp thêm metadata, và topic, style được trả lại từ đầu vào (nếu có).

Lưu ý: Tên người nói từ speaker_profiles được AI sử dụng để tạo tính cách và giọng điệu, nhưng đầu ra sử dụng nhãn chung Speaker 1, Speaker 2.

Tham số yêu cầu
Tên	Kiểu	Mặc định	Mô tả
prompt	string	—	Mô tả nội dung hội thoại cần tạo (bắt buộc)
speaker_profiles	array	—	Danh sách hồ sơ người nói: name (bắt buộc), gender, accent, age, description
temperature	number	0.7	Độ ngẫu nhiên, từ 0 đến 2
min_num_turns	integer	2	Số lượt thoại tối thiểu (>= 1)
max_num_turns	integer	6	Số lượt thoại tối đa (>= min_num_turns)
topic	string	—	Chủ đề tùy chọn để định hướng hội thoại
style	string	—	reluctant, confident, casual
max_length	number	—	Độ dài tối đa mong muốn của đầu ra
POST
/api/v2/text-to-speech
Chuyển văn bản thuần của một người nói thành giọng nói với một Voice ID. Không cần nhãn "Speaker N:" — server tự xử lý định dạng nội bộ. Đây là thao tác bất đồng bộ.

Ví dụ cURL
curl -X POST "https://resona.live/api/v2/text-to-speech" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Xin chào, hôm nay chúng ta sẽ nói về công nghệ AI.",
    "voice_id": "voice_id_1",
    "language": "vi"
  }'
Tham số yêu cầu
Tên	Kiểu	Mặc định	Mô tả
text	string	—	Văn bản thuần cần chuyển thành giọng nói (bắt buộc)
voice_id	string	—	Voice ID dùng cho toàn bộ văn bản (bắt buộc)
language	string	vi	Ngôn ngữ dùng để chuẩn hóa văn bản cho TTS: "vi" hoặc "en"
Phản hồi
{
  "request_id": "req_123456789",
  "status": "processing",
  "message": "Speech generation job submitted successfully",
  "usage": { "required_credits": 123 }
}
Giới hạn credit mỗi yêu cầu
Mỗi yêu cầu phải tiêu tốn từ 50 đến 2.000 credit giọng nói (1 credit ≈ 1 ký tự sau khi bỏ khoảng trắng và nhãn "Speaker N:"). Yêu cầu nằm ngoài khoảng này sẽ bị từ chối với mã lỗi section_credit_limit_exceeded (HTTP 422).

Tự động chuẩn hóa văn bản
Trước khi gửi, văn bản của bạn được chuẩn hóa cho TTS - số, ngày, giờ, viết tắt và acronym được đọc thành lời để phát âm tự nhiên; ";" được thay bằng "." và ":" thay bằng ",". Đặt trường language để chọn bộ chuẩn hóa phù hợp.

GET
/api/v2/text-to-speech/:request_id
Endpoint gộp trạng thái và kết quả: khi đang xử lý trả về trạng thái; khi hoàn thành trả về kết quả đầy đủ kèm URL âm thanh. Credit giọng nói được trừ ở lần đọc kết quả hoàn thành đầu tiên.

Ví dụ cURL
curl "https://resona.live/api/v2/text-to-speech/req_123456789" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
Phản hồi (đang xử lý)
{
  "request_id": "req_123456789",
  "status": "processing",
  "created_at": "2026-06-10T10:00:00Z",
  "updated_at": "2026-06-10T10:00:05Z"
}
Phản hồi (hoàn thành)
{
  "request_id": "req_123456789",
  "status": "completed",
  "text": "Xin chào, hôm nay chúng ta sẽ nói về công nghệ AI.",
  "voice_id": "voice_id_1",
  "audio_urls": [
    "https://storage.googleapis.com/.../audio.wav"
  ],
  "created_at": "2026-06-10T10:00:00Z",
  "updated_at": "2026-06-10T10:00:05Z"
}
Các giá trị trạng thái có thể: processing, completed, failed

Khi hoàn thành, phản hồi kèm text (văn bản gốc bạn đã gửi), voice_id và audio_urls. Khi thất bại, phản hồi kèm error_code (repeated_text, quality_check_failed, generation_timeout, voice_sample_unavailable, user_concurrency_limit, rate_limited, generation_failed) và error (mô tả dễ đọc). Không có độ dài tối thiểu — hãy gửi câu ngắn một lần, đừng lặp lại câu để kéo dài văn bản (repeated_text).

POST
/api/v2/text-to-dialogue
Tạo hội thoại nhiều người nói từ mảng các lượt thoại, mỗi lượt gồm văn bản thuần và Voice ID riêng. Đây là thao tác bất đồng bộ.

Ví dụ cURL
curl -X POST "https://resona.live/api/v2/text-to-dialogue" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": [
      { "text": "Xin chào, hôm nay chúng ta nói về AI nhé.", "voice_id": "voice_id_1" },
      { "text": "Chào bạn, chủ đề này thú vị đấy.", "voice_id": "voice_id_2" },
      { "text": "Bắt đầu với khái niệm cơ bản nào.", "voice_id": "voice_id_1" }
    ],
    "language": "vi"
  }'
Tham số yêu cầu
Tên	Kiểu	Mặc định	Mô tả
input	array	—	Mảng lượt thoại theo thứ tự, 1–200 phần tử (bắt buộc)
input[].text	string	—	Nội dung lượt thoại, văn bản thuần (bắt buộc)
input[].voice_id	string	—	Voice ID của lượt thoại này — tối đa 6 giọng khác nhau trong một yêu cầu (bắt buộc)
language	string	vi	Ngôn ngữ dùng để chuẩn hóa văn bản cho TTS: "vi" hoặc "en"
Các lượt dùng cùng voice_id sẽ do cùng một giọng đọc; thứ tự giọng được gán theo lần xuất hiện đầu tiên của mỗi voice_id.

Phản hồi
{
  "request_id": "req_123456789",
  "status": "processing",
  "message": "Speech generation job submitted successfully",
  "usage": { "required_credits": 123 }
}
Giới hạn credit mỗi yêu cầu
Mỗi yêu cầu phải tiêu tốn từ 50 đến 2.000 credit giọng nói (1 credit ≈ 1 ký tự sau khi bỏ khoảng trắng và nhãn "Speaker N:"). Yêu cầu nằm ngoài khoảng này sẽ bị từ chối với mã lỗi section_credit_limit_exceeded (HTTP 422).

Tự động chuẩn hóa văn bản
Trước khi gửi, văn bản của bạn được chuẩn hóa cho TTS - số, ngày, giờ, viết tắt và acronym được đọc thành lời để phát âm tự nhiên; ";" được thay bằng "." và ":" thay bằng ",". Đặt trường language để chọn bộ chuẩn hóa phù hợp.

GET
/api/v2/text-to-dialogue/:request_id
Endpoint gộp trạng thái và kết quả: khi đang xử lý trả về trạng thái; khi hoàn thành trả về kết quả đầy đủ kèm URL âm thanh. Credit giọng nói được trừ ở lần đọc kết quả hoàn thành đầu tiên.

Ví dụ cURL
curl "https://resona.live/api/v2/text-to-dialogue/req_123456789" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
Phản hồi (đang xử lý)
{
  "request_id": "req_123456789",
  "status": "processing",
  "created_at": "2026-06-10T10:00:00Z",
  "updated_at": "2026-06-10T10:00:05Z"
}
Phản hồi (hoàn thành)
{
  "request_id": "req_123456789",
  "status": "completed",
  "input": [
    { "text": "Xin chào, hôm nay chúng ta nói về AI nhé.", "voice_id": "voice_id_1" },
    { "text": "Chào bạn, chủ đề này thú vị đấy.", "voice_id": "voice_id_2" }
  ],
  "audio_urls": [
    "https://storage.googleapis.com/.../audio.wav"
  ],
  "created_at": "2026-06-10T10:00:00Z",
  "updated_at": "2026-06-10T10:00:05Z"
}
Các giá trị trạng thái có thể: processing, completed, failed

Khi hoàn thành, phản hồi kèm input (các lượt thoại gốc bạn đã gửi) và audio_urls. Khi thất bại, phản hồi kèm error_code và error, giống endpoint text-to-speech.

Lỗi
Mọi lỗi v2 đều trả về cùng một cấu trúc. status là mã máy-đọc, message là mô tả cho người đọc.

Phản hồi
{
  "detail": {
    "status": "voice_not_found",
    "message": "Voice not found: abc123"
  }
}
Mã status	Mã phản hồi HTTP	Khi nào
missing_authorization	401	Thiếu hoặc sai header Authorization
invalid_token	401	Token sai hoặc đã hết hạn
insufficient_scope	403	Token không đủ quyền (scope) — hãy cấp lại key
email_not_verified	403	Email chưa được xác minh — hãy mở email xác minh trước khi dùng API
insufficient_speech_credits	403	Không đủ credit giọng nói
insufficient_text_credits	403	Không đủ credit văn bản
voice_not_found	404	voice_id không tồn tại
request_not_found	404	request_id không tồn tại
validation_error	422	Dữ liệu vào không hợp lệ (sai schema)
section_credit_limit_exceeded	422	Văn bản vượt quá giới hạn 2.000 credit cho mỗi yêu cầu
invalid_request	400	Yêu cầu không phân tích được (JSON/token hỏng)
internal_error	500	Lỗi máy chủ
Mẹo
Giữ các đoạn văn bản dưới 2 phút: Chia các bản ghi dài thành các đoạn ngắn hơn trước khi gửi đến API để có chất lượng tạo giọng nói tốt hơn.
Xử lý ảo giác: Nếu âm thanh được tạo có phát âm sai hoặc lỗi, hãy thử diễn đạt lại các từ cụ thể hoặc điều chỉnh dấu câu và chữ hoa trong văn bản đầu vào.