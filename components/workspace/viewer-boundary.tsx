"use client";

import { Component, type ReactNode } from "react";

export class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <p className="px-4 py-8 text-center text-[13px] text-muted">ფაილი ვერ მოიძებნა</p>;
    }
    return this.props.children;
  }
}
