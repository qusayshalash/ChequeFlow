import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';

/** One notification, addressed to one device. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Carried back to the app when the notification is tapped. */
  data: Record<string, string>;
}

/** What became of one message, from the push service's own reply. */
export interface PushOutcome {
  token: string;
  delivered: boolean;
  /** Set when the service says this token will never work again. */
  gone: boolean;
}

/** Expo's reply for a single message. Narrowed from an unknown body. */
interface TicketShape {
  status?: unknown;
  details?: { error?: unknown };
}

/**
 * Handing a notification to Expo's push service.
 *
 * The app is delivered through Expo, so its push service is the one that holds
 * the credentials for both stores; this end only needs the token the device
 * reported. Which means the failure that matters here is not a network error —
 * that is a retry — but a token the service says is dead, because a phone that
 * was wiped or reinstalled keeps its row forever otherwise and every sweep
 * pays to tell it nothing.
 */
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  constructor(private readonly config: AppConfigService) {}

  /** Expo accepts a hundred messages per request; more must be split. */
  private static readonly CHUNK = 100;

  get enabled(): boolean {
    return this.config.push.enabled;
  }

  /**
   * Sends every message and reports, per token, what happened.
   *
   * Never throws. A reminder that could not be delivered has to leave the
   * sweep running for the next one, and a push service being down is not a
   * reason for the API to start failing.
   */
  async send(messages: readonly PushMessage[]): Promise<PushOutcome[]> {
    if (messages.length === 0) return [];

    const outcomes: PushOutcome[] = [];
    for (let at = 0; at < messages.length; at += ExpoPushService.CHUNK) {
      const chunk = messages.slice(at, at + ExpoPushService.CHUNK);
      outcomes.push(...(await this.sendChunk(chunk)));
    }
    return outcomes;
  }

  private async sendChunk(chunk: readonly PushMessage[]): Promise<PushOutcome[]> {
    try {
      const response = await fetch(this.config.push.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        this.logger.warn(`Push service answered ${response.status}`);
        return chunk.map((message) => ({ token: message.to, delivered: false, gone: false }));
      }

      const body: unknown = await response.json();
      const tickets = readTickets(body);

      return chunk.map((message, index) => {
        const ticket = tickets[index];
        // No ticket at all is a malformed reply, not a dead token: treat it as
        // undelivered and let the token live.
        if (!ticket) return { token: message.to, delivered: false, gone: false };
        return {
          token: message.to,
          delivered: ticket.status === 'ok',
          gone: ticket.details?.error === 'DeviceNotRegistered',
        };
      });
    } catch (caught) {
      this.logger.warn(`Push service unreachable: ${String(caught)}`);
      return chunk.map((message) => ({ token: message.to, delivered: false, gone: false }));
    }
  }
}

/** Expo answers `{ data: [ticket, …] }`; anything else is not a ticket list. */
function readTickets(body: unknown): TicketShape[] {
  if (typeof body !== 'object' || body === null) return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.map((entry) =>
    typeof entry === 'object' && entry !== null ? (entry as TicketShape) : {},
  );
}
