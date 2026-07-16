import type { Notification } from '@prisma/client';
import { NotificationEventsService } from '../src/features/notifications/notification-events.service.js';

function notification(
  id: string,
  organizationId = 'org-1',
  userId = 'user-1',
): Notification {
  return {
    id,
    organizationId,
    userId,
    type: 'SYSTEM',
    title: 'Agent notification',
    body: null,
    readAt: null,
    metadata: {},
    createdAt: new Date('2026-07-08T00:00:00.000Z'),
  };
}

describe('NotificationEventsService', () => {
  it('publishes created notifications only to the matching org and user stream', () => {
    const service = new NotificationEventsService();
    const matchingEvents: unknown[] = [];
    const otherUserEvents: unknown[] = [];

    const matchingSubscription = service
      .subscribe('org-1', 'user-1')
      .subscribe((event) => matchingEvents.push(event));
    const otherUserSubscription = service
      .subscribe('org-1', 'user-2')
      .subscribe((event) => otherUserEvents.push(event));

    service.publishCreated(notification('notification-1'));

    expect(matchingEvents).toEqual([
      {
        type: 'notification.created',
        notification: notification('notification-1'),
      },
    ]);
    expect(otherUserEvents).toEqual([]);

    matchingSubscription.unsubscribe();
    otherUserSubscription.unsubscribe();
    service.release('org-1', 'user-1');
    service.release('org-1', 'user-2');
  });

  it('does not deliver events after the stream is released', () => {
    const service = new NotificationEventsService();
    const events: unknown[] = [];
    const subscription = service
      .subscribe('org-1', 'user-1')
      .subscribe((event) => events.push(event));

    subscription.unsubscribe();
    service.release('org-1', 'user-1');
    service.publishCreated(notification('notification-1'));

    expect(events).toEqual([]);
  });
});
