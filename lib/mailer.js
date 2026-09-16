import { getGmailForEmail } from './google';

export async function sendUploadInvites({ toEmails, personName, message, uploadUrl, ownerEmail }) {
  const gmail = await getGmailForEmail(ownerEmail);
  const from = `Farewell Team <${ownerEmail}>`;
  const results = [];

  for (const email of toEmails) {
    try {
      const raw = encodeRfc822({
        from,
        to: email,
        subject: `A note for ${personName}'s farewell`,
        html: renderInviteEmail({ personName, message, uploadUrl }),
        text: renderInviteText({ personName, message, uploadUrl }),
      });
      const { data } = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });
      results.push({ email, data: { id: data.id }, error: null });
    } catch (err) {
      const messageText = err.errors?.[0]?.message || err.message;
      results.push({ email, data: null, error: { message: messageText } });
    }
  }

  return results;
}

function encodeRfc822({ from, to, subject, html, text }) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const boundary = `farewell_${Date.now()}`;
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return Buffer.from(message).toString('base64url');
}

function renderInviteText({ personName, message, uploadUrl }) {
  return `${message}

Add a photo of your note (or a message) for ${personName} here:
${uploadUrl}

Anyone with this link can add a photo — please don't forward it outside the team.
`;
}

function renderInviteEmail({ personName, message, uploadUrl }) {
  const escapedMessage = String(message).replace(/\n/g, '<br/>');
  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; color: #1b2430;">
      <p style="font-size: 16px; line-height: 1.6;">${escapedMessage}</p>
      <p style="font-size: 16px; line-height: 1.6;">
        Add a photo of your note (or a message) for ${personName} here:
      </p>
      <p style="margin: 24px 0;">
        <a href="${uploadUrl}"
           style="background: #c9a227; color: #1b2430; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-family: Arial, sans-serif; font-weight: bold;">
          Upload your note
        </a>
      </p>
      <p style="font-size: 13px; color: #6b6459;">
        Anyone with this link can add a photo — please don't forward it outside the team.
      </p>
    </div>
  `;
}
