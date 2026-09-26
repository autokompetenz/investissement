interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Shared placeholder for the lists that are not filled yet. */
const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    <p className="text-theme-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
    {description ? (
      <p className="max-w-md text-theme-sm text-gray-500 dark:text-gray-400">{description}</p>
    ) : null}
    {action ? <div className="mt-2">{action}</div> : null}
  </div>
);

export default EmptyState;
