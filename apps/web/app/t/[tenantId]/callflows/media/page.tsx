'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CallflowResourcePage } from '@/components/callflow-resource-page';
import { useI18n } from '@/lib/i18n';

export default function Page() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { t } = useI18n();

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <Link href={`/t/${tenantId}/callflows/moh`} className="btn btn-secondary">
          {t('callflow.mohLink')}
        </Link>
      </div>
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
    </div>
  );
}
