import type { InputHTMLAttributes, ReactNode } from 'react';

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: ReactNode;
  labelAction?: ReactNode;
  error?: string;
  endAdornment?: ReactNode;
}

export function AuthField({
  label,
  icon,
  labelAction,
  error,
  endAdornment,
  className,
  id,
  ...inputProps
}: AuthFieldProps) {
  return (
    <div className="jv-auth-field">
      <div className="jv-auth-field__label-row">
        <label htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      <div className={`jv-auth-input${error ? ' jv-auth-input--error' : ''}`}>
        <span className="jv-auth-input__icon" aria-hidden="true">{icon}</span>
        <input id={id} className={className} aria-invalid={Boolean(error)} {...inputProps} />
        {endAdornment}
      </div>
      {error && <p className="jv-auth-field__error" role="alert">{error}</p>}
    </div>
  );
}
