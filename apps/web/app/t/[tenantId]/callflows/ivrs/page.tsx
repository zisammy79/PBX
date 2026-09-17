'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function Page() {
  return (
    <CallflowResourcePage
      titleKey="callflow.ivrsTitle"
      apiPath="ivrs"
      createBody={(name) => ({ name })}
      nameFields={['name']}
    />
  );
}
