const PageLoader: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-3">
    <span className="size-10 animate-spin rounded-full border-3 border-gray-200 border-t-brand-500 dark:border-gray-800 dark:border-t-brand-400" />
    {label ? (
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
    ) : null}
  </div>
);

export default PageLoader;
