export enum WorkspaceRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum DocumentSourceType {
  PDF = 'PDF',
  DOCX = 'DOCX',
  MARKDOWN = 'MARKDOWN',
  WEB = 'WEB',
}

export enum DocumentStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}

export enum DocumentVisibility {
  ALL_MEMBERS = 'ALL_MEMBERS',
  ADMINS_ONLY = 'ADMINS_ONLY',
  SELECTED = 'SELECTED',
}

export enum PrincipalType {
  USER = 'USER',
  VISITOR = 'VISITOR',
  WIDGET = 'WIDGET',
  API_KEY = 'API_KEY',
}

export enum MessageRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
}

export enum MessageStatus {
  STREAMING = 'STREAMING',
  COMPLETE = 'COMPLETE',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
}

export enum AnswerOutcome {
  ANSWERED = 'ANSWERED',
  UNANSWERED = 'UNANSWERED',
}

export enum FeedbackRating {
  UP = 'UP',
  DOWN = 'DOWN',
}

export enum ApiKeyKind {
  SERVER = 'SERVER',
  WIDGET = 'WIDGET',
}

export enum EvalRunStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
