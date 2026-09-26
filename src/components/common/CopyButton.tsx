import { CheckLineIcon, CopyIcon } from "@/icons";
import { cn } from "@/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

/** §4 / §5 — copy an IBAN or a crypto address. */
const CopyButton: React.FC<CopyButtonProps> = ({ value, label, className }) => {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard can be unavailable (insecure context, denied permission).
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-theme-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-800 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200",
        className,
      )}
      aria-label={t("common.copy")}
    >
      {isCopied ? (
        <CheckLineIcon className="size-4 text-success-500" />
      ) : (
        <CopyIcon className="size-4 fill-current" />
      )}
      <span>
        {isCopied ? t("common.copied") : (label ?? t("common.copy"))}
      </span>
    </button>
  );
};

export default CopyButton;
