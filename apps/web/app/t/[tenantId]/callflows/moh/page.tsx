'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function MohPage() {
  return (
    <CallflowResourcePage
      titleKey="callflow.mohTitle"
      apiPath="moh-classes"
      createBody={(name) => ({
        name,
        mediaFileIds: [],
        randomize: false,
        isDefault: false,
      })}
      nameFields={['name']}
    />
  );
}
