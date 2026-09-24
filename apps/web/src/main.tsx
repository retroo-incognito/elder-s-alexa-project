import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// CSS is resolved and injected by the bundler; TypeScript does not type-check stylesheet imports.
// @ts-ignore
import './App/web/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);