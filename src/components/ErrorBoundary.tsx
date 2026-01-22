"use client";

import React, { ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  retry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        this.props.fallback?.(this.state.error, this.retry) ?? (
          <div className="my-4 rounded-lg border border-red-100 bg-red-50 p-6 text-center">
            <h3 className="mb-2 font-bold text-red-800">Something went wrong</h3>
            <p className="mb-4 text-sm text-red-600">{this.state.error.message}</p>
            <button
              onClick={this.retry}
              className="rounded-full bg-red-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              type="button"
            >
              Try Again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
