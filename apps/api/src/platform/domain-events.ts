import { Injectable, Logger } from '@nestjs/common';

/**
 * Доменні події між модулями. Модуль публікує факт («користувача заблоковано»), а інші
 * реагують, не знаючи про відправника. Нова подія додається сюди з типом payload.
 */
export interface DomainEventMap {
  'user.blocked': { userId: string; actorId: string };
  'user.unblocked': { userId: string; actorId: string };
  'role.changed': { roleId: string; actorId: string };
  'event.published': { eventId: string; actorId: string };
}

export type DomainEventName = keyof DomainEventMap;
type Handler<K extends DomainEventName> = (payload: DomainEventMap[K]) => Promise<void> | void;
type AnyHandler = (payload: unknown) => Promise<void> | void;

/**
 * In-process шина: обробники виконуються послідовно, помилка обробника доходить до відправника.
 * Перехід на transactional outbox описано в ADR 0006 — інтерфейс для модулів не зміниться.
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);
  private readonly handlers = new Map<DomainEventName, AnyHandler[]>();

  /** Підписка; повертає функцію відписки. */
  subscribe<K extends DomainEventName>(name: K, handler: Handler<K>): () => void {
    const list = this.handlers.get(name) ?? [];
    const entry = handler as unknown as AnyHandler;
    list.push(entry);
    this.handlers.set(name, list);
    return () => {
      const current = this.handlers.get(name) ?? [];
      this.handlers.set(
        name,
        current.filter((item) => item !== entry),
      );
    };
  }

  async publish<K extends DomainEventName>(name: K, payload: DomainEventMap[K]): Promise<void> {
    const list = this.handlers.get(name) ?? [];
    for (const handler of list) {
      try {
        await handler(payload);
      } catch (error) {
        this.logger.error(`Handler for "${name}" failed`);
        throw error;
      }
    }
  }
}
