import { BadRequestException } from '@nestjs/common';
import { DeadLetterController } from '../src/features/dead-letter/dead-letter.controller.js';

const user = { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as const;
const replayDto = {
  reason: 'Operator verified the transient queue failure',
  idempotencyKey: 'dead-letter-replay-0001',
};

describe('DeadLetterController', () => {
  it('delegates a single controlled replay to the dead-letter service', async () => {
    const deadLetters = {
      replay: jest.fn().mockResolvedValue({
        replayed: true,
        id: 'dead-agent-1',
        replayRunId: 'agent-retry-1',
      }),
    };
    const controller = new DeadLetterController(deadLetters as never);

    await expect(
      controller.replay(user, 'dead-agent-1', replayDto),
    ).resolves.toEqual(
      expect.objectContaining({ replayRunId: 'agent-retry-1' }),
    );
    expect(deadLetters.replay).toHaveBeenCalledWith(
      user,
      'dead-agent-1',
      replayDto,
    );
  });

  it('keeps unsafe bulk replay disabled', () => {
    const controller = new DeadLetterController({} as never);
    expect(() => controller.replayAll()).toThrow(BadRequestException);
  });

  it('delegates evidence-based triage', async () => {
    const deadLetters = {
      triageOpen: jest.fn().mockResolvedValue({ scanned: 2 }),
    };
    const controller = new DeadLetterController(deadLetters as never);

    await expect(controller.triage(user)).resolves.toEqual({ scanned: 2 });
    expect(deadLetters.triageOpen).toHaveBeenCalledWith(user);
  });
});
