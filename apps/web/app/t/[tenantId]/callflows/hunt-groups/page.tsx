'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function Page() {
  return (
    <CallflowResourcePage
      titleKey="callflow.huntTitle"
      apiPath="ring-groups"
      createBody={(name) => ({ name })}
      nameFields={['name']}
    />
  );
}
