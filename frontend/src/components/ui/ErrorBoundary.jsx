import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-[#131313] rounded-xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-[#d53d18]/10 flex items-center justify-center mx-auto">
            <span className="material-symbols-rounded text-[#d53d18] text-3xl">error</span>
          </div>
          <h2 className="text-xl font-headline font-black text-white uppercase tracking-widest">
            Something went wrong
          </h2>
          <p className="text-sm text-zinc-500">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            className="px-6 py-2.5 bg-[#D1FF26] text-zinc-950 text-xs font-black uppercase tracking-widest rounded-lg hover:bg-[#f4ffc9] transition-colors"
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
}
