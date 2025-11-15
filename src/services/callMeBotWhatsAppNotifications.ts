import axios from 'axios';

/**
 * Send WhatsApp notification using CallMeBot API
 * @param phone - Phone number with country code (e.g., 51983724476)
 * @param message - Message text to send
 * @param apiKey - CallMeBot API key
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export const sendCallMeBotNotification = async (
  phone: string,
  message: string,
  apiKey: string,
): Promise<boolean> => {
  try {
    // Build URL manually to avoid double encoding
    const encodedMessage = encodeURIComponent(message);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMessage}&apikey=${apiKey}`;

    const response = await axios.get(url, {
      timeout: 10000, // 10 seconds timeout
    });

    if (response.status === 200) {
      console.log(`✅ CallMeBot notification sent to ${phone}`);
      return true;
    } else {
      console.error(
        `❌ CallMeBot notification failed with status: ${response.status}`,
      );
      return false;
    }
  } catch (error) {
    console.error('❌ Error sending CallMeBot notification:', error);
    return false;
  }
};
