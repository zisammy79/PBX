import { Inject, Injectable } from '@nestjs/common';
import { validationError } from '@pbx/contracts';
import Twilio from 'twilio';
import type { Twilio as TwilioClient } from 'twilio';
import { CONFIG } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import { isTwilioConfigured, requireTwilioConfig, type TwilioConfig } from '../../config.js';
import { assertIsraeliE164 } from './twilio-israel.js';
import { redactE164, redactSid, redactUri } from './twilio-redact.js';

export type TwilioTrunkStatus = {
  trunkSid: string;
  friendlyName: string | null;
  terminationSipUri: string | null;
  originationUriConfigured: boolean;
  originationUriMatches: boolean;
  ipAclConfigured: boolean;
  ipAclContainsPbx: boolean;
  attachedNumberCount: number;
};

export type TwilioListedNumber = {
  sid: string;
  e164: string;
  friendlyName: string | null;
  trunkSid: string | null;
};

@Injectable()
export class TwilioService {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  isConfigured(): boolean {
    return isTwilioConfigured(this.config);
  }

  getStatus() {
    const configured = this.isConfigured();
    return {
      configured,
      accountSid: configured ? redactSid(this.config.twilioAccountSid) : null,
      trunkSid: configured ? this.config.twilioTrunkSid : null,
      terminationSipUri: configured ? redactUri(this.config.twilioTerminationSipUri) : null,
      originationSipUri: configured ? this.config.pbxOriginationSipUri : null,
      publicIp: configured ? this.config.pbxPublicIp : null,
      testDid: configured ? redactE164(this.config.twilioTestDid) : null,
      defaultCountry: this.config.twilioDefaultCountry,
      defaultNumberType: this.config.twilioDefaultNumberType,
      numberAssignmentMode: this.config.twilioNumberAssignmentMode,
    };
  }

  async validateCredentials(): Promise<{ ok: true; accountSid: string | null }> {
    const twilio = this.createClient();
    const account = await twilio.api.accounts(this.twilioConfig().accountSid).fetch();
    return { ok: true, accountSid: redactSid(account.sid) };
  }

  async getTrunkStatus(): Promise<TwilioTrunkStatus> {
    const cfg = this.twilioConfig();
    const client = this.createClient();
    const trunk = await client.trunking.v1.trunks(cfg.trunkSid).fetch();

    const originationUrls = await client.trunking.v1.trunks(cfg.trunkSid).originationUrls.list();
    const target = cfg.originationSipUri.toLowerCase();
    const originationMatch = originationUrls.some((row) => row.sipUrl?.toLowerCase() === target);

    const acls = await client.trunking.v1.trunks(cfg.trunkSid).ipAccessControlLists.list();
    let ipAclContainsPbx = false;
    for (const acl of acls) {
      const ips = await client.sip.ipAccessControlLists(acl.sid).ipAddresses.list();
      if (ips.some((ip) => ip.ipAddress === cfg.publicIp)) {
        ipAclContainsPbx = true;
        break;
      }
    }

    const attached = await client.trunking.v1.trunks(cfg.trunkSid).phoneNumbers.list();

    return {
      trunkSid: trunk.sid,
      friendlyName: trunk.friendlyName ?? null,
      terminationSipUri: trunk.domainName ? `sip:${trunk.domainName}` : cfg.terminationSipUri,
      originationUriConfigured: originationUrls.length > 0,
      originationUriMatches: originationMatch,
      ipAclConfigured: acls.length > 0,
      ipAclContainsPbx,
      attachedNumberCount: attached.length,
    };
  }

  async syncTrunk(): Promise<TwilioTrunkStatus> {
    const cfg = this.twilioConfig();
    const client = this.createClient();

    const originationUrls = await client.trunking.v1.trunks(cfg.trunkSid).originationUrls.list();
    const target = cfg.originationSipUri.toLowerCase();
    const hasOrigination = originationUrls.some((row) => row.sipUrl?.toLowerCase() === target);
    if (!hasOrigination) {
      await client.trunking.v1.trunks(cfg.trunkSid).originationUrls.create({
        friendlyName: 'PBX production',
        sipUrl: cfg.originationSipUri,
        priority: 10,
        weight: 10,
        enabled: true,
      });
    }

    const acls = await client.trunking.v1.trunks(cfg.trunkSid).ipAccessControlLists.list();
    if (acls.length === 0) {
      const acl = await client.sip.ipAccessControlLists.create({
        friendlyName: `PBX ${cfg.publicIp}`,
      });
      await client.sip.ipAccessControlLists(acl.sid).ipAddresses.create({
        friendlyName: 'PBX production',
        ipAddress: cfg.publicIp,
      });
      await client.trunking.v1.trunks(cfg.trunkSid).ipAccessControlLists.create({
        ipAccessControlListSid: acl.sid,
      });
    } else {
      let found = false;
      for (const acl of acls) {
        const ips = await client.sip.ipAccessControlLists(acl.sid).ipAddresses.list();
        if (ips.some((ip) => ip.ipAddress === cfg.publicIp)) {
          found = true;
          break;
        }
      }
      if (!found) {
        const aclSid = acls[0]!.sid;
        await client.sip.ipAccessControlLists(aclSid).ipAddresses.create({
          friendlyName: 'PBX production',
          ipAddress: cfg.publicIp,
        });
      }
    }

    return this.getTrunkStatus();
  }

  async listOwnedNumbers(): Promise<TwilioListedNumber[]> {
    const client = this.createClient();
    const numbers = await client.incomingPhoneNumbers.list({ limit: 200 });
    return numbers.map((row) => ({
      sid: row.sid,
      e164: row.phoneNumber,
      friendlyName: row.friendlyName ?? null,
      trunkSid: row.trunkSid ?? null,
    }));
  }

  async findNumberByE164(e164: string): Promise<TwilioListedNumber | null> {
    const normalized = assertIsraeliE164(e164);
    const numbers = await this.listOwnedNumbers();
    return numbers.find((n) => n.e164 === normalized) ?? null;
  }

  async attachNumberToTrunk(phoneNumberSid: string): Promise<void> {
    const cfg = this.twilioConfig();
    const client = this.createClient();
    await client.incomingPhoneNumbers(phoneNumberSid).update({ trunkSid: cfg.trunkSid });
  }

  async searchAvailableIsraeliLocal(limit = 5): Promise<Array<{ e164: string; friendlyName: string | null }>> {
    const cfg = this.twilioConfig();
    const client = this.createClient();
    const available = await client.availablePhoneNumbers(cfg.defaultCountry).local.list({ limit });
    return available.map((row) => ({
      e164: row.phoneNumber,
      friendlyName: row.friendlyName ?? null,
    }));
  }

  async purchaseIsraeliLocalNumber(): Promise<{ sid: string; e164: string }> {
    const cfg = this.twilioConfig();
    const client = this.createClient();
    const candidates = await this.searchAvailableIsraeliLocal(1);
    if (!candidates[0]) {
      throw validationError({ twilio: 'No available Israeli local numbers found' });
    }
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: candidates[0].e164,
      trunkSid: cfg.trunkSid,
    });
    return { sid: purchased.sid, e164: purchased.phoneNumber };
  }

  twilioConfig(): TwilioConfig {
    return requireTwilioConfig(this.config);
  }

  createClient(): TwilioClient {
    const cfg = this.twilioConfig();
    return Twilio(cfg.apiKeySid, cfg.apiKeySecret, { accountSid: cfg.accountSid });
  }
}
