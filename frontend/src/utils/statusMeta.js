// Central place mapping raw backend status strings to Vietnamese labels + Bootstrap
// badge classes, so every page/component describes the same status the same way.
// Brand/accent color is Bootstrap's `warning` (gold) per the yellow/black theme.

export const SEGMENT_STATUS_META = {
  cut: { label: "Đã cắt đoạn", badgeClass: "bg-secondary", spinning: false },
  extracting_audio: { label: "Đang trích âm thanh", badgeClass: "bg-warning text-dark", spinning: true },
  transcribing: { label: "Đang nhận diện giọng nói", badgeClass: "bg-warning text-dark", spinning: true },
  transcribed: { label: "Đã có transcript", badgeClass: "bg-success", spinning: false },
  tts_queued: { label: "Đang xếp hàng tạo giọng", badgeClass: "bg-secondary", spinning: true },
  tts_processing: { label: "Đang tạo giọng nói", badgeClass: "bg-warning text-dark", spinning: true },
  tts_done: { label: "Đã tạo giọng nói", badgeClass: "bg-dark text-warning", spinning: false },
  failed: { label: "Lỗi xử lý", badgeClass: "bg-danger", spinning: false },
  tts_failed: { label: "Lỗi tạo giọng nói", badgeClass: "bg-danger", spinning: false },
};

export const JOB_STATUS_META = {
  processing: { label: "Đang xử lý", badgeClass: "bg-warning text-dark", spinning: true },
  transcribed: { label: "Đã có transcript", badgeClass: "bg-success", spinning: false },
  completed: { label: "Hoàn tất", badgeClass: "bg-dark text-warning", spinning: false },
  partial_failure: { label: "Có lỗi một phần", badgeClass: "bg-danger", spinning: false },
};

export function statusMeta(status, kind = "segment") {
  const table = kind === "job" ? JOB_STATUS_META : SEGMENT_STATUS_META;
  return table[status] || { label: status || "—", badgeClass: "bg-secondary", spinning: false };
}

export const JOB_TYPE_LABEL = {
  video: "Video → cắt & đổi giọng",
  audio: "Voice to Text",
};
