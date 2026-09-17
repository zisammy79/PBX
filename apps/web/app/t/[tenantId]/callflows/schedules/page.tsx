'use client';

import { CallflowResourcePage } from '@/components/callflow-resource-page';

export default function Page() {
  return (
    <CallflowResourcePage
      titleKey="callflow.schedulesTitle"
      apiPath="schedules"
      createBody={(name) => ({ name, timezone: "Asia/Jerusalem", scheduleType: "weektime", rules: [] })}
      nameFields={['name']}
    />
  );
}
