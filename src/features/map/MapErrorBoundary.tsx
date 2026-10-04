import React from 'react';

interface MapErrorBoundaryProps {
  children: React.ReactNode;
  /** Rendered in place of the map when a render/lifecycle error is caught. */
  fallback: (retry: () => void) => React.ReactNode;
}

interface MapErrorBoundaryState {
  hasError: boolean;
}

/**
 * A map rendering error — bad/empty coordinates, a marker that throws, route
 * decoding, or the map component failing to mount — must never take down the
 * whole app. This boundary catches it and shows a fallback with a Google Maps
 * escape hatch instead. (Note: a *native* crash inside the Google Maps SDK,
 * e.g. an unauthorized API key, happens outside React and cannot be caught
 * here — that is fixed in the Google Cloud console, not in JS.)
 */
export class MapErrorBoundary extends React.Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    // Swallow: the fallback UI is the user-facing recovery path. Live GPS
    // broadcasting is owned by the trip broadcaster and keeps running.
  }

  private retry = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) return this.props.fallback(this.retry);
    return this.props.children;
  }
}
