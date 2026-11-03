import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { DocumentStatus } from '@xs-rag/shared';

export interface DocumentStatusEventPayload {
  documentId: string;
  status: DocumentStatus;
  failureCode?: string | null;
  failureMessage?: string | null;
}

@Injectable()
export class DocumentEventsService {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit(workspaceId: string, payload: DocumentStatusEventPayload): void {
    this.emitter.emit(`events:${workspaceId}`, payload);
  }

  subscribe(
    workspaceId: string,
    listener: (payload: DocumentStatusEventPayload) => void,
  ): () => void {
    const eventName = `events:${workspaceId}`;
    this.emitter.on(eventName, listener);
    return () => {
      this.emitter.off(eventName, listener);
    };
  }
}
