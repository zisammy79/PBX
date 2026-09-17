'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function Page() {
  return (
    <CallflowResourcePage
      titleKey="callflow.blacklistTitle"
      apiPath="blacklist"
      createBody={(name) => ({ numberPattern: name })}
      nameFields={['numberPattern']}
    />
  );
}
