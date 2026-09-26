import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/common/EmptyState";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import TextArea from "@/components/form/input/TextArea";
import { useModal } from "@/hooks/useModal";
import { getErrorKey } from "@/utils/errors";
import { createProduct, setProductStatus } from "@/services/investments";
import type { InvestmentProduct, PublicUser } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatNumber } from "@/utils/format";

interface ProductsManagerProps {
  products: InvestmentProduct[];
  actor: PublicUser;
  onChanged: (product: InvestmentProduct) => void;
}

const emptyForm = {
  name: "",
  description: "",
  minimumAmount: "",
  maximumAmount: "",
  durationMonths: 12,
  targetAnnualRate: "",
  riskLevel: "MEDIUM" as InvestmentProduct["riskLevel"],
  sector: "",
  conditions: "",
  documents: "",
  risks: "",
  rateGuaranteed: false,
};

type BadgeColor = "success" | "warning" | "error" | "light" | "info";

const productStatusColor: Record<InvestmentProduct["status"], BadgeColor> = {
  PUBLISHED: "success",
  DRAFT: "light",
  CLOSED: "warning",
  ARCHIVED: "error",
};

/** §13 — create, edit, disable and archive the investment opportunities. */
const ProductsManager: React.FC<ProductsManagerProps> = ({
  products,
  actor,
  onChanged,
}) => {
  const { t, i18n } = useTranslation();
  const { isOpen, openModal, closeModal } = useModal();

  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setField = (patch: Partial<typeof emptyForm>) =>
    setForm((previous) => ({ ...previous, ...patch }));

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const created = await createProduct(
        {
          name: form.name.trim(),
          description: form.description.trim(),
          minimumAmount: Number(form.minimumAmount),
          maximumAmount: form.maximumAmount
            ? Number(form.maximumAmount)
            : undefined,
          currency: "MAD",
          durationMonths: Number(form.durationMonths),
          targetAnnualRate: form.targetAnnualRate
            ? Number(form.targetAnnualRate)
            : undefined,
          // §24: contractual only when it legally is, so the default stays false.
          rateGuaranteed: form.rateGuaranteed,
          riskLevel: form.riskLevel,
          sector: form.sector.trim(),
          conditions: form.conditions
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          documents: form.documents
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((name) => ({ name })),
          risks: form.risks
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          status: "DRAFT",
        },
        actor,
      );

      onChanged(created);
      setForm(emptyForm);
      closeModal();
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setIsSaving(false);
    }
  };

  const changeStatus = async (
    product: InvestmentProduct,
    status: InvestmentProduct["status"],
  ) => {
    setBusyId(product.id);
    setError(null);
    try {
      onChanged(await setProductStatus(product.id, status, actor));
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {error ? (
        <Alert variant="error" title={t("auth.errors.title")} message={error} />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="rounded-xl bg-gray-50 p-4 text-theme-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
          {t("admin.products.notice")}
        </p>
        <Button onClick={openModal}>{t("admin.products.create")}</Button>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title={t("admin.products.emptyTitle")}
          description={t("admin.products.emptyText")}
        />
      ) : (
        <div className="space-y-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
                    {product.name}
                  </h3>
                  <p className="mt-0.5 text-theme-xs text-gray-400">
                    {product.sector} · {product.id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color="light" size="sm">
                    {t(`investments.risk.${product.riskLevel}`)}
                  </Badge>
                  <Badge color={productStatusColor[product.status]} size="sm">
                    {t(`status.product.${product.status}`)}
                  </Badge>
                </div>
              </div>

              <p className="mt-3 line-clamp-2 text-theme-sm text-gray-500 dark:text-gray-400">
                {product.description}
              </p>

              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-theme-xs text-gray-400">
                    {t("investments.card.minimum")}
                  </dt>
                  <dd className="mt-0.5 text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    {formatCurrency(
                      product.minimumAmount,
                      product.currency,
                      i18n.language,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-theme-xs text-gray-400">
                    {t("investments.card.duration")}
                  </dt>
                  <dd className="mt-0.5 text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    {t("investments.card.months", { count: product.durationMonths })}
                  </dd>
                </div>
                <div>
                  <dt className="text-theme-xs text-gray-400">
                    {t("investments.card.rate")}
                  </dt>
                  <dd className="mt-0.5 text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    {product.targetAnnualRate
                      ? `${formatNumber(product.targetAnnualRate, i18n.language)} %`
                      : "—"}{" "}
                    <span className="text-theme-xs text-gray-400">
                      {product.rateGuaranteed
                        ? t("investments.card.contractual")
                        : t("investments.card.indicative")}
                    </span>
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {product.status !== "PUBLISHED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === product.id}
                    onClick={() => void changeStatus(product, "PUBLISHED")}
                  >
                    {t("admin.products.publish")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === product.id}
                    onClick={() => void changeStatus(product, "CLOSED")}
                  >
                    {t("admin.products.closeSubscriptions")}
                  </Button>
                )}
                {product.status !== "ARCHIVED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === product.id}
                    onClick={() => void changeStatus(product, "ARCHIVED")}
                  >
                    {t("admin.products.archive")}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {isOpen ? (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <h3 className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
            {t("admin.products.create")}
          </h3>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="product-name">
                {t("admin.products.fields.name")}{" "}
                <span className="text-error-500">*</span>
              </Label>
              <Input
                id="product-name"
                value={form.name}
                onChange={(event) => setField({ name: event.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="product-sector">
                {t("admin.products.fields.sector")}{" "}
                <span className="text-error-500">*</span>
              </Label>
              <Input
                id="product-sector"
                value={form.sector}
                onChange={(event) => setField({ sector: event.target.value })}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="product-description">
                {t("admin.products.fields.description")}{" "}
                <span className="text-error-500">*</span>
              </Label>
              <TextArea
                rows={3}
                value={form.description}
                onChange={(value) => setField({ description: value })}
              />
            </div>

            <div>
              <Label htmlFor="product-min">
                {t("admin.products.fields.minimum")}{" "}
                <span className="text-error-500">*</span>
              </Label>
              <Input
                id="product-min"
                type="number"
                min={0}
                value={form.minimumAmount}
                onChange={(event) => setField({ minimumAmount: event.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="product-max">{t("admin.products.fields.maximum")}</Label>
              <Input
                id="product-max"
                type="number"
                min={0}
                value={form.maximumAmount}
                onChange={(event) => setField({ maximumAmount: event.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="product-duration">
                {t("admin.products.fields.duration")}{" "}
                <span className="text-error-500">*</span>
              </Label>
              <Input
                id="product-duration"
                type="number"
                min={1}
                value={form.durationMonths}
                onChange={(event) =>
                  setField({ durationMonths: Number(event.target.value) || 0 })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="product-rate">
                {t("admin.products.fields.rate")}
              </Label>
              <Input
                id="product-rate"
                type="number"
                step={0.1}
                min={0}
                value={form.targetAnnualRate}
                onChange={(event) => setField({ targetAnnualRate: event.target.value })}
              />
            </div>

            <div>
              <Label>{t("admin.products.fields.riskLevel")}</Label>
              <Select
                options={[
                  { value: "LOW", label: t("investments.risk.LOW") },
                  { value: "MEDIUM", label: t("investments.risk.MEDIUM") },
                  { value: "HIGH", label: t("investments.risk.HIGH") },
                ]}
                defaultValue={form.riskLevel}
                onChange={(value) =>
                  setField({ riskLevel: value as InvestmentProduct["riskLevel"] })
                }
              />
            </div>

            <div className="flex items-end">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.rateGuaranteed}
                  onChange={(event) => setField({ rateGuaranteed: event.target.checked })}
                  className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-gray-300 text-brand-500 focus:ring-brand-500/20 dark:border-gray-700"
                />
                <span className="text-theme-sm text-gray-700 dark:text-gray-300">
                  {t("admin.products.fields.rateGuaranteed")}
                </span>
              </label>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="product-conditions">
                {t("admin.products.fields.conditions")}
              </Label>
              <TextArea
                rows={3}
                placeholder={t("admin.products.fields.onePerLine")}
                value={form.conditions}
                onChange={(value) => setField({ conditions: value })}
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="product-documents">
                {t("admin.products.fields.documents")}
              </Label>
              <TextArea
                rows={2}
                placeholder={t("admin.products.fields.onePerLine")}
                value={form.documents}
                onChange={(value) => setField({ documents: value })}
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="product-risks">
                {t("admin.products.fields.risks")}{" "}
                <span className="text-error-500">*</span>
              </Label>
              <TextArea
                rows={3}
                placeholder={t("admin.products.fields.onePerLine")}
                value={form.risks}
                onChange={(value) => setField({ risks: value })}
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={closeModal}>
              {t("common.close")}
            </Button>
            <Button type="submit" disabled={isSaving || !form.risks.trim()}>
              {isSaving ? t("common.loading") : t("admin.products.create")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
};

export default ProductsManager;
