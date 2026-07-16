import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, Subject } from 'rxjs';

export interface SseEvent {
  type: 'agent-run-progress' | 'agent-run-completed' | 'agent-run-failed';
  runId: string;
  data: unknown;
}

@Injectable()
export class SseService {
  private subjects = new Map<string, Subject<SseEvent>>();

  constructor(private eventEmitter: EventEmitter2) {
    // Listen for progress events forwarded by agent-runs service
    this.eventEmitter.on('agent-run.progress', (payload: SseEvent) => {
      const subject = this.subjects.get(payload.runId);
      if (subject) {
        subject.next(payload);
      }
    });

    this.eventEmitter.on('agent-run.completed', (payload: SseEvent) => {
      const subject = this.subjects.get(payload.runId);
      if (subject) {
        subject.next(payload);
        subject.complete();
        this.subjects.delete(payload.runId);
      }
    });

    this.eventEmitter.on('agent-run.failed', (payload: SseEvent) => {
      const subject = this.subjects.get(payload.runId);
      if (subject) {
        subject.next(payload);
        subject.complete();
        this.subjects.delete(payload.runId);
      }
    });
  }

  /** Subscribe to events for a specific agent run */
  subscribe(runId: string): Observable<SseEvent> {
    if (!this.subjects.has(runId)) {
      this.subjects.set(runId, new Subject<SseEvent>());
    }
    return this.subjects.get(runId)!.asObservable();
  }

  /** Clean up after a client disconnects */
  unsubscribe(runId: string): void {
    const subject = this.subjects.get(runId);
    if (subject) {
      subject.complete();
      this.subjects.delete(runId);
    }
  }
}
