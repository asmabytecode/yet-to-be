import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router-dom';
import { AppProviders } from './app/app';
import { routes } from './app/routes';
import './i18n';
import './index.css';
import { createQueryClient } from './shared/api/query-client';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

const client = createQueryClient();
const router = createBrowserRouter(routes);

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders client={client} router={router} />
  </StrictMode>,
);
