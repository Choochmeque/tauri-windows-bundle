export interface TauriConfig {
  productName?: string;
  version?: string;
  identifier?: string;
  bundle?: {
    icon?: string[];
    shortDescription?: string;
    longDescription?: string;
    resources?: (string | { src: string; target: string })[];
    windows?: {
      certificateThumbprint?: string;
    };
  };
}

export interface BundleConfig {
  publisher: string;
  publisherDisplayName: string;
  capabilities?: string[];
  extensions?: {
    shareTarget?: boolean;
    fileAssociations?: FileAssociation[];
    protocolHandlers?: ProtocolHandler[];
  };
  signing?: {
    pfx?: string | null;
    pfxPassword?: string | null;
  };
}

export interface FileAssociation {
  name: string;
  extensions: string[];
  description?: string;
}

export interface ProtocolHandler {
  name: string;
  displayName?: string;
}

export interface MergedConfig extends BundleConfig {
  displayName: string;
  version: string;
  description: string;
  identifier: string;
}

export interface InitOptions {
  path?: string;
}

export interface BuildOptions {
  arch?: string;
  release?: boolean;
  minWindows?: string;
}

export interface MsixAsset {
  name: string;
  size?: number;
  width?: number;
  height?: number;
}

export const MSIX_ASSETS: MsixAsset[] = [
  { name: 'StoreLogo.png', size: 50 },
  { name: 'Square44x44Logo.png', size: 44 },
  { name: 'Square150x150Logo.png', size: 150 },
  { name: 'Wide310x150Logo.png', width: 310, height: 150 },
  { name: 'LargeTile.png', size: 310 },
];

export const DEFAULT_MIN_WINDOWS_VERSION = '10.0.17763.0';
export const DEFAULT_CAPABILITIES = ['internetClient'];
