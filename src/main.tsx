import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './ui/App';
import { browserSlots } from './ui/browserStore';
import { createDriver } from './ui/driver';
import { SHIPPED_SOURCES } from './ui/shippedContent';

function holdThePageStill(): void {
  window.addEventListener('wheel', (event) => event.ctrlKey && event.preventDefault(), { passive: false });
  for (const gesture of ['gesturestart', 'gesturechange', 'gestureend']) {
    window.addEventListener(gesture, (event) => event.preventDefault());
  }
}

holdThePageStill();

const driver = createDriver(SHIPPED_SOURCES, { slots: browserSlots() });

if (import.meta.env.DEV) {
  void import('./ui/agent/testHarness').then(({ installTestHarness }) => installTestHarness(driver));
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App driver={driver} />
  </React.StrictMode>,
);
