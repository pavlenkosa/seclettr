import type { ChangeEventHandler } from "react";
import { InputField } from "@/components/ui";
import styles from "../AuthPage.module.css";

interface AuthUsernameFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly invalid: boolean;
  readonly onChange: ChangeEventHandler<HTMLInputElement>;
}

export function AuthUsernameField({
  id,
  label,
  value,
  placeholder,
  invalid,
  onChange,
}: Readonly<AuthUsernameFieldProps>) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <InputField
        id={id}
        size="lg"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required
        minLength={3}
        maxLength={32}
        pattern="[a-zA-Z0-9._-]+"
        aria-invalid={invalid}
      />
    </div>
  );
}
