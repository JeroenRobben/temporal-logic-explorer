import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';
import { applyTheme, loadPref } from './ui/theme';
import './styles.css';

// Apply the theme before React mounts: App's mount effect re-applies (and owns
// the listener lifecycle), but that can land after first paint — this call
// prevents a light flash for dark-system users.
applyTheme(loadPref());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
