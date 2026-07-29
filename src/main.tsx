import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function PlaceholderRoot() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
      }}
    >
      Universalis — text-adventure GUI pending
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PlaceholderRoot />
  </React.StrictMode>,
);
