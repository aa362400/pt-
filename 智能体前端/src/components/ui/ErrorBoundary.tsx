import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F8F9FF] px-4 text-center">
          <h1 className="text-lg font-semibold text-[#1A1A2E]">
            页面出错了
          </h1>
          <p className="max-w-md text-sm text-[#8B93B5]">
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-[#6C63FF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#5B52EE]"
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
