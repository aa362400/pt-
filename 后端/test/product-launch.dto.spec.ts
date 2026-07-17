import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ConfirmProductLaunchDto } from '../src/features/product-launch/product-launch.dto.js';

describe('ConfirmProductLaunchDto', () => {
  const basePayload = {
    candidateId: 'cmrocltd800mfpy01ul9u8o0t',
    confirmImageGeneration: true,
    workspaceId: 'cmreju9ik001fuc1w185fp6mn',
    preparationMode: 'CREATIVE_ONLY',
  };

  it('accepts the Prisma CUID returned by the real file upload API', () => {
    const dto = plainToInstance(ConfirmProductLaunchDto, {
      ...basePayload,
      referenceAssetId: 'cmrofd8xl00h7oi019e3mww5g',
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects an unrelated UUID because FileAsset uses Prisma CUID identifiers', () => {
    const dto = plainToInstance(ConfirmProductLaunchDto, {
      ...basePayload,
      referenceAssetId: '11111111-1111-4111-8111-111111111111',
    });

    expect(validateSync(dto)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'referenceAssetId' }),
      ]),
    );
  });
});
