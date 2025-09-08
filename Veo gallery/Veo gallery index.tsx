/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import '@tailwindcss/browser';
import React from 'react';
import ReactDOM from 'react-dom/client';
import {App} from './Veo gallery App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App getApiKey={() => null} openApiKeyModal={() => {}} />
  </React.StrictMode>,
);
