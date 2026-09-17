import { describe, expect, it } from 'vitest';
import { renderButtonLayoutProvision } from './button-layout-provision.js';

const layout = {
  name: 'Front desk',
  vendorTemplate: 'generic',
  lineStart: 1,
  lineEnd: 4,
  buttons: [
    { type: 'blf', label: 'Sales', value: '1001', extensionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
    { type: 'speed_dial', label: 'Support', value: '1002' },
  ],
};

describe('renderButtonLayoutProvision', () => {
  it('renders generic JSON with indexed buttons', () => {
    const file = renderButtonLayoutProvision(layout, 'generic');
    expect(file.contentType).toBe('application/json');
    expect(file.filename).toBe('Front_desk.json');
    const parsed = JSON.parse(file.body) as {
      buttons: Array<{ index: number; label: string }>;
    };
    expect(parsed.buttons[0]?.index).toBe(1);
    expect(parsed.buttons[0]?.label).toBe('Sales');
  });

  it('renders yealink XML line keys', () => {
    const file = renderButtonLayoutProvision(layout, 'yealink');
    expect(file.contentType).toBe('application/xml');
    expect(file.body).toContain('<YealinkConfig>');
    expect(file.body).toContain('type="blf"');
    expect(file.body).toContain('label="Sales"');
    expect(file.body).toContain('index="2"');
  });
});
