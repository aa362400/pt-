import { AuthController } from '../src/features/auth/auth.controller.js';

describe('AuthController.me', () => {
  it('returns the current persisted 2FA state with the JWT organization context', async () => {
    const authService = {
      getCurrentUserProfile: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'owner@example.com',
        twoFactorEnabled: true,
      }),
    };
    const controller = new AuthController(authService as never);

    await expect(
      controller.me({
        sub: 'user-1',
        email: 'stale@example.com',
        orgId: 'org-1',
        role: 'OWNER',
      }),
    ).resolves.toEqual({
      id: 'user-1',
      email: 'owner@example.com',
      orgId: 'org-1',
      role: 'OWNER',
      twoFactorEnabled: true,
    });
    expect(authService.getCurrentUserProfile).toHaveBeenCalledWith('user-1');
  });
});
