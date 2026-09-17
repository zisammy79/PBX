'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function Page() {
  return (
    <CallflowResourcePage
      titleKey="callflow.phonebooksTitle"
      apiPath="phonebooks"
      createBody={(name) => ({ displayName: name, number: name })}
      nameFields={['displayName','number']}
    />
  );
}
