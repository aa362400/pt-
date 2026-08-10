import { Injectable } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import { Observable, Subject } from 'rxjs';

export type NotificationStreamEvent =
  | {
      type: 'notification.created';
      notification: Notification;
    }
  | {
      type: 'notification.updated';
      notification: Notification;
    }
  | {
      type: 'notification.deleted';
      organizationId: string;
      userId: string;
      id: string;
    }
  | {
      type: 'notification.read';
      organizationId: string;
      userId: string;
      ids?: string[];
      count: number;
      unreadCount: number;
      readAt: string;
    };

interface NotificationChannel {
  subject: Subject<NotificationStreamEvent>;
  subscribers: number;
}

@Injectable()
export class NotificationEventsService {
  private readonly channels = new Map<string, NotificationChannel>();

  subscribe(
    organizationId: string,
    userId: string,
  ): Observable<NotificationStreamEvent> {
    const channel = this.getOrCreateChannel(organizationId, userId);
    channel.subscribers += 1;
    return channel.subject.asObservable();
  }

  release(organizationId: string, userId: string): void {
    const key = this.channelKey(organizationId, userId);
    const channel = this.channels.get(key);
    if (!channel) return;

    channel.subscribers -= 1;
    if (channel.subscribers <= 0) {
      channel.subject.complete();
      this.channels.delete(key);
    }
  }

  publishCreated(notification: Notification): void {
    this.publish(notification.organizationId, notification.userId, {
      type: 'notification.created',
      notification,
    });
  }

  publishUpdated(notification: Notification): void {
    this.publish(notification.organizationId, notification.userId, {
      type: 'notification.updated',
      notification,
    });
  }

  publishDeleted(notification: Notification): void {
    this.publish(notification.organizationId, notification.userId, {
      type: 'notification.deleted',
      organizationId: notification.organizationId,
      userId: notification.userId,
      id: notification.id,
    });
  }

  publishRead(input: {
    organizationId: string;
    userId: string;
    ids?: string[];
    count: number;
    unreadCount: number;
    readAt: Date;
  }): void {
    this.publish(input.organizationId, input.userId, {
      type: 'notification.read',
      organizationId: input.organizationId,
      userId: input.userId,
      ids: input.ids,
      count: input.count,
      unreadCount: input.unreadCount,
      readAt: input.readAt.toISOString(),
    });
  }

  private publish(
    organizationId: string,
    userId: string,
    event: NotificationStreamEvent,
  ): void {
    const channel = this.channels.get(this.channelKey(organizationId, userId));
    channel?.subject.next(event);
  }

  private getOrCreateChannel(
    organizationId: string,
    userId: string,
  ): NotificationChannel {
    const key = this.channelKey(organizationId, userId);
    let channel = this.channels.get(key);
    if (!channel) {
      channel = {
        subject: new Subject<NotificationStreamEvent>(),
        subscribers: 0,
      };
      this.channels.set(key, channel);
    }
    return channel;
  }

  private channelKey(organizationId: string, userId: string): string {
    return `${organizationId}:${userId}`;
  }
}
