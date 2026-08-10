import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './ui/App';
import { createDriver } from './ui/driver';
import { SHIPPED_SOURCES } from './ui/shippedContent';

const driver = createDriver(SHIPPED_SOURCES);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App driver={driver} />
  </React.StrictMode>,
);
