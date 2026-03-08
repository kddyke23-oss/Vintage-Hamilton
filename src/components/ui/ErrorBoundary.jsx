// src/components/ui/ErrorBoundary.jsx
// Catches unexpected React errors and shows a friendly message

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-brand-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="font-display text-2xl text-brand-800 mb-2">Something went wrong</h1>
            <p className="text-brand-500 text-sm mb-6">
              An unexpected error occurred. Please refresh the page and try again.
            </p>
            {import.meta.env.DEV && (
              <pre className="text-left bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 mb-4 overflow-auto">
                {this.state.error?.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
