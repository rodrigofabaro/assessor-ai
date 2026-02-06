export type ToastTone = "success" | "error" | "warn";

export type ToastDetail = {
  tone: ToastTone;
  text: string;
};

const EVENT_NAME = "assessorai:toast";

export function notifyToast(tone: ToastTone, text: string) {
  if (typeof window === "undefined") return;
  const detail: ToastDetail = { tone, text };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

export function toastEventName() {
  return EVENT_NAME;
}
