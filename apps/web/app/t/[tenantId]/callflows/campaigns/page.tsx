'use client';

import { PageHeader, EmptyState } from '@/components/app-shell';
import { useI18n } from '@/lib/i18n';

export default function CampaignsPage() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={t('nav.campaigns')} description={t('callflow.comingSoon')} />
      <EmptyState title={t('callflow.empty')} />
    </div>
  );
}
