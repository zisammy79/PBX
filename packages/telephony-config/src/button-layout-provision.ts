export type ButtonLayoutVendor = 'generic' | 'yealink' | 'fanvil' | string;

export interface ButtonLayoutButtonRecord {
  type: string;
  label: string;
  value: string;
  extensionId?: string;
}

export interface ButtonLayoutProvisionInput {
  name: string;
  vendorTemplate: string;
  lineStart: number;
  lineEnd: number;
  buttons: ButtonLayoutButtonRecord[];
}

export interface ButtonLayoutProvisionFile {
  contentType: string;
  filename: string;
  body: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 64) || 'layout';
}

function renderGeneric(layout: ButtonLayoutProvisionInput): ButtonLayoutProvisionFile {
  const payload = {
    name: layout.name,
    vendor: layout.vendorTemplate,
    lineStart: layout.lineStart,
    lineEnd: layout.lineEnd,
    buttons: layout.buttons.map((button, index) => ({
      index: layout.lineStart + index,
      type: button.type,
      label: button.label,
      value: button.value,
      ...(button.extensionId ? { extensionId: button.extensionId } : {}),
    })),
  };

  return {
    contentType: 'application/json',
    filename: `${sanitizeFilename(layout.name)}.json`,
    body: `${JSON.stringify(payload, null, 2)}\n`,
  };
}

function renderYealink(layout: ButtonLayoutProvisionInput): ButtonLayoutProvisionFile {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<YealinkConfig>',
    `  <Layout name="${escapeXml(layout.name)}" lineStart="${layout.lineStart}" lineEnd="${layout.lineEnd}">`,
  ];

  layout.buttons.forEach((button, index) => {
    const lineKey = layout.lineStart + index;
    lines.push(
      `    <LineKey index="${lineKey}" type="${escapeXml(button.type)}" label="${escapeXml(button.label)}" value="${escapeXml(button.value)}" />`,
    );
  });

  lines.push('  </Layout>', '</YealinkConfig>', '');
  return {
    contentType: 'application/xml',
    filename: `${sanitizeFilename(layout.name)}.xml`,
    body: lines.join('\n'),
  };
}

function renderFanvil(layout: ButtonLayoutProvisionInput): ButtonLayoutProvisionFile {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<FanvilConfig>',
    `  <ButtonLayout name="${escapeXml(layout.name)}" vendor="fanvil">`,
    `    <LineRange start="${layout.lineStart}" end="${layout.lineEnd}" />`,
  ];

  layout.buttons.forEach((button, index) => {
    lines.push(
      `    <Key index="${layout.lineStart + index}" type="${escapeXml(button.type)}" label="${escapeXml(button.label)}" target="${escapeXml(button.value)}" />`,
    );
  });

  lines.push('  </ButtonLayout>', '</FanvilConfig>', '');
  return {
    contentType: 'application/xml',
    filename: `${sanitizeFilename(layout.name)}-fanvil.xml`,
    body: lines.join('\n'),
  };
}

export function renderButtonLayoutProvision(
  layout: ButtonLayoutProvisionInput,
  vendor: ButtonLayoutVendor,
): ButtonLayoutProvisionFile {
  switch (vendor) {
    case 'yealink':
      return renderYealink(layout);
    case 'fanvil':
      return renderFanvil(layout);
    case 'generic':
    default:
      return renderGeneric(layout);
  }
}
