import { Injectable } from '@nestjs/common';

/** Перевірка, чи використовується файл (обкладинка події, фото спікера…). */
export type MediaUsageChecker = (assetId: string) => Promise<boolean>;

/**
 * Інверсія залежності: модуль медіа не знає про події, а події реєструють тут свою
 * перевірку. Так файл, на який хтось посилається, не видалиться, а модулі не утворять цикл.
 */
@Injectable()
export class MediaUsageRegistry {
  private readonly checkers: MediaUsageChecker[] = [];

  register(checker: MediaUsageChecker): void {
    this.checkers.push(checker);
  }

  async isInUse(assetId: string): Promise<boolean> {
    for (const checker of this.checkers) {
      if (await checker(assetId)) return true;
    }
    return false;
  }
}
