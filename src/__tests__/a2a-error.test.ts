import { describe, expect, it } from 'vitest';
import { safeA2AErrorMessage } from '../core/conversation/a2a-error';

describe('external A2A safe failures', () => {
  it('does not reflect unknown errors or credentials', () => {
    expect(safeA2AErrorMessage('Authorization: Bearer private-key')).toBe('远程智能体操作失败。');
  });
  it('does not imply cancellation or retry when send is uncertain', () => {
    expect(safeA2AErrorMessage('A2A_SEND_OUTCOME_UNKNOWN')).toBe('Remote result is unknown; do not resend the call.');
  });
  it('distinguishes invalid credentials from an unknown send', () => {
    expect(safeA2AErrorMessage('A2A_EXTERNAL_AUTH_FAILED')).toContain('认证失败');
  });
});
