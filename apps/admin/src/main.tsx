import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router-dom';
import { AdminProviders, createQueryClient } from './app/app';
import { routes } from './app/routes';
import './i18n';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

const router = createBrowserRouter(routes, { basename: '/admin' });

createRoot(rootElement).render(
  <StrictMode>
    <AdminProviders client={createQueryClient()} router={router} />
  </StrictMode>,
);
