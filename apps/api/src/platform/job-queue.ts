import { Injectable, Logger } from '@nestjs/common';

export type JobHandler = (payload: Record<string, string>) => Promise<void>;

export interface JobOptions {
  /** Скільки разів повторити після помилки. */
  retries?: number;
}

/**
 * Черга фонових задач. Зараз — у процесі API (без Redis): задача стартує після відповіді
 * клієнту і повторюється при збоях. Інтерфейс збігається з тим, що дасть BullMQ (ADR 0006),
 * тож модулі не зміняться при переході.
 */
@Injectable()
export class JobQueue {
  private readonly logger = new Logger(JobQueue.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly pending = new Set<Promise<void>>();

  register(name: string, handler: JobHandler): void {
    if (this.handlers.has(name)) throw new Error(`Job handler "${name}" is already registered`);
    this.handlers.set(name, handler);
  }

  enqueue(name: string, payload: Record<string, string>, options: JobOptions = {}): void {
    const handler = this.handlers.get(name);
    if (handler === undefined) throw new Error(`No handler for job "${name}"`);
    const run = this.run(name, handler, payload, options.retries ?? 2);
    this.pending.add(run);
    void run.finally(() => this.pending.delete(run));
  }

  /** Дочекатися всіх поточних задач (тести, коректна зупинка). */
  async drain(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }

  private async run(
    name: string,
    handler: JobHandler,
    payload: Record<string, string>,
    retries: number,
  ): Promise<void> {
    // Після поточного запиту: клієнт не чекає на обробку.
    await new Promise<void>((resolve) => setImmediate(resolve));
    for (let attempt = 0; ; attempt += 1) {
      try {
        await handler(payload);
        return;
      } catch (error) {
        if (attempt >= retries) {
          this.logger.error(
            `Job "${name}" failed after ${String(attempt + 1)} attempts: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
          return;
        }
      }
    }
  }
}
