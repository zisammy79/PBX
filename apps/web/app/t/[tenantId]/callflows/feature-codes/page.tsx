'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function Page() {
  return (
    <CallflowResourcePage
      titleKey="callflow.featureCodesTitle"
      apiPath="feature-codes"
      createBody={(name) => ({ code: name, actionType: "dnd", description: name })}
      nameFields={['code','description']}
    />
  );
}
