import { redirect } from 'next/navigation';

export default function LegacyPhoneNumbersRedirect() {
  redirect('/platform/integrations/phone-numbers');
}
