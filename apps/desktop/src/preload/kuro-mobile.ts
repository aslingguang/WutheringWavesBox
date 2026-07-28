import { contextBridge } from 'electron';
import kuroMobileBridgeTemplate from '../main/kuro-mobile-bridge.js.txt?raw';

const argument = process.argv.find((value) => value.startsWith('--kuro-mobile-auth='));
if (argument) {
  const encoded = argument.slice('--kuro-mobile-auth='.length);
  const authJson = Buffer.from(encoded, 'base64url').toString('utf8');
  const bridgeScript = kuroMobileBridgeTemplate.replaceAll('__KJQ_AUTH_JSON__', authJson);
  if (bridgeScript.includes('__KJQ_AUTH_JSON__'))
    throw new Error('KURO_MOBILE_AUTH_INJECTION_FAILED');

  contextBridge.executeInMainWorld({
    func: (script: string) => {
      const installBridge = (): void => {
        new Function(script)();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installBridge, { once: true });
      } else {
        installBridge();
      }
    },
    args: [bridgeScript],
  });
}
