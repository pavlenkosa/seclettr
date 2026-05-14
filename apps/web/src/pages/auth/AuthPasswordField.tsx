import type { ChangeEventHandler } from "react";
import { IconButton, InputField } from "@/components/ui";
import styles from "../AuthPage.module.css";

interface AuthPasswordFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly autoComplete: string;
  readonly placeholder: string;
  readonly showPassword: boolean;
  readonly onChange: ChangeEventHandler<HTMLInputElement>;
  readonly onToggle: () => void;
  readonly showLabel: string;
  readonly hideLabel: string;
}

export function AuthPasswordField({
  id,
  label,
  value,
  autoComplete,
  placeholder,
  showPassword,
  onChange,
  onToggle,
  showLabel,
  hideLabel,
}: Readonly<AuthPasswordFieldProps>) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <div className={styles.passwordWrapper}>
        <InputField
          id={id}
          size="lg"
          type={showPassword ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required
          minLength={8}
          wrapperClassName={styles.passwordInputShell}
        />
        <IconButton
          type="button"
          size={32}
          variant="ghost"
          active={showPassword}
          className={styles.passwordToggle}
          onClick={onToggle}
          aria-label={showPassword ? hideLabel : showLabel}
        >
          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
        </IconButton>
      </div>
    </div>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}
