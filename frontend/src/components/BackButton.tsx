import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useNavigate, type To } from "react-router-dom";
import BackIcon from "../assets/back.svg?react";

type BackButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "children" | "title" | "aria-label"
> & {
  className?: string;
  iconClassName?: string;
  showIcon?: boolean;
  title?: string;
  ariaLabel?: string;
  onBack?: () => void;
  fallbackTo?: To;
  replaceOnFallback?: boolean;
  onBeforeBack?: () => boolean;
  children?: ReactNode;
};

export default function BackButton({
  className,
  iconClassName,
  showIcon = true,
  title = "Go back",
  ariaLabel = "Go back",
  onBack,
  fallbackTo = "/",
  replaceOnFallback = true,
  onBeforeBack,
  children,
  ...buttonProps
}: BackButtonProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    if (onBeforeBack?.()) return;

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate(fallbackTo, { replace: replaceOnFallback });
  };

  return (
    <button
      type="button"
      className={className}
      onClick={handleBack}
      title={title}
      aria-label={ariaLabel}
      {...buttonProps}
    >
      {showIcon && (
        <span className={iconClassName}>
          <BackIcon aria-hidden="true" focusable="false" />
        </span>
      )}
      {children}
    </button>
  );
}
