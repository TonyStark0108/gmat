import { Component, type ReactNode } from "react";

// If a screen ever breaks, nothing is lost: every answer is already saved. Say so, calmly.
export class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="frame"><div className="app"><div className="screen">
        <div className="eyebrow">Something on this screen broke</div>
        <div className="title">Everything you've done is saved.</div>
        <div className="muted" style={{ fontSize: 17 }}>Going back to today usually fixes it.</div>
        <button className="btn" onClick={() => { this.setState({ err: null }); window.location.hash = "/"; }}>Back to today</button>
        <div className="tiny">{this.state.err.message}</div>
      </div></div></div>
    );
  }
}
