import { describe, expect, it } from 'vitest';

import { parseCcSwitchProviderRows } from '../cc-switch-provider-sync.js';

describe('parseCcSwitchProviderRows', () => {
  it('maps Claude, Codex and Pi rows to stable Cindy custom providers', () => {
    const result = parseCcSwitchProviderRows([
      {
        id: 'claude-1',
        app_type: 'claude',
        name: 'Claude Relay',
        settings_config: JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: 'https://claude.example/v1/',
            ANTHROPIC_AUTH_TOKEN: 'sk-claude-test',
            ANTHROPIC_MODEL: 'claude-test',
          },
        }),
        meta: '{}',
      },
      {
        id: 'codex-1',
        app_type: 'codex',
        name: 'Codex Relay',
        settings_config: JSON.stringify({
          auth: { OPENAI_API_KEY: 'sk-codex-test' },
          config: [
            'model_provider = "relay"',
            'model = "gpt-test"',
            '',
            '[model_providers.relay]',
            'base_url = "https://codex.example/v1"',
            'wire_api = "responses"',
          ].join('\n'),
        }),
        meta: '{}',
      },
      {
        id: 'pi-1',
        app_type: 'pi',
        name: 'Pi Relay',
        settings_config: JSON.stringify({
          baseUrl: 'https://pi.example/v1',
          apiKey: 'sk-pi-test',
          api: 'openai-completions',
          models: [{ id: 'pi-test', name: 'Pi Test' }],
        }),
        meta: '{}',
      },
    ]);

    expect(result.skippedCount).toBe(0);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((candidate) => candidate.agent)).toEqual([
      'claude-code',
      'codex',
      'pi',
    ]);
    expect(result.candidates[0]?.config.runtimes['claude-code']?.baseUrl).toBe(
      'https://claude.example/v1',
    );
    expect(result.candidates[1]?.config.runtimes.codex?.wireProtocol).toBe('openai-responses');
    expect(result.candidates[2]?.config.runtimes.pi?.models[0]?.piApi).toBe('openai-completions');
    expect(result.candidates[0]?.keys['claude-code']).toBe('sk-claude-test');
  });

  it('skips managed OAuth and invalid public endpoints without leaking headers', () => {
    const result = parseCcSwitchProviderRows([
      {
        id: 'oauth',
        app_type: 'claude',
        name: 'OAuth',
        settings_config: JSON.stringify({
          env: { ANTHROPIC_BASE_URL: 'https://oauth.example/v1', ANTHROPIC_AUTH_TOKEN: 'token' },
          auth: { auth_mode: 'chatgpt' },
        }),
        meta: '{}',
      },
      {
        id: 'bad',
        app_type: 'codex',
        name: 'Bad',
        settings_config: JSON.stringify({
          auth: { OPENAI_API_KEY: 'sk-test' },
          config: [
            'model_provider = "relay"',
            '[model_providers.relay]',
            'base_url = "file:///tmp/not-http"',
            'wire_api = "responses"',
            'http_headers = { Authorization = "Bearer should-not-leak" }',
          ].join('\n'),
        }),
        meta: '{}',
      },
    ]);

    expect(result.candidates).toHaveLength(0);
    expect(result.skippedCount).toBe(2);
    expect(JSON.stringify(result)).not.toContain('should-not-leak');
  });

  it('bounds malformed rows and ignores unsupported applications', () => {
    const result = parseCcSwitchProviderRows([
      {
        id: 'unsupported',
        app_type: 'gemini',
        name: 'Gemini',
        settings_config: '{}',
        meta: '{}',
      },
      {
        id: 'broken',
        app_type: 'claude',
        name: 'Broken',
        settings_config: '{not-json',
        meta: '{}',
      },
    ]);

    expect(result.candidates).toEqual([]);
    expect(result.skippedCount).toBe(2);
  });

  it('rejects URLs carrying query or fragment data', () => {
    const result = parseCcSwitchProviderRows([
      {
        id: 'query-secret',
        app_type: 'claude',
        name: 'Query secret',
        settings_config: JSON.stringify({
          env: {
            ANTHROPIC_BASE_URL: 'https://api.example.test/v1?api_key=secret',
            ANTHROPIC_AUTH_TOKEN: 'fixture-key',
          },
        }),
        meta: '{}',
      },
    ]);

    expect(result.candidates).toEqual([]);
    expect(result.skippedCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
