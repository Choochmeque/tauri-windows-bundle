import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TauriConfig, BundleConfig } from '../types.js';
import { DEFAULT_CAPABILITIES } from '../types.js';

export function generateBundleConfig(windowsDir: string, _tauriConfig: TauriConfig): void {
  const config: BundleConfig = {
    publisher: 'CN=YourCompany',
    publisherDisplayName: 'Your Company Name',
    capabilities: DEFAULT_CAPABILITIES,
    extensions: {
      shareTarget: false,
      fileAssociations: [],
      protocolHandlers: [],
    },
    signing: {
      pfx: null,
      pfxPassword: null,
    },
  };

  const configPath = path.join(windowsDir, 'bundle.config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

export function generateGitignore(windowsDir: string): void {
  const gitignorePath = path.join(windowsDir, '.gitignore');
  const content = `# Generated files
# Keep bundle.config.json and templates in git
`;
  fs.writeFileSync(gitignorePath, content);
}
