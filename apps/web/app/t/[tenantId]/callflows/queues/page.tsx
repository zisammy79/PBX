'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function Page() {
  return (
    <CallflowResourcePage
      titleKey="callflow.queuesTitle"
      apiPath="queues"
      createBody={(name) => ({ name })}
      nameFields={['name']}
    />
  );
}
