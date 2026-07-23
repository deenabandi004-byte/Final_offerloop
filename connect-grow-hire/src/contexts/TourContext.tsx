/**
 * TourContext — the guided product tour was removed (it broke mid-flow and
 * walked new users through too much at once). This no-op provider keeps the
 * useTour() API alive for the pages that still carry demo-choreography code
 * gated on `demoSurface`; with the surface pinned to null that code never
 * activates. Safe to delete consumers' demo code page-by-page later.
 */
import React, { createContext, useContext } from 'react';

export type TourDemoSurface =
  | 'people'
  | 'hiring-managers'
  | 'companies'
  | 'my-network'
  | 'inbox'
  | 'meeting-prep'
  | 'scout'
  | 'loops'
  | 'applications';

export interface TourContextType {
  run: boolean;
  stepIndex: number;
  showCompletion: boolean;
  demoSurface: TourDemoSurface | null;
  startTour: () => void;
  stopTour: () => void;
  dismissCompletion: () => void;
}

const NOOP_VALUE: TourContextType = {
  run: false,
  stepIndex: 0,
  showCompletion: false,
  demoSurface: null,
  startTour: () => {},
  stopTour: () => {},
  dismissCompletion: () => {},
};

const TourContext = createContext<TourContextType>(NOOP_VALUE);

export function TourProvider({ children }: { children: React.ReactNode }) {
  return <TourContext.Provider value={NOOP_VALUE}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextType {
  return useContext(TourContext);
}
