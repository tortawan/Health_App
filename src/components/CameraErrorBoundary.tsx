"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  onRetry: () => void;
  onManualUpload: (file: File) => void;
};

type State = {
  hasError: boolean;
};

export class CameraErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[CameraErrorBoundary] Camera error", error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    this.props.onRetry();
  };

  handleManualUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      this.props.onManualUpload(file);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-white">
          <h3 className="text-lg font-semibold">Camera permission denied</h3>
          <p className="mt-2 text-sm text-white/70">
            Please enable camera access in your browser settings or upload a photo instead.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="btn" onClick={this.handleRetry} type="button">
              Retry
            </button>
            <label className="btn bg-white/10 text-white hover:bg-white/20">
              <input
                accept="image/*"
                className="hidden"
                type="file"
                onChange={this.handleManualUpload}
              />
              Manual upload
            </label>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
