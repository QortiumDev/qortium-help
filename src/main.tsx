import '@fontsource/comic-neue/400.css';
import '@fontsource/comic-neue/700.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyDisplaySettings, getInitialDisplaySettings } from './displaySettings';
import './styles.css';

// Stamp theme/accent/text-size/language onto <html> before the first paint so a
// non-default Home setting does not flash the defaults for a frame on load (disp-1).
applyDisplaySettings(getInitialDisplaySettings());

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
