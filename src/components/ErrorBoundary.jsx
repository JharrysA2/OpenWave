import React from "react";
import { COLORS } from "../utils/theme";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(e) {
    return { error: e };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            color: COLORS.textPrimary,
            padding: "40px",
            fontFamily: "monospace",
            background: "#1a0000",
            height: "100vh",
          }}
        >
          <h2 style={{ color: "#ff6666" }}>Runtime Error Caught:</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px" }}>
            {this.state.error?.message}
          </pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "11px", color: "#aaa" }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
