/**
 * Home.tsx - Main Landing Page
 * 
 * Now uses the full DashboardPage with tabs (Dashboard, Outbox, Calendar)
 */

import DashboardPage from './DashboardPage';

export default function Home() {
  console.log("🏡 [HOME] Component rendering");
  return <DashboardPage />;
}
