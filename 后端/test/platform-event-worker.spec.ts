import { PlatformEventWorker } from '../src/workers/platform-event.worker.js';

function createWorker() {
  const autonomy = {
    handlePlatformEvent: jest
      .fn()
      .mockResolvedValue({ awarenessTaskId: 'task-1' }),
    handleProductUpdatedEvent: jest
      .fn()
      .mockResolvedValue({ awarenessTaskId: 'task-2' }),
  };
  return { autonomy, worker: new PlatformEventWorker(autonomy as any) };
}

const baseEvent = {
  orgId: 'org-1',
  actorId: 'user-1',
  resourceType: 'Product',
  resourceId: 'product-1',
  data: { title: 'Travel Mug', workspaceId: 'workspace-1' },
  timestamp: '2026-07-09T00:00:00.000Z',
};

describe('PlatformEventWorker', () => {
  it('routes product.created events to agent autonomy awareness', async () => {
    const { worker, autonomy } = createWorker();
    const event = { ...baseEvent, type: 'product.created' };

    const result = await worker.process({
      id: 'job-created',
      data: event,
    } as any);

    expect(autonomy.handlePlatformEvent).toHaveBeenCalledWith(event);
    expect(result).toEqual({
      status: 'processed',
      eventType: 'product.created',
      result: { awarenessTaskId: 'task-1' },
    });
  });

  it('routes product.updated events to the update handler', async () => {
    const { worker, autonomy } = createWorker();
    const event = { ...baseEvent, type: 'product.updated' };

    const result = await worker.process({
      id: 'job-updated',
      data: event,
    } as any);

    expect(autonomy.handleProductUpdatedEvent).toHaveBeenCalledWith(event);
    expect(result).toEqual({
      status: 'processed',
      eventType: 'product.updated',
      result: { awarenessTaskId: 'task-2' },
    });
  });

  it('acknowledges unsupported events without fabricating an autonomy action', async () => {
    const { worker, autonomy } = createWorker();
    const event = { ...baseEvent, type: 'product.ozon-change.requested' };

    const result = await worker.process({
      id: 'job-ignored',
      data: event,
    } as any);

    expect(autonomy.handlePlatformEvent).not.toHaveBeenCalled();
    expect(autonomy.handleProductUpdatedEvent).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'ignored',
      eventType: 'product.ozon-change.requested',
      reason: 'no_handler',
    });
  });

  it('acknowledges malformed events as ignored', async () => {
    const { worker, autonomy } = createWorker();

    const result = await worker.process({
      id: 'job-bad',
      data: { type: 'product.created' },
    } as any);

    expect(autonomy.handlePlatformEvent).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'ignored',
      reason: 'malformed_event',
    });
  });

  it('acknowledges terminal autonomy data errors without retrying old events', async () => {
    const { worker, autonomy } = createWorker();
    const event = { ...baseEvent, type: 'product.created' };
    autonomy.handlePlatformEvent.mockRejectedValueOnce(
      new Error('No active organization user available for agent-owned action'),
    );

    const result = await worker.process({
      id: 'job-no-user',
      data: event,
    } as any);

    expect(result).toEqual({
      status: 'ignored',
      eventType: 'product.created',
      reason: 'terminal_autonomy_error',
      error: 'No active organization user available for agent-owned action',
    });
  });
});
