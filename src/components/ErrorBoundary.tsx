'use client';

import React, { ReactNode } from 'react';

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
      return this.props.fallback?.(this.state.error, this.retry) ?? (
        <div className="p-6 bg-red-50 rounded-lg text-center border border-red-100 my-4">
          <h3 className="font-bold text-red-800 mb-2">Something went wrong</h3>
          <p className="text-red-600 text-sm mb-4">{this.state.error.message}</p>
          <button 
            onClick={this.retry} 
            className="px-6 py-2 bg-red-600 text-white rounded-full text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}