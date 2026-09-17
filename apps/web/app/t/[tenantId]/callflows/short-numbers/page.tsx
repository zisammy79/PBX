'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function Page() {
  return (
    <CallflowResourcePage
      titleKey="callflow.shortNumbersTitle"
      apiPath="short-numbers"
      createBody={(name) => ({ shortCode: name, destinationType: "extension", destinationValue: name })}
      nameFields={['shortCode']}
    />
  );
}
