import type { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode; // Button text or content
  size?: "sm" | "md"; // Button size
  variant?: "primary" | "outline"; // Button variant
  startIcon?: ReactNode; // Icon before the text
  endIcon?: ReactNode; // Icon after the text
  onClick?: () => void; // Click handler
  type?: "button" | "submit" | "reset"; // Native button type
  disabled?: boolean; // Disabled state
  className?: string; // Disabled state
}

const Button: React.FC<ButtonProps> = ({
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  onClick,
  type = "button",
  className = "",
  disabled = false,
}) => {
  /*
    Size classes. The vertical padding grows on a phone: 44 pixels is the
    smallest target a fingertip can hit reliably, and a padding of 12 or 14
    pixels gives 40 or 42 — under the threshold on a mid-range handset.

    Full width under `sm`, which suits a form, and never on a row of actions.
    A confirmation button sitting in a table is one of several side by side:
    stretched to the full width of a phone it would push its neighbours off
    screen, so it opts out with `w-auto` and keeps the 44-pixel height.
  */
  const sizeClasses = {
    sm: "w-full px-4 py-3.5 text-sm sm:w-auto sm:py-3",
    md: "w-full px-5 py-3.5 text-sm sm:w-auto sm:py-3.5",
  };

  // Variant Classes
  const variantClasses = {
    primary:
      "bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300",
    outline:
      "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/3 dark:hover:text-gray-300",
  };

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition ${className} ${
        sizeClasses[size]
      } ${variantClasses[variant]} ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {startIcon && <span className="flex items-center">{startIcon}</span>}
      {children}
      {endIcon && <span className="flex items-center">{endIcon}</span>}
    </button>
  );
};

export default Button;
