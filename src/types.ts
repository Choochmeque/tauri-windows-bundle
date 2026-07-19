export interface TauriConfig {
  productName?: string;
  version?: string;
  identifier?: string;
  bundle?: {
    icon?: string[];
    shortDescription?: string;
    longDescription?: string;
    publisher?: string;
    resources?: (string | { src: string; target: string })[] | Record<string, string>;
    fileAssociations?: TauriFileAssociation[];
    windows?: {
      certificateThumbprint?: string;
    };
  };
}

/**
 * A `bundle.fileAssociations` entry as declared in tauri.conf.json (Tauri's own
 * schema). Mapped to the MSIX-oriented {@link FileAssociation} during a build so
 * associations can be declared once in tauri.conf.json instead of duplicated in
 * bundle.config.json. Windows-only fields (mimeType/role/rank) are accepted for
 * schema parity but unused on Windows.
 */
export interface TauriFileAssociation {
  ext: string[];
  name?: string;
  description?: string;
  mimeType?: string;
  role?: string;
  rank?: string;
}

export interface CapabilitiesConfig {
  general?: string[];
  device?: string[];
  restricted?: string[];
}

export interface BundleConfig {
  publisher?: string;
  publisherDisplayName?: string;
  resourceIndex?: {
    enabled?: boolean;
    keepConfig?: boolean;
  };
  assets?: {
    variants?: VariantOptions;
  };
  capabilities?: CapabilitiesConfig;
  extensions?: {
    shareTarget?: boolean;
    fileAssociations?: FileAssociation[];
    protocolHandlers?: ProtocolHandler[];
    startupTask?: StartupTask;
    contextMenus?: ContextMenu[];
    backgroundTasks?: BackgroundTask[];
    appExecutionAliases?: AppExecutionAlias[];
    appServices?: AppService[];
    toastActivation?: ToastActivation;
    autoplayHandlers?: AutoplayHandler[];
    printTaskSettings?: PrintTaskSettings;
    thumbnailHandlers?: ThumbnailHandler[];
    previewHandlers?: PreviewHandler[];
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

export interface StartupTask {
  enabled: boolean;
  taskId?: string;
}

export interface ContextMenu {
  name: string;
  fileTypes: string[];
  displayName?: string;
}

export interface BackgroundTask {
  name: string;
  type: 'timer' | 'systemEvent' | 'pushNotification';
}

export interface AppExecutionAlias {
  alias: string;
  displayName?: string;
}

export interface AppService {
  name: string;
  serverName?: string;
}

export interface ToastActivation {
  activationType: 'foreground' | 'background' | 'protocol';
  /** Explicit toast activator CLSID. When omitted, derived from the app identifier. */
  clsid?: string;
}

export interface AutoplayHandler {
  verb: string;
  actionDisplayName: string;
  contentEvent?: string;
  deviceEvent?: string;
}

export interface PrintTaskSettings {
  displayName: string;
}

export interface ThumbnailHandler {
  clsid: string;
  fileTypes: string[];
}

export interface PreviewHandler {
  clsid: string;
  fileTypes: string[];
}

export interface MergedConfig extends BundleConfig {
  publisher: string;
  publisherDisplayName: string;
  displayName: string;
  version: string;
  description: string;
  identifier: string;
}

export interface InitOptions {
  path?: string;
  config?: string;
  scale?: boolean;
  targetSize?: boolean;
  unplated?: boolean;
  lightUnplated?: boolean;
  allVariants?: boolean;
}

export interface VariantOptions {
  scale?: boolean;
  targetSize?: boolean;
  unplated?: boolean;
  lightUnplated?: boolean;
}

export const SCALE_FACTORS = [100, 125, 150, 200, 400] as const;
export const TARGET_SIZES = [16, 24, 32, 48, 256] as const;

export interface BuildOptions {
  arch?: string;
  config?: string;
  debug?: boolean;
  minWindows?: string;
  runner?: string;
  verbose?: boolean;
  regenerateAssets?: boolean;
}

export const DEFAULT_RUNNER = 'cargo';

export interface MsixAsset {
  name: string;
  size?: number;
  width?: number;
  height?: number;
  skipScaleVariants?: boolean;
}

export const MSIX_ASSETS: MsixAsset[] = [
  { name: 'StoreLogo.png', size: 50 },
  { name: 'Square44x44Logo.png', size: 44 },
  { name: 'Square150x150Logo.png', size: 150 },
  { name: 'Wide310x150Logo.png', width: 310, height: 150, skipScaleVariants: true },
];

export const DEFAULT_MIN_WINDOWS_VERSION = '10.0.17763.0';

// Valid Windows capabilities by type
// Reference: https://learn.microsoft.com/en-us/windows/uwp/packaging/app-capability-declarations

export const GENERAL_CAPABILITIES = [
  'internetClient',
  'internetClientServer',
  'privateNetworkClientServer',
  'allJoyn',
  'codeGeneration',
] as const;

export const DEVICE_CAPABILITIES = [
  'webcam',
  'microphone',
  'location',
  'proximity',
  'bluetooth',
  'serialcommunication',
  'usb',
  'humaninterfacedevice',
  'pointOfService',
  'lowLevelDevices',
  'gazeInput',
  'radios',
] as const;

export const RESTRICTED_CAPABILITIES = [
  'broadFileSystemAccess',
  'allowElevation',
  'appCaptureSettings',
  'appDiagnostics',
  'backgroundSpatialPerception',
  'deviceUnlock',
  'expandedResources',
  'extendedBackgroundTaskTime',
  'extendedExecutionBackgroundAudio',
  'extendedExecutionCritical',
  'extendedExecutionUnconstrained',
  'inputForegroundObservation',
  'locationHistory',
  'locationSystem',
  'networkingVpnProvider',
  'packageManagement',
  'packageQuery',
  'previewStore',
  'systemManagement',
  'unvirtualizedResources',
  'userSystemId',
] as const;

export const DEFAULT_CAPABILITIES: CapabilitiesConfig = {
  general: ['internetClient'],
};

export function validateCapabilities(config: CapabilitiesConfig): string[] {
  const errors: string[] = [];

  if (config.general) {
    for (const cap of config.general) {
      if (!(GENERAL_CAPABILITIES as readonly string[]).includes(cap)) {
        errors.push(
          `Invalid general capability: "${cap}". Valid: ${GENERAL_CAPABILITIES.join(', ')}`
        );
      }
    }
  }

  if (config.device) {
    for (const cap of config.device) {
      if (!(DEVICE_CAPABILITIES as readonly string[]).includes(cap)) {
        errors.push(
          `Invalid device capability: "${cap}". Valid: ${DEVICE_CAPABILITIES.join(', ')}`
        );
      }
    }
  }

  if (config.restricted) {
    for (const cap of config.restricted) {
      if (!(RESTRICTED_CAPABILITIES as readonly string[]).includes(cap)) {
        errors.push(
          `Invalid restricted capability: "${cap}". Valid: ${RESTRICTED_CAPABILITIES.join(', ')}`
        );
      }
    }
  }

  return errors;
}
