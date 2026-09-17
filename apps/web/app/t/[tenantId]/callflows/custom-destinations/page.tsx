'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function Page() {
  return (
    <CallflowResourcePage
      titleKey="callflow.customDestTitle"
      apiPath="custom-destinations"
      createBody={(name) => ({ name, destinationType: "forward_number", config: { number: name } })}
      nameFields={['name']}
    />
  );
}
