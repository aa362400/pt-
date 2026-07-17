import { PATH_METADATA } from '@nestjs/common/constants.js';
import { AgentChannelHealthController } from '../src/features/agent-console/agent-console.controller.js';

describe('AgentChannelHealthController', () => {
  it('exposes the authenticated agent-console/channel-health endpoint', async () => {
    const snapshot = { agentConnection: 'connected', overall: 'available' };
    const health = { getChannelHealth: jest.fn().mockResolvedValue(snapshot) };
    const controller = new AgentChannelHealthController(health as never);

    await expect(controller.get()).resolves.toBe(snapshot);
    expect(health.getChannelHealth).toHaveBeenCalledTimes(1);
    expect(Reflect.getMetadata(PATH_METADATA, AgentChannelHealthController)).toBe(
      'agent-console',
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, AgentChannelHealthController.prototype.get),
    ).toBe('channel-health');
  });
});
