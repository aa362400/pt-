import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ManualDailyResearchRunDto } from '../src/features/product-research/daily/daily-product-research.dto.js';

describe('daily product research HTTP DTO', () => {
  it('preserves candidate evidence objects with production implicit conversion enabled', async () => {
    const payload = {
      workspaceId: 'workspace-1',
      candidateLimit: 10,
      topLimit: 3,
      seedQueries: ['lightweight home organizer', 'compact storage accessory'],
      inputCandidates: [
        {
          source: 'manual',
          externalId: 'candidate-1',
          name: 'Personalized wooden pen',
          signals: [{ metricName: 'orders', metricValue: '12' }],
        },
      ],
    };
    const dto = plainToInstance(ManualDailyResearchRunDto, payload, {
      enableImplicitConversion: true,
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
    expect(Array.isArray(dto.inputCandidates)).toBe(true);
    expect(dto.seedQueries).toEqual(payload.seedQueries);
    expect((dto.inputCandidates as unknown[])[0]).toEqual(
      payload.inputCandidates[0],
    );
  });
});
