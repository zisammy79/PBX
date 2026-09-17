'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function Page() {
  return (
    <CallflowResourcePage
      titleKey="callflow.conferencesTitle"
      apiPath="conferences"
      createBody={(name) => ({
        name,
        number: name.replace(/\D/g, '').slice(0, 16) || '9000',
      })}
      nameFields={['name']}
    />
  );
}
