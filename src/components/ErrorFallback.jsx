import ErrorState from './common/ErrorState';

const ErrorFallback = ({ error, resetErrorBoundary, componentName = 'Widget' }) => {
    return (
        <div>
            <ErrorState
                title={`${componentName} Error`}
                message="Something went wrong while loading this component. Please try refreshing the page."
                onRetry={resetErrorBoundary}
            />
            {import.meta.env.DEV && (
                <details className="mt-4 rounded-md bg-muted p-3 text-left font-mono text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Error Details</summary>
                    <pre className="mt-2 overflow-auto text-loss">
                        {error?.message || 'Unknown error'}
                    </pre>
                </details>
            )}
        </div>
    );
};

export default ErrorFallback;
