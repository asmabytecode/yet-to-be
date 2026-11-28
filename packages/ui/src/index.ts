// Спільні компоненти й клієнт API для web і admin. Без inline-стилів і сирого HTML (строгий CSP).
export { Badge } from './badge';
export { Button, linkButtonClass } from './button';
export { Card, Spinner } from './card';
export { cn } from './cn';
export { type Column, DataTable } from './data-table';
export { ConfirmDialog, Dialog } from './dialog';
export { CheckboxField, Field, FormError, SelectField, TextAreaField } from './field';
export {
  API_BASE,
  ApiError,
  type ApiIssue,
  request,
  type RequestOptions,
  setUnauthorizedHandler,
} from './http';
export { ToastProvider, useToast } from './toast';
