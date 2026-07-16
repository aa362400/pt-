import { AutomationController } from '../src/features/automation/automation.controller.js';
import { ChannelsController } from '../src/features/channels/channels.controller.js';
import { ReviewController } from '../src/features/review/review.controller.js';
import { ROLES_KEY } from '../src/shared/rbac/roles.decorator.js';

const HIGH_RISK_ROLES = ['OWNER', 'ADMIN'];

function expectHighRiskRoles(controller: object, methodName: string) {
  const handler = (controller as Record<string, unknown>)[methodName];
  expect(Reflect.getMetadata(ROLES_KEY, handler as object)).toEqual(
    HIGH_RISK_ROLES,
  );
}

describe('high-risk controller RBAC', () => {
  it.each(['create', 'update', 'trigger', 'recover', 'remove'])(
    'protects AutomationController.%s',
    (methodName) => {
      expectHighRiskRoles(AutomationController.prototype, methodName);
    },
  );

  it.each([
    'create',
    'connectOzon',
    'syncProducts',
    'syncOrders',
    'update',
    'remove',
    'updateSyncStatus',
    'disconnect',
  ])('protects ChannelsController.%s', (methodName) => {
    expectHighRiskRoles(ChannelsController.prototype, methodName);
  });

  it.each([
    'create',
    'update',
    'confirmProductLaunch',
    'confirmProductPublish',
  ])('protects ReviewController.%s', (methodName) => {
    expectHighRiskRoles(ReviewController.prototype, methodName);
  });
});
