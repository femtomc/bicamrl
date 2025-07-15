import { readFileSync } from 'fs';
import { parse } from 'toml';
import { join } from 'path';

export interface MindConfig {
  default_provider: string;
  agents?: {
    enable_tools?: boolean;
  };
  llm_providers: {
    [key: string]: {
      type: string;
      enabled?: boolean;
      api_key?: string;
      api_base?: string;
      model?: string;
      temperature?: number;
    };
  };
}

export function loadMindConfig(): MindConfig {
  try {
    // Try to find Mind.toml in various locations
    const possiblePaths = [
      join(process.cwd(), 'Mind.toml'),
      join(process.cwd(), '../../Mind.toml'),
      join(process.cwd(), '../../../Mind.toml'),
      join(__dirname, '../../../../Mind.toml'),
      join(__dirname, '../../../../../Mind.toml'),
    ];
    
    let configContent: string | null = null;
    let configPath: string | null = null;
    
    for (const path of possiblePaths) {
      try {
        configContent = readFileSync(path, 'utf-8');
        configPath = path;
        break;
      } catch (e) {
        // Continue to next path
      }
    }
    
    if (!configContent) {
      console.warn('[Config] Mind.toml not found, using defaults');
      return getDefaultConfig();
    }
    
    console.log(`[Config] Loaded Mind.toml from ${configPath}`);
    const config = parse(configContent) as MindConfig;
    
    // Override default provider from environment if set
    if (process.env.DEFAULT_PROVIDER) {
      config.default_provider = process.env.DEFAULT_PROVIDER;
    }
    
    // Replace environment variables in config
    const configStr = JSON.stringify(config);
    const replacedStr = configStr.replace(/\$\{(\w+)\}/g, (match, envVar) => {
      return process.env[envVar] || match;
    });
    
    return JSON.parse(replacedStr);
  } catch (error) {
    console.error('[Config] Error loading Mind.toml:', error);
    return getDefaultConfig();
  }
}

function getDefaultConfig(): MindConfig {
  return {
    default_provider: 'mock',
    agents: {
      enable_tools: false
    },
    llm_providers: {
      mock: {
        type: 'mock',
        enabled: true
      }
    }
  };
}