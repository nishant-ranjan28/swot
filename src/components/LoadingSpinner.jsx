const LoadingSpinner = ({ size = 'md', text = 'Loading...' }) => {
    const sizeClasses = {
        sm: 'w-4 h-4',
        md: 'w-8 h-8',
        lg: 'w-12 h-12'
    };

    return (
        <div className="flex flex-col items-center justify-center p-4">
            <div className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-border border-t-primary`}></div>
            {text && <p className="mt-2 text-sm text-muted-foreground">{text}</p>}
        </div>
    );
};

export default LoadingSpinner;
