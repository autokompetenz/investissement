import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import CopyButton from "@/components/common/CopyButton";
import EmptyState from "@/components/common/EmptyState";
import { networkWarningKey } from "@/services/crypto";
import type { CryptoAddress } from "@/types";
import { useTranslation } from "react-i18next";

interface CryptoAddressesCardProps {
  addresses: CryptoAddress[];
}

/**
 * §5 — deposit addresses attributed by the administration.
 * A network warning is mandatory: sending on the wrong network can lose funds
 * irreversibly, and no support can undo it.
 */
const CryptoAddressesCard: React.FC<CryptoAddressesCardProps> = ({ addresses }) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
        {t("crypto.card.title")}
      </h2>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
        {t("crypto.card.subtitle")}
      </p>

      {addresses.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={t("crypto.card.emptyTitle")}
            description={t("crypto.card.emptyText")}
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-4">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    {t(`crypto.assets.${address.asset}`)}
                  </span>
                  <Badge color="light" size="sm">
                    {address.network}
                  </Badge>
                </div>
                <Badge
                  color={address.status === "ACTIVE" ? "success" : "warning"}
                  size="sm"
                >
                  {t(`status.cryptoAddress.${address.status}`)}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-gray-50 p-2.5 font-mono text-theme-xs text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
                  {address.address}
                </code>
                <CopyButton value={address.address} />
              </div>

              <div className="mt-3">
                <Alert
                  variant="warning"
                  title={t("crypto.networkWarning.title")}
                  message={t(networkWarningKey(address.asset))}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CryptoAddressesCard;
