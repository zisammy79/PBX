'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function Page() {
  return (
    <CallflowResourcePage
      titleKey="callflow.pagingTitle"
      apiPath="paging-groups"
      createBody={(name) => ({
        name,
        number: name.replace(/\D/g, '').slice(0, 16) || '8000',
      })}
      nameFields={['name']}
    />
  );
}
