'use client';

import { useState } from 'react';

export function OneTimeSecretPanel({
  title,
  intro,
  fields,
  advancedFields,
  statusLabel,
  statusTone = 'warning',
  onDismiss,
}: {
  title: string;
  intro?: string;
  fields: Array<{ label: string; value: string }>;
  advancedFields?: Array<{ label: string; value: string }>;
  statusLabel?: string;
  statusTone?: 'success' | 'warning';
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="alert alert-warning" role="alert">
      <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{title}</h2>
      {intro ? <p>{intro}</p> : (
        <p>This secret is shown once and cannot be retrieved again. Copy it now and store it securely.</p>
      )}
      {statusLabel ? (
        <p>
          Provisioning:{' '}
          <span className={statusTone === 'success' ? 'text-success' : 'text-warning'}>
            {statusLabel}
          </span>
        </p>
      ) : null}
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
      {advancedFields && advancedFields.length > 0 ? (
        <>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginBottom: '0.75rem' }}
            onClick={() => setShowAdvanced((open) => !open)}
          >
            {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
          </button>
          {showAdvanced ? (
            <div>
              {advancedFields.map((field) => (
                <p key={field.label}>
                  {field.label}: {field.value}
                </p>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
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
  confirmTextRequired,
  confirmTextLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmTextRequired?: string;
  confirmTextLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  if (!open) return null;
  const canConfirm =
    !confirmTextRequired || confirmText.trim() === confirmTextRequired.trim();
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
        <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
        {confirmTextRequired ? (
          <div className="field">
            <label className="label" htmlFor="confirm-text">
              {confirmTextLabel ?? `Type ${confirmTextRequired} to confirm`}
            </label>
            <input
              id="confirm-text"
              className="input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
