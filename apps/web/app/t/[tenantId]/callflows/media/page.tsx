'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function Page() {
  return (
    <CallflowResourcePage
      titleKey="callflow.mediaTitle"
      apiPath="media-files"
      createBody={(name) => ({
        name,
        format: 'wav',
        sizeBytes: 1,
        md5: 'd41d8cd98f00b204e9800998ecf8427e',
        storageKey: `pending/${name}`,
      })}
      nameFields={['name']}
    />
  );
}
