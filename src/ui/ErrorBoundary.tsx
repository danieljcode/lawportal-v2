// Error boundaries (LP-88): one round the whole app and one round each major
// panel, so a panel that breaks shows a crash screen in its place and the rest
// of the app keeps working. The crash screen is a Windows 3.0 style
// "Application Error" box with Reload, a backup download and the error details.

import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { copyText } from "@/lib/clipboard";
import { crashBackup, errorDetails } from "@/lib/crash";
import { download } from "@/lib/download";
import { defaultKV } from "@/lib/storage";

export interface ErrorBoundaryProps {
  /** What this boundary guards, for the message and the report ("the form", "the whole app"). */
  where: string;
  /** "app" fills the page; "panel" sits in the panel's place; "dialog" floats over the app. */
  variant?: "app" | "panel" | "dialog";
  /** A change here clears the crash (another form opened, another dialog shown). */
  resetKey?: unknown;
  /** Dialogs: close it (shown as Close instead of Try again). */
  onDismiss?(): void;
  /** A whole program: leave it for home (Go home, beside Try again; LP-123). */
  onHome?(): void;
  /** Told when this boundary shows its crash screen, and when Try again clears it. */
  onError?(): void;
  onReset?(): void;
  children?: ReactNode;
}

interface State {
  error: unknown;
  componentStack: string | null;
  resetKey: unknown;
}

const NONE = Symbol("no error");

export default class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: NONE, componentStack: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: State): Partial<State> | null {
    if (props.resetKey === state.resetKey) return null;
    return { error: NONE, componentStack: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null });
    console.error("[crash]", this.props.where, error);
    this.props.onError?.();
  }

  private retry = () => {
    this.setState({ error: NONE, componentStack: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error === NONE) return this.props.children;
    return (
      <CrashScreen
        where={this.props.where}
        variant={this.props.variant || "panel"}
        error={this.state.error}
        componentStack={this.state.componentStack}
        onRetry={this.props.variant === "app" || this.props.onDismiss ? undefined : this.retry}
        onDismiss={this.props.onDismiss}
        onHome={this.props.onHome}
      />
    );
  }
}

interface CrashScreenProps {
  where: string;
  variant: "app" | "panel" | "dialog";
  error: unknown;
  componentStack: string | null;
  onRetry?(): void;
  onDismiss?(): void;
  onHome?(): void;
}

function CrashScreen({ where, variant, error, componentStack, onRetry, onDismiss, onHome }: CrashScreenProps) {
  const [status, setStatus] = useState("");

  const backup = () => {
    try {
      const { text, filename } = crashBackup(defaultKV());
      download(text, filename);
      setStatus("Backup downloaded. Keep the file safe: Restore backup in the Characters dialog puts it back.");
    } catch {
      setStatus("Couldn't make the backup file.");
    }
  };

  const copyDetails = async () => {
    const text = errorDetails({
      error,
      componentStack,
      where,
      route: location.hash,
      userAgent: typeof navigator === "undefined" ? undefined : navigator.userAgent,
    });
    const ok = await copyText(text);
    setStatus(
      ok
        ? "Error details copied. They don't include your sync code or anything you typed."
        : "Copy failed. Try again, or take a screenshot of this box.",
    );
  };

  const box = (
    <div className="crash window" role="alertdialog" aria-labelledby="crash-title" aria-describedby="crash-text">
      <div className="title-bar">
        <span className="title-bar-text" id="crash-title">
          Application Error
        </span>
      </div>
      <div className="window-body crash-body">
        <div className="crash-message">
          <span className="crash-icon" aria-hidden="true">
            ✕
          </span>
          <div id="crash-text">
            <p>
              <strong>{"Something went wrong in " + where + "."}</strong>
            </p>
            <p>
              {variant === "app"
                ? "Your saved work is still in this browser. Reload to start again, and download a backup first if you're worried."
                : "The rest of the app still works, and your saved work is still in this browser. Try again, or reload the page."}
            </p>
          </div>
        </div>
        <div className="row crash-actions">
          {onRetry && (
            <button type="button" className="btn primary" id="crash-retry" onClick={onRetry}>
              Try again
            </button>
          )}
          {onHome && (
            <button type="button" className="btn" id="crash-home" onClick={onHome}>
              Go home
            </button>
          )}
          {onDismiss && (
            <button type="button" className="btn primary" id="crash-close" onClick={onDismiss}>
              Close
            </button>
          )}
          <button
            type="button"
            className={"btn" + (onRetry || onDismiss ? "" : " primary")}
            id="crash-reload"
            onClick={() => location.reload()}
          >
            Reload
          </button>
          <button type="button" className="btn" id="crash-backup" onClick={backup}>
            Download a backup of my data
          </button>
          <button type="button" className="btn" id="crash-copy" onClick={() => void copyDetails()}>
            Copy error details
          </button>
        </div>
        <p className="small crash-status" role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </div>
  );

  return <div className={"crash-wrap crash-" + variant}>{box}</div>;
}
