import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './lib/posthog'
import './styles/tokens.css'
import './index.css'
import { reloadForNewDeploy } from './utils/chunkReload'

// Vite fires this when a lazy chunk fails to load — after a deploy replaces
// the hashed assets, every pre-deploy tab hits this on its next navigation.
// Reload once to pick up the new build instead of surfacing an error page.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewDeploy()) event.preventDefault();
});

createRoot(document.getElementById("root")!).render(<App />);
