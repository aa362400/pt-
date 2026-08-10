import { tokenStore } from './client';

/**
 * Subscribe to Server-Sent Events for agent run progress.
 * Uses fetch streaming so the request can carry Authorization.
 */
export function subscribeToAgentRun(
  runId: string,
  onProgress: (data: any) => void,
  onComplete: (data: any) => void,
  onError: (error: string) => void,
): () => void {
  const baseUrl: string =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const abortController = new AbortController();
  let closedByEvent = false;

  const handleEvent = (eventType: string, rawData: string) => {
    let payload: any;
    try {
      payload = JSON.parse(rawData);
    } catch {
      return;
    }

    if (eventType === 'agent-run-progress') {
      onProgress(payload);
      return;
    }

    if (eventType === 'agent-run-completed') {
      closedByEvent = true;
      onComplete(payload);
      abortController.abort();
      return;
    }

    if (eventType === 'agent-run-failed') {
      closedByEvent = true;
      onError(payload?.data?.message || 'Task failed');
      abortController.abort();
    }
  };

  const parseSseBlock = (block: string) => {
    let eventType = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        eventType = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }
    if (dataLines.length > 0) {
      handleEvent(eventType, dataLines.join('\n'));
    }
  };

  void (async () => {
    try {
      const token = tokenStore.getAccessToken();
      const locale = localStorage.getItem('i18nextLng') || 'zh-CN';
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        'X-Locale': locale,
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(`${baseUrl}/sse/agent-runs/${runId}`, {
        headers,
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`SSE connection failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (block.trim()) {
            parseSseBlock(block);
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (error) {
      if (!abortController.signal.aborted && !closedByEvent) {
        onError(error instanceof Error ? error.message : 'SSE connection failed');
      }
    }
  })();

  return () => {
    abortController.abort();
  };
}
