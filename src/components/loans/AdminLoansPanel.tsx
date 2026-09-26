import Alert from "@/components/ui/alert/Alert";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/common/EmptyState";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import TextArea from "@/components/form/input/TextArea";
import {
  approveLoan,
  disburseLoan,
  rejectLoan,
  reviewLoan,
} from "@/services/loans";
import { getErrorKey } from "@/utils/errors";
import type { Loan, LoanStatus, PublicUser } from "@/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate } from "@/utils/format";

interface AdminLoansPanelProps {
  loans: Loan[];
  users: PublicUser[];
  actor: PublicUser;
  onChanged: (loan: Loan) => void;
}

type BadgeColor = "success" | "warning" | "info" | "error" | "light";

const statusColor: Record<LoanStatus, BadgeColor> = {
  APPROVED: "info",
  PENDING: "warning",
  UNDER_REVIEW: "info",
  REJECTED: "error",
  ACTIVE: "success",
  CLOSED: "light",
};

const ACTIONS: Record<LoanStatus, string[]> = {
  PENDING: ["review", "approve", "reject"],
  UNDER_REVIEW: ["approve", "reject"],
  APPROVED: ["disburse"],
  ACTIVE: [],
  REJECTED: [],
  CLOSED: [],
};

/**
 * §9 / §13 — the administration reviews the loan requests.
 *
 * The approval form is where the granted amount, the duration, the rate and
 * the conditions are set: nothing of that is decided before this point, and
 * the schedule is built from these values.
 */
const AdminLoansPanel: React.FC<AdminLoansPanelProps> = ({
  loans,
  users,
  actor,
  onChanged,
}) => {
  const { t, i18n } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState<string | null>(null);
  const [terms, setTerms] = useState({
    amount: "",
    duration: "24",
    rate: "6.5",
    conditions: "",
  });

  const nameOf = (userId: string) => {
    const client = users.find((item) => item.id === userId);
    return client
      ? `${client.reference} — ${client.profile.firstName} ${client.profile.lastName}`
      : userId;
  };

  const run = async (loan: Loan, action: () => Promise<Loan>) => {
    setBusyId(loan.id);
    setError(null);
    try {
      onChanged(await action());
      setNotes((previous) => ({ ...previous, [loan.id]: "" }));
    } catch (caught) {
      setError(t(getErrorKey(caught)));
    } finally {
      setBusyId(null);
    }
  };

  const submitApproval = async (loan: Loan) => {
    const conditions = terms.conditions
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    await run(loan, () =>
      approveLoan(
        loan.id,
        {
          amount: Number(terms.amount),
          durationMonths: Number(terms.duration),
          annualRate: Number(terms.rate),
          conditions,
        },
        actor,
      ),
    );
    setApproving(null);
    setTerms({ amount: "", duration: "24", rate: "6.5", conditions: "" });
  };

  if (loans.length === 0) {
    return (
      <EmptyState
        title={t("admin.loans.emptyTitle")}
        description={t("admin.loans.emptyText")}
      />
    );
  }

  return (
    <div>
      {error ? (
        <div className="mb-4">
          <Alert variant="error" title={t("auth.errors.title")} message={error} />
        </div>
      ) : null}

      <p className="mb-4 rounded-xl bg-gray-50 p-4 text-theme-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
        {t("admin.loans.notice")}
      </p>

      <ul className="space-y-3">
        {loans.map((loan) => {
          const actions = ACTIONS[loan.status];
          const isApproving = approving === loan.id;

          return (
            <li
              key={loan.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-theme-lg font-semibold text-gray-800 dark:text-white/90">
                    {formatCurrency(
                      loan.approvedAmount ?? loan.requestedAmount,
                      loan.currency,
                      i18n.language,
                    )}
                  </p>
                  <p className="mt-0.5 text-theme-xs text-gray-400">
                    {loan.reference} · {nameOf(loan.userId)} · {loan.purpose}
                  </p>
                </div>
                <Badge color={statusColor[loan.status]} size="sm">
                  {t(`status.loan.${loan.status}`)}
                </Badge>
              </div>

              <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                <div>
                  <dt className="text-theme-xs text-gray-400">
                    {t("loans.details.requested")}
                  </dt>
                  <dd className="mt-0.5 text-theme-sm text-gray-700 dark:text-gray-300">
                    {formatCurrency(loan.requestedAmount, loan.currency, i18n.language)}
                  </dd>
                </div>
                <div>
                  <dt className="text-theme-xs text-gray-400">
                    {t("loans.details.duration")}
                  </dt>
                  <dd className="mt-0.5 text-theme-sm text-gray-700 dark:text-gray-300">
                    {t("loans.request.durationOption", {
                      count: loan.approvedDurationMonths ?? loan.requestedDurationMonths,
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-theme-xs text-gray-400">{t("loans.details.rate")}</dt>
                  <dd className="mt-0.5 text-theme-sm text-gray-700 dark:text-gray-300">
                    {loan.annualRate !== undefined
                      ? `${loan.annualRate} %`
                      : t("loans.details.rateNotSet")}
                  </dd>
                </div>
              </dl>

              {loan.additionalInfo ? (
                <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
                  {t("loans.request.additionalInfo")}: {loan.additionalInfo}
                </p>
              ) : null}

              {loan.reviewNote ? (
                <p className="mt-2 rounded-lg bg-gray-50 p-2.5 text-theme-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
                  {loan.reviewNote}
                </p>
              ) : null}

              {loan.status === "APPROVED" ? (
                <div className="mt-3">
                  <p className="text-theme-sm text-gray-600 dark:text-gray-300">
                    {t("admin.loans.approvedOn", {
                      date: formatDate(loan.approvedAt ?? loan.updatedAt, i18n.language),
                    })}
                  </p>
                  <p className="mt-1 text-theme-xs text-gray-400">
                    {t("admin.loans.disburseHint")}
                  </p>
                </div>
              ) : null}

              {isApproving ? (
                <div className="mt-4 space-y-3 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
                  <h4 className="text-theme-sm font-semibold text-gray-700 dark:text-white/90">
                    {t("admin.loans.approvalForm.title")}
                  </h4>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor={`loan-amount-${loan.id}`}>
                        {t("loans.details.granted")}{" "}
                        <span className="text-error-500">*</span>
                      </Label>
                      <Input
                        id={`loan-amount-${loan.id}`}
                        type="number"
                        min={1}
                        step={1000}
                        value={terms.amount}
                        onChange={(event) =>
                          setTerms((previous) => ({ ...previous, amount: event.target.value }))
                        }
                        placeholder={String(loan.requestedAmount)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`loan-duration-${loan.id}`}>
                        {t("loans.details.duration")} ({t("common.months")})
                      </Label>
                      <Select
                        options={[6, 12, 24, 36, 48].map((months) => ({
                          value: String(months),
                          label: t("loans.request.durationOption", { count: months }),
                        }))}
                        defaultValue={terms.duration}
                        onChange={(value) =>
                          setTerms((previous) => ({ ...previous, duration: value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor={`loan-rate-${loan.id}`}>
                        {t("loans.details.rate")} (%){" "}
                        <span className="text-error-500">*</span>
                      </Label>
                      <Input
                        id={`loan-rate-${loan.id}`}
                        type="number"
                        min={0}
                        step={0.1}
                        value={terms.rate}
                        onChange={(event) =>
                          setTerms((previous) => ({ ...previous, rate: event.target.value }))
                        }
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor={`loan-conditions-${loan.id}`}>
                      {t("loans.details.conditions")}{" "}
                      <span className="text-error-500">*</span>
                    </Label>
                    <TextArea
                      rows={3}
                      value={terms.conditions}
                      onChange={(value) =>
                        setTerms((previous) => ({ ...previous, conditions: value }))
                      }
                      placeholder={t("admin.products.fields.onePerLine")}
                    />
                  </div>

                  <p className="text-theme-xs text-warning-600 dark:text-warning-400">
                    {t("admin.loans.legalNotice")}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={
                        busyId === loan.id ||
                        !terms.amount ||
                        !terms.conditions.trim()
                      }
                      onClick={() => void submitApproval(loan)}
                    >
                      {t("admin.loans.approvalForm.submit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setApproving(null)}
                    >
                      {t("common.close")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {actions.includes("disburse") ? (
                <div className="mt-3">
                  <Input
                    value={references[loan.id] ?? ""}
                    onChange={(event) =>
                      setReferences((previous) => ({
                        ...previous,
                        [loan.id]: event.target.value,
                      }))
                    }
                    placeholder={t("admin.loans.disbursePlaceholder")}
                  />
                </div>
              ) : null}

              {actions.includes("reject") ? (
                <div className="mt-3">
                  <TextArea
                    rows={2}
                    placeholder={t("admin.loans.rejectPlaceholder")}
                    value={notes[loan.id] ?? ""}
                    onChange={(value) =>
                      setNotes((previous) => ({ ...previous, [loan.id]: value }))
                    }
                  />
                </div>
              ) : null}

              {actions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {actions.includes("review") ? (
                    <Button
                      size="sm"
                      disabled={busyId === loan.id}
                      onClick={() => void run(loan, () => reviewLoan(loan.id, actor))}
                    >
                      {t("admin.loans.review")}
                    </Button>
                  ) : null}

                  {actions.includes("approve") ? (
                    <Button
                      size="sm"
                      disabled={busyId === loan.id}
                      onClick={() => {
                        setTerms((previous) => ({
                          ...previous,
                          amount: String(loan.requestedAmount),
                        }));
                        setApproving(loan.id);
                      }}
                    >
                      {t("admin.loans.approve")}
                    </Button>
                  ) : null}

                  {actions.includes("disburse") ? (
                    <Button
                      size="sm"
                      disabled={
                        busyId === loan.id || !(references[loan.id] ?? "").trim()
                      }
                      onClick={() =>
                        void run(loan, () =>
                          disburseLoan(loan.id, actor, references[loan.id] ?? ""),
                        )
                      }
                    >
                      {t("admin.loans.disburse")}
                    </Button>
                  ) : null}

                  {actions.includes("reject") ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === loan.id || !(notes[loan.id] ?? "").trim()}
                      onClick={() =>
                        void run(loan, () =>
                          rejectLoan(loan.id, actor, notes[loan.id] ?? ""),
                        )
                      }
                    >
                      {t("admin.loans.reject")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default AdminLoansPanel;
