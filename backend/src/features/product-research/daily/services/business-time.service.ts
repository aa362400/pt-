import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class BusinessTimeService {
  businessDate(at: Date, timezone: string): string {
    const parts = this.parts(at, timezone);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  toDatabaseDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('businessDate must use YYYY-MM-DD');
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(
        'businessDate must be a real calendar date',
      );
    }
    return date;
  }

  nextDailyOccurrence(from: Date, timezone: string, localTime: string): Date {
    this.validateTimezone(timezone);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) {
      throw new BadRequestException('localTime must use HH:mm');
    }
    const [targetHour, targetMinute] = localTime.split(':').map(Number);
    const cursor = new Date(from);
    cursor.setUTCSeconds(0, 0);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
    for (let minute = 0; minute < 60 * 49; minute += 1) {
      const parts = this.parts(cursor, timezone);
      if (
        Number(parts.hour) === targetHour &&
        Number(parts.minute) === targetMinute
      ) {
        return new Date(cursor);
      }
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
    }
    throw new BadRequestException(
      'Unable to resolve the next daily schedule occurrence',
    );
  }

  validateTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(
        new Date(),
      );
    } catch {
      throw new BadRequestException('timezone is not a valid IANA timezone');
    }
  }

  private parts(at: Date, timezone: string) {
    this.validateTimezone(timezone);
    const entries = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
    return Object.fromEntries(
      entries.map((entry) => [entry.type, entry.value]),
    ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
  }
}
