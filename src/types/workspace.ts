export type WorkspaceMode = 'chat' | 'agent' | 'companion';

export type CompanionAnimState = 'idle' | 'talking' | 'using_tool' | 'thinking';

export type ProviderType = 'gemini' | 'openai_compatible' | 'anthropic' | 'ollama';

export interface ProviderConfig {
  id: string;
  label: string;
  providerType: ProviderType;
  modelId: string;
  endpointUrl?: string;
  customApiKey?: string;
  apiKeyUrl?: string;
  docsUrl?: string;
  suggestedModels?: string[];
  description?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  data: string; // base64 without data: prefix
  previewUrl: string;
}

export interface FileAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  content: string;
  kind: 'file' | 'url';
  sourceUrl?: string;
}

export interface AgentToolEvent {
  id: string;
  tool: string;
  args?: Record<string, unknown>;
  status: 'running' | 'done' | 'error';
  output?: string;
}

export type ActivityKind =
  | 'thinking'
  | 'memory'
  | 'search'
  | 'command'
  | 'code'
  | 'file'
  | 'folder'
  | 'web'
  | 'sandbox'
  | 'companion'
  | 'theme'
  | 'error';

export interface AgentStepEvent {
  id: string;
  kind: ActivityKind;
  label: string;
  detail?: string;
  output?: string;
  timestamp: number;
  status: 'running' | 'done' | 'error';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: number;
  modelUsed?: string;
  thinkingUsed?: boolean;
  sources?: GroundingSource[];
  images?: ImageAttachment[];
  files?: FileAttachment[];
  toolEvents?: AgentToolEvent[];
  activitySteps?: AgentStepEvent[];
  feedback?: 'good' | 'bad' | null;
  encrypted?: boolean;
  iv?: string;
}

export interface ProjectFolder {
  id: string;
  name: string;
  description?: string;
  pinned?: boolean;
  defaultMode?: 'chat' | 'agent';
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  summary?: string;
  mode: WorkspaceMode;
  providerId: string;
  modelId: string;
  projectId?: string;
  messages: ChatMessage[];
  pinned?: boolean;
  encrypted?: boolean;
  iv?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeviceSyncNode {
  id: string;
  deviceName: string;
  platform: 'windows' | 'android' | 'web';
  companionMode: 'overlay' | 'background_service' | 'web_viewport';
  companionState: CompanionAnimState;
  e2eeFingerprint?: string;
  lastSyncAt: number;
}
