export type AccountMailPurpose = 'verification' | 'recovery' | 'notification';
export function accountMail(purpose: AccountMailPurpose, webOrigin: string, token = '') {
  const copy = {
    verification: {
      subject: 'Confirm your Commerce email',
      title: 'Confirm your email.',
      instructions:
        'One last step. Open the link below and confirm with your registered Commerce password.',
      action: 'Confirm email address',
      help: 'This link expires in 30 minutes. It does not change your password or sign you in.',
      path: '/verify-email#token=' + token,
    },
    recovery: {
      subject: 'Reset your Commerce password',
      title: 'A fresh start.',
      instructions:
        'Open the link below to choose a new Commerce password. You do not need your old password.',
      action: 'Reset password',
      help: 'This link expires in 30 minutes and can be used once. Opening it does not change your password or sign you in.',
      path: '/reset-password#token=' + token,
    },
    notification: {
      subject: 'Your Commerce password was reset',
      title: 'Password updated.',
      instructions:
        'Your Commerce password has been replaced and all existing sessions have been revoked. Sign in explicitly with your new password.',
      action: 'Review account access',
      help: 'If you did not authorize this reset, request password recovery using the link above. Recovery requires access to your registered inbox.',
      path: '/forgot-password',
    },
  }[purpose];
  const url = webOrigin + copy.path;
  return {
    subject: copy.subject,
    text:
      copy.subject +
      '\n\n' +
      copy.instructions +
      '\n' +
      url +
      '\n\n' +
      copy.help +
      (purpose === 'notification'
        ? ''
        : ' If you did not request this email, ignore it.'),
    // Email clients cannot load Tailwind; keep presentation self-contained.
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><style>
          @media(prefers-color-scheme:dark){.mail-body{background:#171e2e!important}.mail-card{background:#202a3d!important;border-color:#354159!important}.mail-text{color:#f1f4ff!important}.mail-muted{color:#b8c7e9!important}.mail-brand{color:#a9baff!important}}
          </style></head><body class="mail-body" style="margin:0;background:#f2f5fc;font-family:Arial,Helvetica,sans-serif;padding:32px 16px;color:#172033">
          <table role="presentation" style="width:100%;max-width:560px;margin:0 auto"><tr><td class="mail-brand" style="padding:8px 8px 24px;font-size:23px;font-weight:700;letter-spacing:-1px;color:#3555e8">commerce.</td></tr><tr><td class="mail-card" style="padding:32px 24px;background:#fff;border:1px solid #dce2ef;border-radius:20px">
          <p class="mail-brand" style="margin:0 0 20px;font-size:11px;font-weight:700;letter-spacing:2px;color:#3555e8">YOUR COMMERCE ACCOUNT</p>
          <h1 class="mail-text" style="margin:0 0 20px;font-size:30px;line-height:1.2;letter-spacing:-1px;color:#172033">${copy.title}</h1>
          <p class="mail-muted" style="margin:0 0 28px;font-size:15px;line-height:1.8;color:#52617c">${copy.instructions}</p>
          <p style="margin:0 0 28px"><a href="${url}" style="display:inline-block;padding:16px 22px;background:#3555e8;border-radius:12px;color:#fff;font-size:14px;font-weight:700;text-decoration:none">${copy.action}</a></p>
          <p class="mail-muted" style="margin:0;font-size:13px;line-height:1.8;color:#52617c">${copy.help}</p>
          </td></tr><tr><td class="mail-muted" style="padding:20px 8px;font-size:12px;line-height:1.8;color:#52617c">${purpose === 'notification' ? 'Keep your inbox secure. Never share your password or recovery links.' : 'If you did not request this email, you can ignore it.'}<br>Commerce. Thoughtfully built.</td></tr></table></body></html>`,
  };
}
