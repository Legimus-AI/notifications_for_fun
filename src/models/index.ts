// Models
export { default as ApiKey } from './ApiKeys';
export { default as Channel } from './Channels';
export { default as NotificationLog } from './NotificationLogs';
export { default as Webhook } from './Webhooks';
export { default as Cities } from './Cities';
export { default as Users } from './Users';
export { default as ForgotPassword } from './ForgotPassword';
export { default as UserAccess } from './UserAccess';
export { WhatsAppAuthState, WhatsAppAuthKey } from './WhatsAppAuthState';

// Interfaces
export type { IApiKey } from './ApiKeys';
export type { IChannel, ChannelConfig } from './Channels';
export type { INotification, NotificationPayload } from './NotificationLogs';
export type { IWebhook } from './Webhooks';
export type { IWhatsAppAuthState, IWhatsAppAuthKey } from './WhatsAppAuthState';

// Dynamic model loader function
import fs from 'fs';
import path from 'path';

const modelsPath = `${__dirname}/`;

async function loadModels() {
  /*
   * Load models dynamically
   */

  // Read all files in the directory
  const files = fs.readdirSync(modelsPath);
  for (const file of files) {
    // Get the name of the file without its extension
    const modelFile = path.basename(file, path.extname(file));

    // Prevents loading of this file
    if (modelFile !== 'index') {
      // Dynamically import the model
      await import(`./${modelFile}`);
    }
  }
}

export default loadModels;
