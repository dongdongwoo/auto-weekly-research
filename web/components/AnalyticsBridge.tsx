'use client';

import { track } from '@vercel/analytics';
import { useEffect } from 'react';

declare global {
  interface Window {
    __trackAnalytics?: (name: string, data?: Record<string, string>) => void;
  }
}

/** dash-js(바닐라) → @vercel/analytics track 브릿지 */
export function AnalyticsBridge() {
  useEffect(() => {
    window.__trackAnalytics = (name, data) => track(name, data);
    return () => {
      delete window.__trackAnalytics;
    };
  }, []);

  return null;
}
