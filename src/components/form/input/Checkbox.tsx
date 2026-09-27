import { CheckLineIcon } from "@/icons";
import { cn } from "@/utils";
import type React from "react";

interface CheckboxProps {
  label?: string;
  checked: boolean;
  className?: string;
  id?: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

const Checkbox: React.FC<CheckboxProps> = ({
  label,
  checked,
  id,
  onChange,
  className = "",
  disabled = false,
}) => {
  return (
    <label
      className={cn(
        "flex items-center gap-3 group cursor-pointer",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      {/*
        The box grows to 44 pixels on a phone, from `sm` up, while the drawn
        square stays 20. The extra room is padding around the control, not a
        bigger control: the border and the check mark keep their proportions,
        and what grows is the area a finger has to land on.

        The tick and the disabled mark come from `@/icons` rather than being
        inlined here, so every icon in the application has one source.
      */}
      <div className="relative flex size-11 items-center justify-center sm:size-5">
        <input
          id={id}
          type="checkbox"
          className={cn(
            "size-5 appearance-none cursor-pointer rounded-md border border-gray-300 checked:border-transparent checked:bg-brand-500 disabled:opacity-60 dark:border-gray-700",
            className
          )}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        {checked ? (
          <CheckLineIcon className="pointer-events-none absolute inset-0 m-auto size-3.5 text-white" />
        ) : null}
        {disabled ? (
          <CheckLineIcon className="pointer-events-none absolute inset-0 m-auto size-3.5 text-gray-300" />
        ) : null}
      </div>
      {label && (
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
          {label}
        </span>
      )}
    </label>
  );
};

export default Checkbox;
