import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { uk } from './uk';

/** Ініціалізація i18n. Імпортується один раз на старті застосунку (і в тестах). */
void i18n.use(initReactI18next).init({
  resources: { uk: { translation: uk } },
  lng: 'uk',
  fallbackLng: 'uk',
  interpolation: { escapeValue: false },
  // Ключі прав містять двокрапку (`events:read`); у i18next це роздільник простору імен,
  // тож без цього `permissions.events:read` перетворювався б на «read». Простір імен у нас один.
  nsSeparator: false,
});

export { i18n };
