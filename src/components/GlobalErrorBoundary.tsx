'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface GlobalErrorFallbackProps {
  error?: Error;
  resetError: () => void;
}

function GlobalErrorFallback({ error, resetError }: GlobalErrorFallbackProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white rounded-xl shadow-2xl p-8">
        <div className="text-center">
          <div className="flex items-center justify-center w-20 h-20 mx-auto bg-red-100 rounded-full">
            <svg
              className="w-10 h-10 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          
          <h1 className="mt-6 text-2xl font-bold text-gray-900">
            Application Error
          </h1>
          <p className="mt-3 text-base text-gray-600">
            We're sorry, but something unexpected happened in the application. Our team has been notified and is working to resolve this issue.
          </p>
          
          {error && process.env.NODE_ENV === 'development' && (
            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                Technical Details (Development)
              </summary>
              <div className="mt-3 p-4 bg-gray-100 rounded-lg text-xs font-mono text-gray-800 overflow-auto max-h-40">
                <div className="mb-3">
                  <strong>Error:</strong> {error.message}
                </div>
                <div>
                  <strong>Stack:</strong>
                  <pre className="whitespace-pre-wrap mt-2 text-xs">
                    {error.stack}
                  </pre>
                </div>
              </div>
            </details>
          )}
          
          <div className="mt-8 flex flex-col sm:flex-row justify-center space-y-3 sm:space-y-0 sm:space-x-4">
            <button
              onClick={resetError}
              className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Try Again
            </button>
            
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Page
            </button>
          </div>
          
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              If this problem continues, please contact support with the following information:
            </p>
            <div className="mt-2 text-xs text-gray-400 font-mono">
              Error ID: {error?.name || 'Unknown'} - {new Date().toISOString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface GlobalErrorBoundaryProps {
  children: ReactNode;
}

export function GlobalErrorBoundary({ children }: GlobalErrorBoundaryProps) {
  const handleError = (error: Error, errorInfo: ErrorInfo) => {
    // Log error for debugging
    console.error('Global Application Error:', error, errorInfo);
    
    // You can send error to error reporting service here
    // Example: Sentry.captureException(error, { tags: { level: 'global' } });
    
    // Optionally show user notification
    // Example: toast.error('A system error occurred. Please try again.');
    
    // You could also send error to your backend for logging
    // Example: fetch('/api/errors', { method: 'POST', body: JSON.stringify({ error: error.message, stack: error.stack }) });
  };

  return (
    <ErrorBoundary
      fallback={<GlobalErrorFallback error={undefined} resetError={() => {}} />}
      onError={handleError}
    >
      {children}
    </ErrorBoundary>
  );
}
