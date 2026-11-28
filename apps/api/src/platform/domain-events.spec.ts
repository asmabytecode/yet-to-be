import { describe, expect, it, vi } from 'vitest';
import { DomainEventBus } from './domain-events';

describe('DomainEventBus', () => {
  it('delivers payloads to every subscriber in order', async () => {
    const bus = new DomainEventBus();
    const calls: string[] = [];
    bus.subscribe('user.blocked', (p) => {
      calls.push(`a:${p.userId}`);
    });
    bus.subscribe('user.blocked', async (p) => {
      await Promise.resolve();
      calls.push(`b:${p.userId}`);
    });
    await bus.publish('user.blocked', { userId: 'u1', actorId: 'admin' });
    expect(calls).toEqual(['a:u1', 'b:u1']);
  });

  it('does not deliver other events and supports unsubscribe', async () => {
    const bus = new DomainEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('user.blocked', handler);
    await bus.publish('user.unblocked', { userId: 'u1', actorId: 'a' });
    unsubscribe();
    await bus.publish('user.blocked', { userId: 'u1', actorId: 'a' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('propagates handler failures to the publisher', async () => {
    const bus = new DomainEventBus();
    bus.subscribe('role.changed', () => {
      throw new Error('boom');
    });
    await expect(bus.publish('role.changed', { roleId: 'r', actorId: 'a' })).rejects.toThrow(
      'boom',
    );
  });
});
