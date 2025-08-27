'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface DashboardErrorFallbackProps {
  error?: Error;
  resetError: () => void;
}

function DashboardErrorFallback({ error, resetError }: DashboardErrorFallbackProps) {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="text-center">
                <div className="flex items-center justify-center w-16 h-16 mx-auto bg-red-100 rounded-full">
                  <svg
                    className="w-8 h-8 text-red-600"
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
                
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  Dashboard Error
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  We encountered an issue while loading your dashboard. This might be due to a temporary problem with the data or network connection.
                </p>
                
                {error && process.env.NODE_ENV === 'development' && (
                  <details className="mt-4 text-left">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                      Technical Details (Development)
                    </summary>
                    <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono text-gray-800 overflow-auto">
                      <div className="mb-2">
                        <strong>Error:</strong> {error.message}
                      </div>
                    </div>
                  </details>
                )}
                
                <div className="mt-6 flex justify-center space-x-3">
                  <button
                    onClick={resetError}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Refresh Page
                  </button>
                </div>
                
                <div className="mt-4 text-xs text-gray-400">
                  If the problem persists, please contact your system administrator.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DashboardErrorBoundaryProps {
  children: ReactNode;
}

export function DashboardErrorBoundary({ children }: DashboardErrorBoundaryProps) {
  const handleError = (error: Error, errorInfo: ErrorInfo) => {
    // Log error for debugging
    console.error('Dashboard Error:', error, errorInfo);
    
    // You can send error to error reporting service here
    // Example: Sentry.captureException(error, { tags: { component: 'dashboard' } });
    
    // Optionally show user notification
    // Example: toast.error('Dashboard error occurred. Please try again.');
  };

  return (
    <ErrorBoundary
      fallback={<DashboardErrorFallback error={undefined} resetError={() => {}} />}
      onError={handleError}
    >
      {children}
    </ErrorBoundary>
  );
}
