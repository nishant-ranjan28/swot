import React from 'react';

const ErrorFallback = ({ error, resetErrorBoundary, componentName = 'Widget' }) => {
    return (
        <div className="flex flex-col items-center justify-center p-6 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-red-600 mb-4">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.996-.833-2.764 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
            </div>
            <h3 className="text-lg font-semibold text-red-800 mb-2">{componentName} Error</h3>
            <p className="text-red-600 text-center mb-4 max-w-md">
                Something went wrong while loading this component. Please try refreshing the page.
            </p>
            {resetErrorBoundary && (
                <button
                    onClick={resetErrorBoundary}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                    Try Again
                </button>
            )}
            {process.env.NODE_ENV === 'development' && (
                <details className="mt-4 w-full">
                    <summary className="text-sm text-red-600 cursor-pointer">Error Details</summary>
                    <pre className="mt-2 text-xs text-red-500 bg-red-100 p-2 rounded overflow-auto">
                        {error?.message || 'Unknown error'}
                    </pre>
                </details>
            )}
        </div>
    );
};

export default ErrorFallback;
