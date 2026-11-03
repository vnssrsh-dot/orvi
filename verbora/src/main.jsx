import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { StoreProvider } from './lib/store.jsx';
import { initTelegram } from './lib/telegram.js';
import './styles.css';

initTelegram();
createRoot(document.getElementById('root')).render(
  <StoreProvider>
    <App />
  </StoreProvider>
);
