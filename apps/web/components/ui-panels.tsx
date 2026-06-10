'use client';

import { useState } from 'react';

export function OneTimeSecretPanel({
  title,
  fields,
  onDismiss,
}: {
  title: string;
  fields: Array<{ label: string; value: string }>;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <div className="alert alert-warning" role="alert">
      <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{title}</h2>
      <p>This secret is shown once and cannot be retrieved again. Copy it now and store it securely.</p>
      {fields.map((field) => (
        <div key={field.label} className="field">
          <span className="label">{field.label}</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="input" readOnly value={field.value} aria-label={field.label} />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(field.value);
                setCopied(field.label);
              }}
            >
              Copy
            </button>
          </div>
          {copied === field.label ? <div className="field-error">Copied</div> : null}
        </div>
      ))}
      <button type="button" className="btn btn-primary" onClick={onDismiss}>
        I have saved the credentials
      </button>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16,24,40,0.45)',
        display: 'grid',
        placeItems: 'center',
        padding: '1rem',
        zIndex: 50,
      }}
    >
      <div className="card" style={{ maxWidth: 420, width: '100%' }}>
        <h2 id="confirm-title" style={{ marginTop: 0 }}>
          {title}
        </h2>
        <p>{message}</p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
