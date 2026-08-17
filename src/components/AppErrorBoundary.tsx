import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[AppErrorBoundary] Unhandled application error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <section className="w-full max-w-sm text-center">
            <h1 className="text-xl font-semibold">Unable to load this page</h1>
            <p className="mt-2 text-sm text-muted-foreground">Refresh to reconnect and try again.</p>
            <button
              className="mt-6 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
              type="button"
              onClick={() => window.location.reload()}
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              <span>Refresh</span>
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
