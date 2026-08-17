import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './ui/App';
import { browserSlots } from './ui/browserStore';
import { createDriver } from './ui/driver';
import { SHIPPED_SOURCES } from './ui/shippedContent';

// The page itself does not zoom. The stylesheet takes the touch gestures away
// and the viewport tag takes the scale away, and neither of them reaches a
// trackpad: a pinch on one arrives as a wheel with ctrl held, and a browser
// that zooms on it puts a scale over the app that nothing in the app can see.
// Safari's own gesture events are refused for the same reason.
//
// Here rather than in a component because it is about the page and not about
// anything drawn on it, and because a listener a component owns comes and goes
// with the component.
function holdThePageStill(): void {
  window.addEventListener('wheel', (event) => event.ctrlKey && event.preventDefault(), { passive: false });
  for (const gesture of ['gesturestart', 'gesturechange', 'gestureend']) {
    window.addEventListener(gesture, (event) => event.preventDefault());
  }
}

holdThePageStill();

// The store a player of the browser has, constructed here and passed in:
// nothing below src/ui learns that a browser exists, and the driver stands in
// whatever store it is handed.
const driver = createDriver(SHIPPED_SOURCES, { slots: browserSlots() });

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App driver={driver} />
  </React.StrictMode>,
);
