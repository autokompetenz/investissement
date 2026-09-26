import EmptyState from "@/components/common/EmptyState";
import DocumentUploadCard from "@/components/client/kyc/DocumentUploadCard";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";

/**
 * §3.2 step 6 — the five documents the client can attach, one card each.
 * A document already reviewed can be replaced: it goes back to PENDING.
 */
const KycDocumentsPanel: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user) return null;

  const types = [
    "ID_CARD",
    "PASSPORT",
    "DRIVING_LICENSE",
    "PROOF_OF_ADDRESS",
    "SELFIE",
  ] as const;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
        {t("kyc.panel.title")}
      </h2>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
        {t("kyc.panel.subtitle")}
      </p>

      {user.kycDocuments.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={t("kyc.card.emptyTitle")}
            description={t("kyc.card.emptyText")}
          />
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {types.map((type) => (
          <DocumentUploadCard
            key={type}
            type={type}
            document={user.kycDocuments.find((document) => document.type === type)}
          />
        ))}
      </div>
    </div>
  );
};

export default KycDocumentsPanel;
