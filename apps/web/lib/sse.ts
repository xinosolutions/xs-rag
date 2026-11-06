export interface SseEvent<T = unknown> {
  event: string;
  data: T;
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        if (!block.trim()) continue;
        const lines = block.split('\n');
        let event = 'message';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            event = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            dataStr = line.slice(6);
          } else if (line.startsWith('data:')) {
            dataStr = line.slice(5);
          }
        }

        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            yield { event, data };
          } catch {
            yield { event, data: dataStr };
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
