export const LockedCopy = {
  NO_ANSWER: "I don't know based on the documents available to you.",
  DEMO_LIMIT: "You've reached the demo limit of 10 questions. Please try again in 24 hours.",
  WIDGET_LIMIT: "You've reached the question limit for now. Please try again later.",
  CITATION_UNAVAILABLE: "This source is no longer available to you.",
  ANSWER_STOPPED: "Answer stopped.",
  CHAT_EMPTY: "Ask a question about your documents.",
  DOCS_EMPTY_ADMIN: "Upload a document to get started.",
  DOCS_EMPTY_MEMBER: "No documents are ready yet.",
  STATUS_PROCESSING: "Processing",
  STATUS_READY: "Ready",
  STATUS_FAILED: "Failed",
  LLM_UNAVAILABLE: "The AI service is unavailable right now. Please try again.",
  RATE_LIMITED: "Too many requests. Please wait a moment.",
  GENERIC_ERROR: "Something went wrong. Please try again.",
  LOGIN_FAILED: "Email or password is incorrect.",
  RESET_SENT: "If that email has an account, a reset link is on its way.",
  NOT_ALLOWED: "You don't have access to this page.",
} as const;

export function formatCitationLabel(params: {
  fileName: string;
  page?: number | null;
  heading?: string | null;
}): string {
  const parts: string[] = [params.fileName];
  if (params.page !== undefined && params.page !== null) {
    parts.push(`p. ${params.page}`);
  }
  if (params.heading) {
    parts.push(params.heading);
  }
  return parts.join(' · ');
}
