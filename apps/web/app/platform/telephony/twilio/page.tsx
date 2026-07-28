import { redirect } from 'next/navigation';

export default function LegacyTwilioRedirect() {
  redirect('/platform/integrations/twilio');
}
