import type { ReactNode } from "react";
import { useNavigate, type To } from "react-router-dom";
import BackIcon from "../assets/back.svg?react";

type BackButtonProps = {
  className?: string;
  iconClassName?: string;
  title?: string;
  ariaLabel?: string;
  fallbackTo?: To;
  replaceOnFallback?: boolean;
  onBeforeBack?: () => boolean;
  children?: ReactNode;
};

export default function BackButton({
  className,
  iconClassName,
  title = "Go back",
  ariaLabel = "Go back",
  fallbackTo = "/",
  replaceOnFallback = true,
  onBeforeBack,
  children,
}: BackButtonProps) {
  const navigate = useNavigate();

  const handleBack = () => {
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
    >
      <span className={iconClassName}>
        <BackIcon aria-hidden="true" focusable="false" />
      </span>
      {children}
    </button>
  );
}
