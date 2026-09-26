import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import CopyButton from "@/components/common/CopyButton";
import EmptyState from "@/components/common/EmptyState";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import {
  assignAddress,
  CRYPTO_NETWORKS,
  getNetwork,
  removeAddress,
} from "@/services/crypto";
import { getErrorKey } from "@/utils/errors";
import type { CryptoAddress, CryptoAsset, PublicUser } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** Result of an admin action on an address, so the list can be updated. */
export type CryptoAddressChange =
  | { type: "added"; address: CryptoAddress }
  | { type: "removed"; id: string };

interface CryptoAddressesPanelProps {
  addresses: CryptoAddress[];
  actor: PublicUser;
  target?: PublicUser | null;
  onChanged: (change: CryptoAddressChange) => void;
}

/**
 * §5 / §14 — the administration attributes a deposit address to a client.
 *
 * The address belongs to a partner service: the platform only displays a
 * destination and never holds a private key. Sending on the wrong network is
 * irreversible, so the format is checked before saving.
 */
const CryptoAddressesPanel: React.FC<CryptoAddressesPanelProps> = ({
  addresses,
  actor,
  target,
  onChanged,
}) => {
  const { t } = useTranslation();

  const [asset, setAsset] = useState<CryptoAsset>("USDT_TRC20");
  const [address, setAddress] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const network = getNetwork(asset);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target) return;

    setIsSaving(true);
    setError(null);

    try {
      const created = await assignAddress({ userId: target.id, asset, address }, actor);
      onChanged({ type: "added", address: created });
      setAddress("");
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (item: CryptoAddress) => {
    await removeAddress(item.id, actor);
    onChanged({ type: "removed", id: item.id });
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
        {t("admin.cryptoAddresses.title")}
      </h2>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
        {t("admin.cryptoAddresses.subtitle")}
      </p>

      {target ? (
        <form onSubmit={handleSubmit} className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t("crypto.fields.asset")}</Label>
              <Select
                options={CRYPTO_NETWORKS.map((item) => ({
                  value: item.asset,
                  label: `${t(`crypto.assets.${item.asset}`)} — ${item.network}`,
                }))}
                defaultValue={asset}
                onChange={(value) => setAsset(value as CryptoAsset)}
              />
            </div>

            <div>
              <Label htmlFor="assign-address">
                {t("crypto.fields.address")} <span className="text-error-500">*</span>
              </Label>
              <Input
                id="assign-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder={network?.sample}
                required
              />
            </div>
          </div>

          {network ? (
            <p className="mt-3 text-theme-xs text-gray-500 dark:text-gray-400">
              {t("crypto.fields.requiredConfirmations", {
                count: network.requiredConfirmations,
              })}
            </p>
          ) : null}

          {error ? (
            <div className="mt-4">
              <Alert variant="error" title={t("auth.errors.title")} message={error} />
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={isSaving || !address}>
              {isSaving ? t("common.loading") : t("admin.cryptoAddresses.assign")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-theme-xs text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
          {t("admin.cryptoAddresses.selectClient")}
        </p>
      )}

      {addresses.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title={t("crypto.card.emptyTitle")}
            description={t("crypto.card.emptyText")}
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {addresses.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    {t(`crypto.assets.${item.asset}`)}
                  </span>
                  <Badge color="light" size="sm">
                    {item.network}
                  </Badge>
                </div>
                <Badge color={item.status === "ACTIVE" ? "success" : "warning"} size="sm">
                  {t(`status.cryptoAddress.${item.status}`)}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-gray-50 p-2.5 font-mono text-theme-xs text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
                  {item.address}
                </code>
                <CopyButton value={item.address} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRemove(item)}
                >
                  {t("admin.cryptoAddresses.remove")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default CryptoAddressesPanel;
