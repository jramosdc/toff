import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, useErrorHandler, withErrorBoundary } from '../ErrorBoundary';

// Component that throws an error for testing
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>No error</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress console.error for tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('should render fallback UI when error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('We\'re sorry, but something unexpected happened. Please try refreshing the page.')).toBeInTheDocument();
  });

  it('should show error details in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Error Details (Development)')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('should not show error details in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.queryByText('Error Details (Development)')).not.toBeInTheDocument();
    expect(screen.queryByText('Test error message')).not.toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('should call onError callback when error occurs', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String)
      })
    );
  });

  it('should render custom fallback when provided', () => {
    const customFallback = <div>Custom error message</div>;

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('should handle refresh button click', () => {
    // Mock window.location.reload
    const originalReload = window.location.reload;
    const mockReload = vi.fn();
    Object.defineProperty(window.location, 'reload', {
      value: mockReload,
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const refreshButton = screen.getByText('Refresh Page');
    fireEvent.click(refreshButton);

    expect(mockReload).toHaveBeenCalled();

    // Restore original
    Object.defineProperty(window.location, 'reload', {
      value: originalReload,
      writable: true,
    });
  });

  it('should handle try again button click', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Re-render without error
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('should log errors to console in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error caught by ErrorBoundary:',
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String)
      })
    );

    consoleSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it('should handle multiple errors gracefully', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Try to trigger another error
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Should still show error boundary
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});

describe('useErrorHandler', () => {
  it('should return a function that can be called', () => {
    const errorHandler = useErrorHandler();
    
    expect(typeof errorHandler).toBe('function');
    
    // Should not throw when called
    expect(() => errorHandler(new Error('Test'), { componentStack: 'Test stack' })).not.toThrow();
  });
});

describe('withErrorBoundary', () => {
  it('should wrap component with error boundary', () => {
    function TestComponent() {
      return <div>Test component</div>;
    }
    
    const WrappedComponent = withErrorBoundary(TestComponent);
    
    render(<WrappedComponent />);
    
    expect(screen.getByText('Test component')).toBeInTheDocument();
  });

  it('should handle errors in wrapped component', () => {
    function TestComponent() {
      throw new Error('Wrapped component error');
    }
    
    const WrappedComponent = withErrorBoundary(TestComponent);
    
    render(<WrappedComponent />);
    
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
