import dns from 'node:dns';
import ipaddr from 'ipaddr.js';
import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@xs-rag/shared';
import { ApiException } from '../common/error-envelope.filter.js';

export class UrlGuard {
  static dnsLookup: typeof dns.lookup = dns.lookup;

  static validateIpAddress(ipStr: string): void {
    if (!ipaddr.isValid(ipStr)) {
      throw new ApiException(
        ErrorCode.URL_NOT_ALLOWED,
        'Invalid IP address',
        HttpStatus.BAD_REQUEST,
      );
    }

    const parsed = ipaddr.parse(ipStr);
    let range: string;
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
      range = (parsed as ipaddr.IPv6).toIPv4Address().range();
    } else {
      range = parsed.range();
    }

    if (range !== 'unicast') {
      throw new ApiException(
        ErrorCode.URL_NOT_ALLOWED,
        `URL target is in disallowed IP range: ${range}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  static async validateUrl(urlStr: string): Promise<URL> {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new ApiException(
        ErrorCode.URL_NOT_ALLOWED,
        'Invalid URL format',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ApiException(
        ErrorCode.URL_NOT_ALLOWED,
        'Only http and https protocols are supported',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (parsed.username || parsed.password) {
      throw new ApiException(
        ErrorCode.URL_NOT_ALLOWED,
        'URLs with user credentials are not allowed',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      throw new ApiException(
        ErrorCode.URL_NOT_ALLOWED,
        'Only standard ports 80 and 443 are allowed',
        HttpStatus.BAD_REQUEST,
      );
    }

    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw new ApiException(
        ErrorCode.URL_NOT_ALLOWED,
        'Localhost is not allowed',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (ipaddr.isValid(hostname)) {
      this.validateIpAddress(hostname);
      return parsed;
    }

    try {
      const addresses = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
        UrlGuard.dnsLookup(hostname, { all: true }, (err, res) => {
          if (err) return reject(err);
          if (Array.isArray(res)) {
            return resolve(res);
          }
          if (res) {
            return resolve([{ address: res, family: 4 }]);
          }
          return resolve([]);
        });
      });

      if (!addresses || addresses.length === 0) {
        throw new ApiException(
          ErrorCode.URL_NOT_ALLOWED,
          'Could not resolve hostname',
          HttpStatus.BAD_REQUEST,
        );
      }

      for (const addr of addresses) {
        this.validateIpAddress(addr.address);
      }
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        throw err;
      }
      throw new ApiException(
        ErrorCode.URL_NOT_ALLOWED,
        'Failed to resolve URL hostname',
        HttpStatus.BAD_REQUEST,
      );
    }

    return parsed;
  }

  static normalizeUrl(urlStr: string): string {
    const parsed = new URL(urlStr);
    parsed.hash = '';
    return parsed.toString();
  }
}
