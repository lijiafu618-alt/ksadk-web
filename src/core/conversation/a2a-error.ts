/** Display stable A2A failures without rendering third-party response bodies. */
export function safeA2AErrorMessage(code: unknown): string {
  switch (code) {
    case 'A2A_SEND_OUTCOME_UNKNOWN':
      return 'Remote result is unknown; do not resend the call.';
    case 'A2A_EXTERNAL_AUTH_FAILED':
      return '第三方智能体认证失败，请检查凭据。';
    case 'A2A_CREDENTIAL_UNAVAILABLE':
      return '第三方凭据已停用或过期。';
    case 'A2A_EXTERNAL_ADMISSION_DISABLED':
      return '外部智能体新调用已关闭。';
    case 'A2A_EXTERNAL_OPERATION_UNSUPPORTED':
      return '第三方智能体不支持此操作。';
    case 'A2A_EXTERNAL_PREFLIGHT_FAILED':
      return '外部调用准备失败，消息尚未发送。';
    default:
      return '远程智能体操作失败。';
  }
}
