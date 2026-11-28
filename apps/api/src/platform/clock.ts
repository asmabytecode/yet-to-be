/** Порт часу: у тестах підміняється, щоб перевіряти дедлайни без очікування. */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };
